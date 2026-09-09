"""Serves the static HTML page for each screen.

All real behaviour lives in the matching .js file loaded by that page --
these routes just hand back the right file, so adding a screen later means
adding one line here plus its .html/.js pair, not touching this pattern.
"""
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

router = APIRouter(tags=["pages"])


def _serve(filename: str):
    def handler() -> FileResponse:
        return FileResponse(STATIC_DIR / filename)

    return handler


router.add_api_route("/", _serve("index.html"), methods=["GET"])
router.add_api_route("/search", _serve("search.html"), methods=["GET"])
router.add_api_route("/about", _serve("about.html"), methods=["GET"])
router.add_api_route("/detail", _serve("detail.html"), methods=["GET"])

# Tools is a menu page plus one page per section (spec section 10 lists
# several distinct tool areas -- Shop Details, Printer, Backup, Google
# connection, Recently Deleted -- and cramming them onto one long page
# stopped being "tucked away, off the counter" and started being a wall
# of forms). /tools is the menu; each tile links to its own page below.
router.add_api_route("/tools", _serve("tools.html"), methods=["GET"])
router.add_api_route("/tools/shop-details", _serve("tools-shop.html"), methods=["GET"])
router.add_api_route("/tools/printer", _serve("tools-printer.html"), methods=["GET"])
router.add_api_route("/tools/deleted", _serve("tools-deleted.html"), methods=["GET"])
router.add_api_route("/tools/backup", _serve("tools-backup.html"), methods=["GET"])
router.add_api_route("/tools/google", _serve("tools-google.html"), methods=["GET"])
router.add_api_route("/tools/appearance", _serve("tools-appearance.html"), methods=["GET"])
router.add_api_route("/tools/website", _serve("tools-website.html"), methods=["GET"])
