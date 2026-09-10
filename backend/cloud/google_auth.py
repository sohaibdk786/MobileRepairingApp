"""Shared Google service-account credential loading, used by both
backend.cloud.sheets_sync and backend.cloud.drive_backup so there's exactly one place that
reads the key file and one scope list to keep in sync (spec section 16:
"a single place for each concern").
"""
from google.auth.exceptions import GoogleAuthError
from google.oauth2.service_account import Credentials

from backend.core.config import get_google_key_path

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


class GoogleUnavailable(Exception):
    """The key file is missing, unreadable, or invalid. The one exception
    type every caller (Sheets sync, Drive backup, the Tools status page)
    catches -- they each decide what "not configured yet" means for them,
    but none of them need to know Google's own exception hierarchy.
    """


def load_credentials() -> Credentials:
    key_path = get_google_key_path()
    if not key_path.exists():
        raise GoogleUnavailable(f"Google key file not found at {key_path}")
    try:
        return Credentials.from_service_account_file(str(key_path), scopes=SCOPES)
    except (GoogleAuthError, ValueError, OSError) as exc:
        raise GoogleUnavailable(f"Could not load the Google key file: {exc}") from exc
