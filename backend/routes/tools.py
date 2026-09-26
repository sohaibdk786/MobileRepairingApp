"""Tools screen backend: Shop Details (editable), printer selection, and
Recently Deleted.

Restoring a deleted repair/sale reuses the existing
POST /api/repairs/{ticket}/restore and POST /api/sales/{id}/restore routes
(app/routes/repairs.py, app/routes/sales.py) -- there is no separate
Tools-namespaced restore route here, so "restore a ticket" stays in
exactly one place regardless of which screen it's triggered from.

Backup and Google connection sections are Phase 4 work; this router only
covers what's actually wired up so far. The rest of the Tools screen
exists on the frontend as a shell with those sections visibly marked
"comes in a later phase" rather than fake-working buttons.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.cloud.cloud_settings import get_cloud_settings
from backend.cloud.sheets_sync import SheetsError, get_client, push_shop_details_row
from backend.core.config import is_test_mode, set_mode, set_print_dialog_mode, set_print_method
from backend.core.database import get_connection
from backend.services.deleted import list_recently_deleted, purge_all
from backend.services.shop_settings import get_shop_settings, set_printer_name, update_shop_settings

logger = logging.getLogger("dropfix.tools")

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("/shop-settings")
def api_get_shop_settings() -> dict:
    conn = get_connection()
    try:
        return get_shop_settings(conn)
    finally:
        conn.close()


class ShopSettingsIn(BaseModel):
    shop_name: str
    address: str
    manager_name: str
    terms_and_conditions: str
    warranty_days: int
    currency_code: str
    currency_print_style: str
    public_base_url: str = ""
    shop_website_url: str = ""
    email: str = ""
    maps_url: str = ""
    receipt_phone: str = ""
    public_phone: str = ""
    tracker_site_url: str = ""


@router.put("/shop-settings")
def api_update_shop_settings(payload: ShopSettingsIn) -> dict:
    conn = get_connection()
    try:
        try:
            update_shop_settings(conn, **payload.model_dump())
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        _push_shop_details_to_sheet(conn)
        return get_shop_settings(conn)
    finally:
        conn.close()


def _push_shop_details_to_sheet(conn) -> None:
    """Best-effort, synchronous (Shop Details changes rarely, unlike
    repairs -- no need for the background queue's machinery). Never blocks
    or fails the save itself: the local save is what matters, the Sheet
    push is a bonus that just retries on the next save if it doesn't go
    through this time.
    """
    if is_test_mode():
        return
    sheet_id = get_cloud_settings(conn)["shop_details_sheet_id"]
    if not sheet_id:
        return
    try:
        client = get_client()
        push_shop_details_row(conn, client, sheet_id)
    except SheetsError:
        logger.warning("Shop Details Sheet push failed -- will retry on next save", exc_info=True)


class PrinterIn(BaseModel):
    printer_name: str


@router.put("/printer")
def api_set_printer(payload: PrinterIn) -> dict:
    """Saved from Tools > Detect printers > pick from the QZ Tray-reported
    list (spec section 11: "no typing the name"). Detection itself
    happens entirely in the browser via qz.printers.find() -- this route
    only persists whichever name the user picked.
    """
    conn = get_connection()
    try:
        set_printer_name(conn, payload.printer_name)
        return get_shop_settings(conn)
    finally:
        conn.close()


class ModeIn(BaseModel):
    mode: str


@router.put("/mode")
def api_set_mode(payload: ModeIn) -> dict:
    """Saved from Appearance -- switches Test/Live (backend.core.config),
    which only ever changes which database is in use. Every other
    setting (shop details, printer, print method) lives outside this
    switch and stays exactly the same in both.
    """
    try:
        set_mode(payload.mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"mode": payload.mode}


class PrintMethodIn(BaseModel):
    print_method: str


@router.put("/print-method")
def api_set_print_method(payload: PrintMethodIn) -> dict:
    """Saved from Tools > Printer -- QZ Tray / default printer / save to
    PDF, independent of Test/Live mode (backend.core.config.get_mode).
    """
    try:
        set_print_method(payload.print_method)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"print_method": payload.print_method}


class PrintDialogModeIn(BaseModel):
    print_dialog_mode: str


@router.put("/print-dialog-mode")
def api_set_print_dialog_mode(payload: PrintDialogModeIn) -> dict:
    """Saved from Tools > Printer -- Automatic (today's existing
    behaviour, no per-print interaction) or Manual (always shows the
    browser's print dialog first). Independent of print_method itself,
    same as print_method is independent of Test/Live mode.
    """
    try:
        set_print_dialog_mode(payload.print_dialog_mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"print_dialog_mode": payload.print_dialog_mode}


@router.get("/recently-deleted")
def api_recently_deleted() -> dict:
    conn = get_connection()
    try:
        return list_recently_deleted(conn)
    finally:
        conn.close()


@router.post("/recently-deleted/purge-all")
def api_purge_all_deleted() -> dict:
    conn = get_connection()
    try:
        purge_all(conn)
    finally:
        conn.close()
    return {"purged": True}
