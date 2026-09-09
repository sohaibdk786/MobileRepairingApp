"""Reprint screen backend: quick lookups for "last repair" / "last sale" /
"last collection receipt" (spec section 8).

No actual printing yet -- that's wired in Phase 3. These routes exist so
the screen and its three buttons work now, opening the matching detail
view; Phase 3 adds the print call on top without changing this lookup
logic.
"""
from fastapi import APIRouter, HTTPException

from backend.constants import COLLECTED_STATUSES
from backend.database import get_connection
from backend.presenters import present_repair_summary, present_sale
from backend.repairs import get_last_repair, get_repair_detail
from backend.sales import get_last_sale
from backend.shop_settings import get_currency_code

router = APIRouter(prefix="/api/reprint", tags=["reprint"])


@router.get("/last-repair")
def api_last_repair() -> dict:
    conn = get_connection()
    try:
        last = get_last_repair(conn)
        if last is None:
            raise HTTPException(404, "No repairs saved yet")
        detail = get_repair_detail(conn, last["ticket"])
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_summary(detail, currency_code)


@router.get("/last-sale")
def api_last_sale() -> dict:
    conn = get_connection()
    try:
        sale = get_last_sale(conn)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    if sale is None:
        raise HTTPException(404, "No sales saved yet")
    return present_sale(sale, currency_code)


@router.get("/last-collection")
def api_last_collection() -> dict:
    """Stand-in for "last collection receipt" until Phase 3 wires up real
    printing -- there's no separate "receipt printed" event recorded yet.
    For now this is the most recently updated ticket in either collected
    status (COLLECTED_STATUSES), the best available proxy for "the last
    one handed back" -- must match api_print_collection's own gate
    exactly, or this card could point at a ticket that then refuses to
    print.
    """
    conn = get_connection()
    try:
        placeholders = ",".join("?" for _ in COLLECTED_STATUSES)
        row = conn.execute(
            f"SELECT ticket FROM repairs WHERE deleted_at IS NULL AND status IN ({placeholders}) "
            "ORDER BY updated_at DESC LIMIT 1",
            COLLECTED_STATUSES,
        ).fetchone()
        if row is None:
            raise HTTPException(404, "No collected repairs yet")
        detail = get_repair_detail(conn, row["ticket"])
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_summary(detail, currency_code)
