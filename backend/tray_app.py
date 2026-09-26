"""System tray launcher: runs DropFix in the background with no console
window at all, controlled entirely from a tray icon (Open / Start /
Stop / Exit).

This does not replace Start Shop App.bat -- that's still what does
first-time setup (creates the venv, installs packages, builds the
website) and is the one to run first on a new PC. This is a second,
separate way to run the app once that setup already exists, for anyone
who doesn't want any window at all sitting in the taskbar.

Must run with pythonw.exe, not python.exe, or a console window opens
anyway -- pythonw is the interpreter variant built specifically to run
with no console. The uvicorn server itself is launched as a separate
subprocess with CREATE_NO_WINDOW for the same reason.

Run from repo root or backend/:
  pythonw -m backend.tray_app
  pythonw backend/tray_app.py
"""
from __future__ import annotations

import ctypes
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

# Same fix as main.py: allow running this file directly, not just as
# `-m backend.tray_app`, by putting the repo root on sys.path either way.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pystray
from PIL import Image, ImageDraw

from backend.core.config import get_base_dir, get_project_root

PORT = 8001
URL = f"http://127.0.0.1:{PORT}"

_MUTEX_NAME = "DropFixTrayIconMutex"
_ERROR_ALREADY_EXISTS = 183

# White body while running, the app's own error red (index.css --error)
# while stopped, so the icon reads as a clear working/not-working signal
# rather than needing the tooltip to tell them apart.
_RUNNING_BODY = (255, 255, 255)
_RUNNING_DETAIL = (60, 60, 60)
_STOPPED_BODY = (0xFF, 0x3B, 0x30)
_STOPPED_DETAIL = (255, 255, 255)

_server_process: subprocess.Popen | None = None


def _already_running() -> bool:
    """True if another copy of this tray app is already alive.

    Checked with a named Windows mutex rather than the server's port,
    since the server can be manually stopped from the tray menu while
    the icon itself is still very much running -- a port check alone
    would miss that and let a second icon start anyway. The mutex is
    never explicitly closed: Windows releases it the moment this
    process exits or is killed, so a crashed instance can never leave a
    stale lock behind the way a PID file would.
    """
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW(None, False, _MUTEX_NAME)
    return ctypes.get_last_error() == _ERROR_ALREADY_EXISTS


def _venv_python() -> Path:
    """The project's own venv interpreter -- never the system Python --
    same as Start Shop App.bat's %PYTHON%.
    """
    return get_project_root() / "backend" / ".venv" / "Scripts" / "python.exe"


def _log_path() -> Path:
    return get_base_dir() / "tray_server.log"


def _is_running() -> bool:
    return _server_process is not None and _server_process.poll() is None


def _make_icon_image(*, running: bool) -> Image.Image:
    """A simple phone silhouette (DropFix repairs phones), colored by
    server state -- white while running, red while stopped -- so the
    tray icon itself shows status at a glance without needing to hover
    for the tooltip.
    """
    size = 64
    body, detail = (_RUNNING_BODY, _RUNNING_DETAIL) if running else (_STOPPED_BODY, _STOPPED_DETAIL)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Outline so the white (running) body doesn't disappear on a light
    # taskbar -- a plain white fill with no border is invisible there.
    draw.rounded_rectangle((18, 4, 46, 60), radius=8, fill=body, outline=_RUNNING_DETAIL, width=2)
    draw.rounded_rectangle((22, 10, 42, 48), radius=3, fill=detail)
    draw.ellipse((29, 51, 35, 57), fill=detail)
    return image


def _set_icon_state(icon: pystray.Icon, *, running: bool) -> None:
    icon.icon = _make_icon_image(running=running)
    icon.title = f"DropFix -- {'running' if running else 'stopped'}"


def _start_server(icon: pystray.Icon) -> None:
    global _server_process
    if _is_running():
        return
    log_file = open(_log_path(), "a", encoding="utf-8")
    _server_process = subprocess.Popen(
        [str(_venv_python()), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=str(get_project_root()),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    _set_icon_state(icon, running=True)


def _stop_server(icon: pystray.Icon) -> None:
    global _server_process
    if _is_running():
        _server_process.terminate()
        try:
            _server_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            _server_process.kill()
    _server_process = None
    _set_icon_state(icon, running=False)


def _open_browser() -> None:
    webbrowser.open(URL)


def _wait_until_ready(timeout: float = 15.0, interval: float = 0.3) -> None:
    """Polls the server until it actually answers, or the timeout runs
    out. Spawning the subprocess (_start_server) returns immediately --
    uvicorn still takes a moment to come up -- so opening the browser
    right after start_server on its own is a race: it'd usually work,
    but sometimes show a "can't connect" page instead of the app. Best
    effort either way -- if it never comes up, the browser still opens
    (the log file has whatever went wrong), rather than doing nothing.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(f"{URL}/api/status", timeout=1)
            return
        except (urllib.error.URLError, OSError):
            time.sleep(interval)


def _on_exit(icon: pystray.Icon) -> None:
    _stop_server(icon)
    icon.stop()


def _build_menu() -> pystray.Menu:
    return pystray.Menu(
        pystray.MenuItem("Open DropFix", lambda icon, item: _open_browser(), default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(
            "Start server", lambda icon, item: _start_server(icon), enabled=lambda item: not _is_running()
        ),
        pystray.MenuItem(
            "Stop server", lambda icon, item: _stop_server(icon), enabled=lambda item: _is_running()
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Exit", lambda icon, item: _on_exit(icon)),
    )


def _on_setup(icon: pystray.Icon) -> None:
    icon.visible = True
    _start_server(icon)
    # A fresh start (server wasn't already running) should land straight
    # on the site, same as double-clicking the shortcut a second time
    # while it's already up does (see _already_running() in main()) --
    # not leave it running silently with nothing on screen.
    _wait_until_ready()
    _open_browser()


def main() -> None:
    if _already_running():
        # Same as Start Shop App.bat's own "already running" check --
        # open the site instead of silently doing nothing, or starting
        # a second icon on top of the one already there.
        _open_browser()
        return
    icon = pystray.Icon("dropfix", _make_icon_image(running=False), "DropFix -- stopped", menu=_build_menu())
    icon.run(setup=_on_setup)


if __name__ == "__main__":
    main()
