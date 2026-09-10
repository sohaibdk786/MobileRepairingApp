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
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.database import get_connection
from backend.services.deleted import list_recently_deleted, purge_all
from backend.services.shop_settings import get_shop_settings, set_printer_name, update_shop_settings

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
    manager_phone: str
    terms_and_conditions: str
    warranty_days: int
    currency_code: str
    currency_print_style: str
    website_form_url: str = ""
    public_base_url: str = ""


@router.put("/shop-settings")
def api_update_shop_settings(payload: ShopSettingsIn) -> dict:
    conn = get_connection()
    try:
        try:
            update_shop_settings(conn, **payload.model_dump())
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        return get_shop_settings(conn)
    finally:
        conn.close()


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
