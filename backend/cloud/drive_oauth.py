"""The free fix for Drive backup (see config.py's comment above the two
path getters this module uses): a service account can sync Sheets but
can never upload a NEW file to a personal Drive, because it has no
storage quota of its own. The owner's own Google account has plenty --
this module borrows it, once, via a standard OAuth "Desktop app" flow,
and keeps a refresh token afterwards so every backup after that first
sign-in runs unattended, exactly like the service account did.

Deliberately scoped to drive.file, not the broader drive scope the
service account uses -- this identity only ever needs to create and
later update the one backup file it makes itself inside the folder the
owner already picked, never to browse the rest of their Drive.

Sheets sync (backend.cloud.google_auth, backend.cloud.sheets_sync) is
completely untouched by this file -- it keeps using the service account
exactly as before. This is a second, parallel credential path that
only backend.cloud.drive_backup's actual Drive upload call switches to.
"""
import json

from google.auth.exceptions import GoogleAuthError, RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from backend.core.config import get_drive_oauth_client_path, get_drive_oauth_token_path

# drive.file: only files/folders this identity itself creates (or that
# were explicitly opened via a picker, which this app never uses). The
# owner's existing "DropFix Backups" folder was created under their own
# regular Google account, so the very first backup run here creates the
# dropfix.db file inside it for the first time under THIS identity --
# after that, this identity owns that one file and can keep updating it.
SCOPES = ["https://www.googleapis.com/auth/drive.file"]


class InvalidClientFile(Exception):
    """The uploaded file isn't a usable OAuth "Desktop app" client
    secrets file. Message is safe to show directly in the UI.
    """


class DriveOAuthUnavailable(Exception):
    """Not connected yet, or the stored connection stopped working
    (token revoked, client file removed). The one exception every
    caller (drive_backup, the Tools status page) catches.
    """


def _validate_client_bytes(raw: bytes) -> dict:
    try:
        data = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidClientFile("That file isn't valid JSON") from exc
    if not isinstance(data, dict):
        raise InvalidClientFile("That file isn't a JSON object")
    if "web" in data and "installed" not in data:
        raise InvalidClientFile(
            "That's a 'Web application' OAuth client, not a 'Desktop app' one. "
            "Create a Desktop app client instead and download that JSON."
        )
    if "installed" not in data:
        raise InvalidClientFile("That doesn't look like a Google OAuth client secrets file")
    fields = data["installed"]
    missing = [f for f in ("client_id", "client_secret", "token_uri") if f not in fields]
    if missing:
        raise InvalidClientFile(f"That JSON is missing expected field(s): {', '.join(missing)}")
    return data


def save_client_secrets(raw: bytes) -> dict:
    """Validates before writing -- a bad upload must never overwrite a
    working client file. Uploading a new one always starts fresh: any
    previously stored token was minted for the OLD client and can't be
    refreshed under a new one, so it's cleared here too.
    """
    _validate_client_bytes(raw)
    get_drive_oauth_client_path().write_bytes(raw)
    token_path = get_drive_oauth_token_path()
    if token_path.exists():
        token_path.unlink()
    return get_oauth_status()


def delete_client_secrets() -> None:
    """Idempotent, same as google_key.delete_key_file(). Removes the
    stored token too -- it's useless without the client it was issued
    under.
    """
    client_path = get_drive_oauth_client_path()
    if client_path.exists():
        client_path.unlink()
    token_path = get_drive_oauth_token_path()
    if token_path.exists():
        token_path.unlink()


def disconnect() -> None:
    """Removes just the stored token, keeping the uploaded client file
    -- lets the owner reconnect (run the one-time browser sign-in again)
    without re-uploading anything.
    """
    token_path = get_drive_oauth_token_path()
    if token_path.exists():
        token_path.unlink()


def get_oauth_status() -> dict:
    """Never raises. Enough for the Tools > Google Connection page to
    show exactly where things stand: no client uploaded yet, client
    uploaded but never connected, or connected and ready.
    """
    client_path = get_drive_oauth_client_path()
    if not client_path.exists():
        return {"client_present": False, "connected": False, "error": None}

    try:
        _validate_client_bytes(client_path.read_bytes())
    except InvalidClientFile as exc:
        return {"client_present": True, "connected": False, "error": str(exc)}

    token_path = get_drive_oauth_token_path()
    if not token_path.exists():
        return {"client_present": True, "connected": False, "error": None}

    try:
        load_drive_oauth_credentials()
    except DriveOAuthUnavailable as exc:
        return {"client_present": True, "connected": False, "error": str(exc)}

    return {"client_present": True, "connected": True, "error": None}


def connect() -> dict:
    """The one-time step (Tools > Google Connection > "Connect Google
    Drive"): opens the owner's browser for a normal Google sign-in and
    consent screen, receives the result on a throwaway local port, and
    stores the resulting refresh token on disk. Every backup after this
    runs unattended -- this function is never called again unless the
    owner explicitly disconnects and reconnects.

    Blocking by design (waits for the browser round-trip) -- the route
    calling this must run it in a worker thread, not on the event loop.
    """
    client_path = get_drive_oauth_client_path()
    if not client_path.exists():
        raise DriveOAuthUnavailable("No OAuth client file uploaded yet")
    try:
        flow = InstalledAppFlow.from_client_secrets_file(str(client_path), scopes=SCOPES)
        creds = flow.run_local_server(port=0, open_browser=True)
    except (GoogleAuthError, ValueError, OSError) as exc:
        raise DriveOAuthUnavailable(f"Google sign-in didn't complete: {exc}") from exc
    get_drive_oauth_token_path().write_text(creds.to_json(), encoding="utf-8")
    return get_oauth_status()


def load_drive_oauth_credentials() -> Credentials:
    """Loads the stored token and refreshes it if the short-lived access
    token has expired -- the refresh token itself doesn't expire from
    ordinary use, so this is what makes every backup after the one-time
    connect() fully unattended. Refreshing rewrites the token file with
    the new access token so the next call doesn't need to refresh again
    right away.
    """
    token_path = get_drive_oauth_token_path()
    if not token_path.exists():
        raise DriveOAuthUnavailable("Google Drive isn't connected yet (Tools > Google Connection)")
    try:
        creds = Credentials.from_authorized_user_file(str(token_path), scopes=SCOPES)
    except (GoogleAuthError, ValueError, OSError, json.JSONDecodeError) as exc:
        raise DriveOAuthUnavailable(f"Could not read the stored Google Drive connection: {exc}") from exc

    if creds.valid:
        return creds
    if not creds.refresh_token:
        raise DriveOAuthUnavailable("Google Drive connection expired and can't refresh -- reconnect in Tools > Google Connection")
    try:
        creds.refresh(Request())
    except RefreshError as exc:
        raise DriveOAuthUnavailable(f"Google revoked this connection -- reconnect in Tools > Google Connection: {exc}") from exc
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return creds
