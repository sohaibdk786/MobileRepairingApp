"""Customer-facing repair status (QR on the receipt).

Public, token-based -- never exposes passcode or the full payment
ledger. Staff still use the full detail screen behind the till for
everything else. Notes is the one deliberate exception: it's the same
field staff use for their own reminders, but if the shop wants to leave
a message for whoever scans the QR, typing it into a ticket's Notes is
how -- shown here whenever it's non-blank, nothing shown when it's not.
"""
import sqlite3
from typing import Optional

from backend.core.constants import STATUS_CUSTOMER_COPY
from backend.core.money import format_pence
from backend.services.faults import list_faults
from backend.services.financials import REPAIR_FINANCIALS_COLUMNS, REPAIR_FINANCIALS_JOIN, financials_from_row
from backend.services.shop_settings import get_currency_code, get_shop_settings


def build_track_url(shop: dict, token: str) -> str:
    """Absolute URL for the receipt QR: the separate public tracker site
    (Customer_QR_Site) once tracker_site_url is set, since that's a real
    internet-reachable page a customer's own phone can always open. Falls
    back to this app's own local /track/ route (public_base_url, or a
    bare relative path with no base set at all) for a shop that hasn't
    deployed the tracker site yet -- same "prefer the real thing, fall
    back to what already works" shape as _default_phone.
    """
    tracker_site = (shop.get("tracker_site_url") or "").strip().rstrip("/")
    if tracker_site:
        return f"{tracker_site}?token={token}"
    base = (shop.get("public_base_url") or "").strip().rstrip("/")
    path = f"/track/{token}"
    if base:
        return f"{base}{path}"
    return path


def get_public_repair_status(conn: sqlite3.Connection, token: str) -> Optional[dict]:
    token = (token or "").strip()
    if not token:
        return None
    row = conn.execute(
        f"SELECT r.*, {REPAIR_FINANCIALS_COLUMNS} "
        f"FROM repairs r {REPAIR_FINANCIALS_JOIN} "
        f"WHERE r.tracking_token = ? AND r.deleted_at IS NULL",
        (token,),
    ).fetchone()
    if row is None:
        return None

    repair = dict(row)
    repair.update(financials_from_row(row))
    faults = list_faults(conn, repair["ticket"])
    shop = get_shop_settings(conn)
    currency = get_currency_code(conn)
    copy = STATUS_CUSTOMER_COPY.get(
        repair["status"],
        {
            "title": repair["status"],
            "detail": "Your repair status has been updated.",
            "step": 2,
        },
    )

    # Safe public fault list: what we're fixing, not internal pricing reasons.
    public_faults = [
        {
            "description": f["description"],
            "price_display": (
                format_pence(f["price_pence"], currency)
                if f["price_pence"] is not None
                else "To be agreed"
            ),
        }
        for f in faults
    ]

    balance_pence = repair["balance_pence"]
    return {
        "ticket": repair["ticket"],
        "shop_name": shop["shop_name"],
        "shop_phone": shop["public_phone"],
        "model": repair["model"],
        "customer_first_name": (repair["name"] or "").split()[0] if repair["name"] else "",
        "status": repair["status"],
        "status_title": copy["title"],
        "status_detail": copy["detail"],
        "journey_step": copy["step"],
        "faults": public_faults,
        "notes": (repair["notes"] or "").strip(),
        "total_display": (
            format_pence(repair["total_pence"], currency)
            if repair["total_pence"] is not None
            else "Pending"
        ),
        "balance_display": (
            format_pence(balance_pence, currency)
            if balance_pence is not None and balance_pence > 0
            else ("" if balance_pence is not None and balance_pence <= 0 else "Pending")
        ),
        "updated_at": repair["updated_at"],
        "created_at": repair["created_at"],
    }
