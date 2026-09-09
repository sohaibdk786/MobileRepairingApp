"""Print routes: repair intake/collection receipts, sale receipts, the
Paste & Print voucher, and the Tools test print.

Every route here does the same three steps -- fetch the data, build the
ReceiptLine content (app/receipts.py), hand it to the single delivery
function (app/printing.deliver_receipt) -- so "how do faults/payments/
settings turn into a receipt" lives in exactly one place regardless of
which button triggered it. POST, not GET, because generating a receipt
has a side effect in Test mode (a new PDF file on disk) that a browser or
proxy should never quietly cache or prefetch.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.constants import COLLECTED_STATUSES
from backend.database import get_connection
from backend.printing import deliver_receipt
from backend.receipts import (
    build_collection_receipt,
    build_intake_receipt,
    build_sale_receipt,
    build_test_receipt,
    build_voucher_receipt,
)
from backend.repairs import get_repair_detail
from backend.sales import get_sale
from backend.shop_settings import get_shop_settings
from backend.text_formatting import format_voucher_text

router = APIRouter(prefix="/api", tags=["printing"])


@router.post("/repairs/{ticket}/print/intake")
def api_print_intake(ticket: str) -> dict:
    conn = get_connection()
    try:
        repair = get_repair_detail(conn, ticket)
        if repair is None:
            raise HTTPException(404, f"Ticket {ticket} not found")
        if repair["status"] in COLLECTED_STATUSES:
            raise HTTPException(
                400, "Intake receipt is no longer available -- this ticket has already been collected"
            )
        shop = get_shop_settings(conn)
    finally:
        conn.close()
    return deliver_receipt(build_intake_receipt(repair, shop), filename_hint=f"{ticket}_intake")


@router.post("/repairs/{ticket}/print/collection")
def api_print_collection(ticket: str) -> dict:
    conn = get_connection()
    try:
        repair = get_repair_detail(conn, ticket)
        if repair is None:
            raise HTTPException(404, f"Ticket {ticket} not found")
        if repair["status"] not in COLLECTED_STATUSES:
            raise HTTPException(
                400, "Collection receipt is only available once the ticket is marked Collected"
            )
        shop = get_shop_settings(conn)
    finally:
        conn.close()
    return deliver_receipt(build_collection_receipt(repair, shop), filename_hint=f"{ticket}_collection")


@router.post("/sales/{sale_id}/print")
def api_print_sale(sale_id: int) -> dict:
    conn = get_connection()
    try:
        sale = get_sale(conn, sale_id)
        if sale is None:
            raise HTTPException(404, f"Sale {sale_id} not found")
        shop = get_shop_settings(conn)
    finally:
        conn.close()
    return deliver_receipt(build_sale_receipt(sale, shop), filename_hint=f"sale{sale_id}")


class VoucherIn(BaseModel):
    text: str


@router.post("/paste-print")
def api_paste_print(payload: VoucherIn) -> dict:
    if not payload.text.strip():
        raise HTTPException(400, "Paste some text first")
    formatted = format_voucher_text(payload.text)
    return deliver_receipt(build_voucher_receipt(formatted), filename_hint="voucher")


@router.post("/tools/test-print")
def api_test_print() -> dict:
    conn = get_connection()
    try:
        shop = get_shop_settings(conn)
    finally:
        conn.close()
    return deliver_receipt(build_test_receipt(shop), filename_hint="test_print")
