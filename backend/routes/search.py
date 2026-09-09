"""Search API routes: the full-browse/live-filter screen (spec section 7).

Two separate endpoints, not one combined one, because the two result
columns (repairs, sales) load and scroll independently on the frontend.
"""
from typing import Optional

from fastapi import APIRouter

from backend.database import get_connection
from backend.presenters import present_repair_summary, present_sale
from backend.search import DEFAULT_PAGE_SIZE, search_repairs, search_sales
from backend.shop_settings import get_currency_code

router = APIRouter(prefix="/api/search", tags=["search"])


def _tri_state(value: str) -> Optional[bool]:
    """Query params arrive as 'any' | 'yes' | 'no'."""
    if value == "yes":
        return True
    if value == "no":
        return False
    return None


@router.get("/repairs")
def api_search_repairs(
    q: str = "",
    date_from: str = "",
    date_to: str = "",
    collected: str = "any",
    ready: str = "any",
    paid: str = "any",
    offset: int = 0,
    limit: int = DEFAULT_PAGE_SIZE,
) -> list[dict]:
    conn = get_connection()
    try:
        results = search_repairs(
            conn,
            query=q,
            date_from=date_from,
            date_to=date_to,
            collected=_tri_state(collected),
            ready=_tri_state(ready),
            paid=paid,  # "any" / "yes" / "no" / "unsettled" -- backend.search.search_repairs handles all four
            limit=min(limit, 100),  # a stray huge limit must never draw the whole table at once
            offset=max(offset, 0),
        )
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return [present_repair_summary(r, currency_code) for r in results]


@router.get("/sales")
def api_search_sales(
    q: str = "",
    date_from: str = "",
    date_to: str = "",
    offset: int = 0,
    limit: int = DEFAULT_PAGE_SIZE,
) -> list[dict]:
    conn = get_connection()
    try:
        results = search_sales(
            conn,
            query=q,
            date_from=date_from,
            date_to=date_to,
            limit=min(limit, 100),
            offset=max(offset, 0),
        )
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return [present_sale(r, currency_code) for r in results]
