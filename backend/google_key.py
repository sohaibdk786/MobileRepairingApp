"""Uploading, replacing, deleting, and checking the Google service-account
key file from within the app (Tools > Google Connection), rather than
only ever placing it by hand (spec section 10 describes the manual path
as the fallback for disaster recovery; day-to-day, uploading it through
Tools is faster and less error-prone).

The key's own "client_email" field is surfaced back to the UI because
it's exactly what the owner needs to go share the Sheets and the Drive
backup folder with (spec section 10.B: "share both Sheets and the Drive
backup folder with the service-account's email") -- reading it back out
of the file saves a trip to open the JSON by hand.
"""
import json

from backend.config import get_google_key_path
from backend.google_auth import GoogleUnavailable, load_credentials

_REQUIRED_FIELDS = ("type", "client_email", "private_key", "token_uri")


class InvalidKeyFile(Exception):
    """The uploaded file isn't a usable service-account key. Carries a
    message safe to show directly in the UI.
    """


def _validate_key_bytes(raw: bytes) -> dict:
    try:
        data = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidKeyFile("That file isn't valid JSON") from exc
    if not isinstance(data, dict):
        raise InvalidKeyFile("That file isn't a JSON object")
    missing = [field for field in _REQUIRED_FIELDS if field not in data]
    if missing:
        raise InvalidKeyFile(f"That JSON is missing expected field(s): {', '.join(missing)}")
    if data["type"] != "service_account":
        raise InvalidKeyFile(f"Expected a service-account key, got type '{data['type']}'")
    return data


def save_key_file(raw: bytes) -> dict:
    """Validates the upload BEFORE writing it -- a bad file must never
    overwrite a working key, so a save that would clear a working Google
    connection never happens by accident.
    """
    _validate_key_bytes(raw)  # raises InvalidKeyFile before anything touches disk
    get_google_key_path().write_bytes(raw)
    return get_key_status()


def delete_key_file() -> None:
    """Idempotent -- deleting an already-absent key file is not an error,
    since the end state ("no key configured") is the same either way.
    """
    path = get_google_key_path()
    if path.exists():
        path.unlink()


def get_key_status() -> dict:
    """Never raises. Returns enough for the Tools > Google Connection
    page to show either "connected as <email>" or the exact reason it
    isn't, without the frontend needing to know anything about how
    Google auth works.
    """
    path = get_google_key_path()
    if not path.exists():
        return {"present": False, "valid": False, "client_email": None, "error": None}

    try:
        data = _validate_key_bytes(path.read_bytes())
    except InvalidKeyFile as exc:
        return {"present": True, "valid": False, "client_email": None, "error": str(exc)}

    try:
        load_credentials()
    except GoogleUnavailable as exc:
        return {"present": True, "valid": False, "client_email": data.get("client_email"), "error": str(exc)}

    return {"present": True, "valid": True, "client_email": data.get("client_email"), "error": None}
