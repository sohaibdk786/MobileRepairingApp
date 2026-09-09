"""Backing up the database file to Google Drive (spec section 10:
"Back up the whole dropfix.db file... twice a day at 11:00 and 19:00...
One file, overwritten each time... health check that the current DB is
readable; if it looks broken, skip the upload and keep the last good
backup instead of writing garbage over it").

Backs up whichever database the app is currently pointed at (Test or
Live -- see backend.config.get_db_path()), so the exact same code path runs
in both modes; in Test mode this just proves the mechanism works without
touching anything real.

IMPORTANT HONESTY NOTE: written to the documented Drive API v3 client but
not run against a real Drive folder in this environment -- see the
README for what that means for testing.
"""
import sqlite3
from datetime import datetime, time
from pathlib import Path
from typing import Optional

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from backend.cloud_settings import get_cloud_settings, record_backup_success
from backend.config import get_db_path
from backend.google_auth import GoogleUnavailable, load_credentials

# The PC is off overnight, so nightly backups are useless (spec section
# 10) -- these are the two points in the working day it backs up instead.
BACKUP_TIMES = [time(11, 0), time(19, 0)]


class BackupError(Exception):
    """Backup did not complete -- missing credentials, Drive folder not
    shared with the service account, network failure, or a failed health
    check. The message is safe to show directly in the Tools UI.
    """


def _health_check(db_path: Path) -> None:
    """Raises BackupError if the database doesn't look readable. Runs a
    read-only integrity check so a corrupt file is never uploaded over a
    good backup that's still sitting on Drive.
    """
    if not db_path.exists():
        raise BackupError(f"Database file not found at {db_path}")
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            result = conn.execute("PRAGMA integrity_check").fetchone()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise BackupError(f"Could not read the database file: {exc}") from exc
    if not result or result[0] != "ok":
        raise BackupError(f"Database failed its integrity check: {result}")


def _find_existing_file_id(service, folder_id: str, filename: str) -> Optional[str]:
    query = f"name = '{filename}' and '{folder_id}' in parents and trashed = false"
    response = service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
    files = response.get("files", [])
    return files[0]["id"] if files else None


def run_backup_now(conn: sqlite3.Connection) -> str:
    """Runs the health check, then uploads (or overwrites) the single
    backup file on Drive. Returns a short success message. Raises
    BackupError on any failure -- callers decide how to surface that
    (log it and retry later in the background loop, show it directly in
    the Tools UI for a manual "Backup now" click).
    """
    settings = get_cloud_settings(conn)
    if not settings["drive_folder_id"]:
        raise BackupError("No Drive folder configured yet")

    db_path = get_db_path()
    _health_check(db_path)

    try:
        creds = load_credentials()
    except GoogleUnavailable as exc:
        raise BackupError(str(exc)) from exc

    try:
        service = build("drive", "v3", credentials=creds, cache_discovery=False)
        existing_file_id = _find_existing_file_id(service, settings["drive_folder_id"], db_path.name)
        media = MediaFileUpload(str(db_path), mimetype="application/x-sqlite3", resumable=False)
        if existing_file_id:
            service.files().update(fileId=existing_file_id, media_body=media).execute()
        else:
            metadata = {"name": db_path.name, "parents": [settings["drive_folder_id"]]}
            service.files().create(body=metadata, media_body=media, fields="id").execute()
    except HttpError as exc:
        raise BackupError(f"Google Drive rejected the upload: {exc}") from exc

    record_backup_success(conn)
    return f"Backed up {db_path.name} to Drive."


def _most_recent_mark_passed_today(now: datetime) -> Optional[datetime]:
    passed = [now.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0) for t in BACKUP_TIMES if now.time() >= t]
    return max(passed) if passed else None


def catch_up_backup_if_needed(conn: sqlite3.Connection) -> Optional[str]:
    """Called once at startup (spec: "If the PC was off at those times,
    catch up on the next startup past the mark -- never silently skip").
    Returns a result message if a catch-up backup ran, None if nothing
    was due. Never raises -- a failed catch-up attempt is logged-worthy,
    not something that should stop the app from starting.
    """
    now = datetime.now()
    mark = _most_recent_mark_passed_today(now)
    if mark is None:
        return None  # not past 11:00 yet today -- nothing to catch up on

    settings = get_cloud_settings(conn)
    last_backup_at = settings["last_backup_at"]
    already_covered = last_backup_at is not None and datetime.fromisoformat(last_backup_at) >= mark
    if already_covered:
        return None

    try:
        return run_backup_now(conn)
    except BackupError as exc:
        return f"Catch-up backup failed: {exc}"
