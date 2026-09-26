"""Sale API routes: create, view, delete/restore a counter sale."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.constants import PAYMENT_METHODS, SALE_ITEMS
from backend.core.database import get_connection
from backend.core.money import parse_pounds_to_pence
from backend.services.presenters import present_sale
from backend.services.sales import (
    add_sale_refund,
    create_sale,
    edit_sale,
    find_matching_last_sale,
    get_sale,
    restore_sale,
    soft_delete_sale,
)
from backend.services.shop_settings import get_currency_code

router = APIRouter(prefix="/api/sales", tags=["sales"])


def _resolve_item(item: str, custom_item: str) -> str:
    if item == "Other":
        return custom_item.strip() or "Other"
    if item not in SALE_ITEMS:
        raise HTTPException(400, f"Unknown item: {item}")
    return item


def _resolve_sold_at(sold_at: str) -> Optional[str]:
    """Blank (the Automatic toggle) = None, so create_sale falls back to
    now on its own. Non-blank only reaches here from the Manual toggle --
    a backdated sale for a customer who never took their receipt at the
    time and needs one printed later, dated for when the sale actually
    happened. Never a future date/time, since nothing's been sold yet.
    """
    sold_at = sold_at.strip()
    if not sold_at:
        return None
    try:
        parsed = datetime.fromisoformat(sold_at)
    except ValueError:
        raise HTTPException(400, "Enter a valid date and time")
    if parsed > datetime.now():
        raise HTTPException(400, "Sale date/time can't be in the future")
    return parsed.isoformat(timespec="seconds")


class SaleIn(BaseModel):
    name: str
    item: str
    custom_item: str = ""
    price: str
    method: str
    serial: str = ""
    sold_at: str = ""  # blank = automatic (now); else a backdated date/time from the Manual toggle
    force: bool = False  # bypass the identical-to-last check ("yes, genuine repeat sale")


@router.post("")
def api_create_sale(payload: SaleIn) -> dict:
    item = _resolve_item(payload.item, payload.custom_item)
    if payload.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Method must be one of {PAYMENT_METHODS}")
    try:
        price_pence = parse_pounds_to_pence(payload.price)
    except ValueError:
        raise HTTPException(400, "Price must be a valid number")
    if price_pence is None:
        raise HTTPException(400, "Price is required for a sale")
    sold_at = _resolve_sold_at(payload.sold_at)

    conn = get_connection()
    try:
        if not payload.force:
            # Spec section 5: "Same as last sale, print again?" -- unlike
            # a repair there's no "save without printing" middle option,
            # a sale is either a genuine repeat (force=true) or an
            # accidental double-click (cancelled client-side, never
            # reaches here with force=true).
            duplicate_id = find_matching_last_sale(
                conn,
                name=payload.name,
                item=item,
                price_pence=price_pence,
                method=payload.method,
                serial=payload.serial,
            )
            if duplicate_id:
                return {"duplicate": True, "last_sale_id": duplicate_id}

        try:
            sale_id = create_sale(
                conn,
                name=payload.name,
                item=item,
                price_pence=price_pence,
                method=payload.method,
                serial=payload.serial,
                sold_at=sold_at,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        sale = get_sale(conn, sale_id)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()

    return {"duplicate": False, "sale": present_sale(sale, currency_code)}


@router.get("/{sale_id}")
def api_get_sale(sale_id: int) -> dict:
    conn = get_connection()
    try:
        sale = get_sale(conn, sale_id)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    if sale is None:
        raise HTTPException(404, f"Sale {sale_id} not found")
    return present_sale(sale, currency_code)


class SaleEditIn(BaseModel):
    name: str
    item: str
    custom_item: str = ""
    price: str
    method: str
    serial: str = ""


@router.patch("/{sale_id}")
def api_edit_sale(sale_id: int, payload: SaleEditIn) -> dict:
    item = _resolve_item(payload.item, payload.custom_item)
    if payload.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Method must be one of {PAYMENT_METHODS}")
    try:
        price_pence = parse_pounds_to_pence(payload.price)
    except ValueError:
        raise HTTPException(400, "Price must be a valid number")
    if price_pence is None:
        raise HTTPException(400, "Price is required for a sale")

    conn = get_connection()
    try:
        try:
            edit_sale(
                conn,
                sale_id,
                name=payload.name,
                item=item,
                price_pence=price_pence,
                method=payload.method,
                serial=payload.serial,
            )
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        sale = get_sale(conn, sale_id)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_sale(sale, currency_code)


class SaleRefundIn(BaseModel):
    amount: str


@router.post("/{sale_id}/refunds")
def api_add_sale_refund(sale_id: int, payload: SaleRefundIn) -> dict:
    try:
        amount_pence = parse_pounds_to_pence(payload.amount)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if amount_pence is None:
        raise HTTPException(400, "Refund amount is required")

    conn = get_connection()
    try:
        try:
            add_sale_refund(conn, sale_id, amount_pence)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        sale = get_sale(conn, sale_id)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_sale(sale, currency_code)


@router.delete("/{sale_id}")
def api_delete_sale(sale_id: int) -> dict:
    conn = get_connection()
    try:
        try:
            soft_delete_sale(conn, sale_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc))
    finally:
        conn.close()
    return {"deleted": True, "sale_id": sale_id}


@router.post("/{sale_id}/restore")
def api_restore_sale(sale_id: int) -> dict:
    conn = get_connection()
    try:
        try:
            restore_sale(conn, sale_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        sale = get_sale(conn, sale_id)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_sale(sale, currency_code)
