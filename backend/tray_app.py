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

import subprocess
import sys
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

# The app's own default accent green (frontend-react/src/index.css,
# --accent under [data-accent="green"]) -- so the tray icon matches the
# brand instead of an arbitrary color.
_RUNNING_COLOR = (0x34, 0xC7, 0x59)
_STOPPED_COLOR = (148, 148, 148)

_server_process: subprocess.Popen | None = None


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
    """A plain filled circle, colored by server state, so the tray icon
    itself shows status at a glance without needing to hover for the
    tooltip.
    """
    size = 64
    color = _RUNNING_COLOR if running else _STOPPED_COLOR
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((4, 4, size - 4, size - 4), fill=color)
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


def main() -> None:
    icon = pystray.Icon("dropfix", _make_icon_image(running=False), "DropFix -- stopped", menu=_build_menu())
    icon.run(setup=_on_setup)


if __name__ == "__main__":
    main()
