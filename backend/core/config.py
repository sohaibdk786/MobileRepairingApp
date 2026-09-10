"""Where the app finds its own files, and which mode it's running in.

BUILD RULE (spec section 10, marked critical): the app must always locate
its data files by a RELATIVE path in its own folder, never a hardcoded
absolute path. That is what lets the whole folder be copied to a new PC
and just work -- drop the folder anywhere, run the exe, the database is
sitting right next to it. get_base_dir() is the one place that resolves
"here" for data files; get_project_root() resolves the repo root (where
frontend-react/ lives beside backend/).
"""
import json
import sys
from pathlib import Path

_SETTINGS_FILENAME = "dropfix_settings.json"
_DEFAULT_SETTINGS = {"mode": "test"}


def get_base_dir() -> Path:
    """Folder that holds runtime data (db, settings, keys, test_receipts).

    Once packaged with PyInstaller, sys.frozen is set and sys.executable is
    the .exe -- so this becomes the exe's own folder. During development it
    resolves to the backend/ package folder (where the database, settings,
    and keys live), so dev and the packaged app behave the same way.
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # backend/core/config.py -> backend/
    return Path(__file__).resolve().parent.parent


def get_project_root() -> Path:
    """Repo root: sibling folders backend/, frontend-react/.

    When frozen, everything lives beside the exe, so this matches
    get_base_dir().
    """
    if getattr(sys, "frozen", False):
        return get_base_dir()
    # backend/core/config.py -> backend/ -> repo root
    return Path(__file__).resolve().parent.parent.parent


def get_frontend_react_dir() -> Path:
    """React + Vite source tree."""
    return get_project_root() / "frontend-react"


def get_frontend_react_dist() -> Path:
    """Production build output from `npm run build` in frontend-react/."""
    return get_frontend_react_dir() / "dist"


def _settings_path() -> Path:
    return get_base_dir() / _SETTINGS_FILENAME


def _load_settings() -> dict:
    path = _settings_path()
    if not path.exists():
        return dict(_DEFAULT_SETTINGS)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or "mode" not in data:
            raise ValueError("settings file missing 'mode'")
        return data
    except (OSError, ValueError, json.JSONDecodeError):
        # Fail safe (spec section 16): a corrupt settings file must not
        # crash the app at the counter. Fall back to the safe default
        # (Test mode) rather than raising.
        return dict(_DEFAULT_SETTINGS)


def get_mode() -> str:
    """Returns 'test' or 'live'. Defaults to 'test' if the settings file is
    missing, corrupt, or holds an unrecognised value -- Test mode is the
    safe direction to fail in, since it never touches real data.
    """
    mode = _load_settings().get("mode", "test")
    return mode if mode in ("test", "live") else "test"


def is_test_mode() -> bool:
    return get_mode() == "test"


def get_db_path() -> Path:
    """Test mode and Live mode use separate database files (spec section 2:
    "Test mode uses a separate dropfix_test.db with fake data"), so banging
    on the app in Test mode can never touch real shop data.
    """
    filename = "dropfix_test.db" if is_test_mode() else "dropfix.db"
    return get_base_dir() / filename


# The Google service-account key filename, fixed and documented (spec
# section 10: "The app should keep the key filename and folder location
# consistent and documented so these messages can name them exactly").
GOOGLE_KEY_FILENAME = "dropfix_google_key.json"


def get_google_key_path() -> Path:
    """Same relative-path rule as get_db_path(): the key file lives beside
    the app, found by relative path, never a hardcoded absolute one --
    this is what makes "drop the recovery folder anywhere and run" work
    for the Google connection too, not just the database.
    """
    return get_base_dir() / GOOGLE_KEY_FILENAME


# QZ Tray's signed-connection identity (see backend.printing.qz_signing):
# a certificate the browser presents to QZ Tray, and the private key that
# proves it's genuinely ours. Same relative-path rule as everything else
# here -- both files live beside the app, never a hardcoded absolute path.
# The private key never leaves this machine; only qz_signing.py ever
# reads get_qz_private_key_path().
QZ_CERTIFICATE_FILENAME = "dropfix_qz_certificate.txt"
QZ_PRIVATE_KEY_FILENAME = "dropfix_qz_private_key.pem"

# Vite dev (5173) and preview (4173) origins -- used for CORS so the
# React app can call the API during `npm run dev` even if a request
# bypasses the Vite proxy.
VITE_DEV_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
)


def get_qz_certificate_path() -> Path:
    return get_base_dir() / QZ_CERTIFICATE_FILENAME


def get_qz_private_key_path() -> Path:
    return get_base_dir() / QZ_PRIVATE_KEY_FILENAME
