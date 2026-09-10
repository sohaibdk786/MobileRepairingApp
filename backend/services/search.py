"""Search/browse logic for repairs and sales (spec section 7).

Search opens as a full browse view (no typing needed) and narrows via a
live text filter, date range, and three independent status toggles. Both
columns (repairs left, sales right) scroll and load independently -- see
Reasons below -- so this module exposes two separate paged queries rather
than one combined one.
"""
import sqlite3
from typing import Optional

from backend.core.constants import COLLECTED_STATUSES, READY_STATUSES
from backend.services.financials import REPAIR_FINANCIALS_COLUMNS, REPAIR_FINANCIALS_JOIN, financials_from_row

DEFAULT_PAGE_SIZE = 25


def search_repairs(
    conn: sqlite3.Connection,
    *,
    query: str = "",
    date_from: str = "",
    date_to: str = "",
    collected: Optional[bool] = None,
    ready: Optional[bool] = None,
    paid: str = "any",
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
) -> list[dict]:
    """Newest first. `query` partial-matches ticket/name/phone/model/passcode
    (spec section 7); date_from/date_to compare against the creation date
    only (not time, so a whole day is inclusive either end). collected/
    ready are independent tri-state filters -- None means "don't filter on
    this axis". `paid` is one of "any" / "yes" / "no" / "unsettled" --
    see the is_paid_expr comment below for what each one actually checks.
    """
    where = ["r.deleted_at IS NULL"]
    params: list = []

    query = query.strip()
    if query:
        like = f"%{query}%"
        where.append(
            "(r.ticket LIKE ? OR r.name LIKE ? OR r.phone LIKE ? OR r.model LIKE ? OR r.passcode LIKE ?)"
        )
        params += [like, like, like, like, like]

    if date_from:
        where.append("date(r.created_at) >= date(?)")
        params.append(date_from)
    if date_to:
        where.append("date(r.created_at) <= date(?)")
        params.append(date_to)

    # Collected and Ready both describe the SAME status column, so they
    # can't be computed as two independent conditions and ANDed together
    # -- worked out scenario-by-scenario with the shop owner (see README
    # "Filter semantics, current final state (repairs)" for the full
    # reasoning). Nine (collected, ready) combinations, mapped to the
    # exact status set each one means:
    #
    #   collected \ ready |  Any (None)               | Ready (True)   | Not Ready (False)
    #   True               | COLLECTED_STATUSES        | Collected only | Not Agreed/Fixed - Collected only
    #   False / None       | READY_STATUSES if Ready=True else "In Progress" if Ready=False else (both, when collected=False) / no restriction (when collected=None too)
    #
    # Only the Collected=True row is special: "Ready"/"Not Ready" can't
    # literally describe a phone that's already gone, so once Collected
    # is on, they instead split the Collected bucket by outcome --
    # properly fixed and picked up, vs declined and picked up. Every
    # other cell is a normal, literal status match.
    if collected is True:
        if ready is True:
            status_set = ("Collected",)
        elif ready is False:
            status_set = ("Not Agreed/Fixed - Collected",)
        else:
            status_set = COLLECTED_STATUSES
    elif ready is True:
        status_set = READY_STATUSES
    elif ready is False:
        status_set = ("In Progress",)
    elif collected is False:
        status_set = ("In Progress",) + READY_STATUSES
    else:
        status_set = None

    if status_set is not None:
        status_placeholders = ",".join("?" for _ in status_set)
        where.append(f"r.status IN ({status_placeholders})")
        params += list(status_set)

    # Pure money question: every fault has an agreed price AND the
    # balance is <= 0. Mirrors backend.services.financials.compute_financials so this
    # filter can never disagree with what the detail screen shows for the
    # same ticket.
    is_paid_expr = (
        "(fault_totals.pending_count IS NOT NULL AND fault_totals.pending_count = 0 "
        "AND fault_totals.total_pence IS NOT NULL "
        "AND (fault_totals.total_pence - COALESCE(payment_totals.paid_pence, 0)) <= 0)"
    )
    # "Paid" = fully paid by money OR marked settled -- settling something
    # (any amount, no cap) means the shop isn't chasing it, so for
    # filtering purposes it's done, same as if the balance were genuinely
    # £0. "Not Paid" is exactly the complement of that (NOT paid_expr AND
    # NOT settled) -- once a ticket is settled it moves fully into Paid
    # and drops out of Not Paid, even if a real balance is still sitting
    # there unpaid. The two are mutually exclusive on purpose: every
    # ticket lands in exactly one of Paid / Not Paid, never both.
    is_paid_or_settled_expr = f"({is_paid_expr} OR r.settled = 1)"
    # "Unsettled" is a third, independent question: real money still
    # outstanding (balance > 0 -- a ticket that's genuinely £0 owed is
    # never "unsettled") AND not marked settled. An unpaid, un-settled
    # ticket shows under both Not Paid and Unsettled at once -- different
    # questions about the same ticket.
    is_unsettled_expr = (
        "(fault_totals.total_pence IS NOT NULL "
        "AND (fault_totals.total_pence - COALESCE(payment_totals.paid_pence, 0)) > 0 "
        "AND r.settled = 0)"
    )
    if paid == "yes":
        where.append(is_paid_or_settled_expr)
    elif paid == "no":
        where.append(f"NOT {is_paid_or_settled_expr}")
    elif paid == "unsettled":
        where.append(is_unsettled_expr)

    sql = (
        f"SELECT r.*, {REPAIR_FINANCIALS_COLUMNS} "
        f"FROM repairs r {REPAIR_FINANCIALS_JOIN} "
        f"WHERE {' AND '.join(where)} "
        f"ORDER BY r.created_at DESC, r.ticket DESC "
        f"LIMIT ? OFFSET ?"
    )
    params += [limit, offset]

    rows = conn.execute(sql, params).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item.update(financials_from_row(row))
        results.append(item)
    return results


def search_sales(
    conn: sqlite3.Connection,
    *,
    query: str = "",
    date_from: str = "",
    date_to: str = "",
    item: str = "",
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
) -> list[dict]:
    """Newest first. `query` partial-matches name, item, and serial/IMEI.

    No status filters here -- a sale has no in-progress/collected concept,
    it's a single finished transaction. The three status toggles on the
    Search screen only ever apply to the repairs column.

    `item` (optional) exact-matches the sale item label, e.g. "Mobile Phone"
    for the React Search mobile-sales filter.
    """
    where = ["deleted_at IS NULL"]
    params: list = []

    query = query.strip()
    if query:
        like = f"%{query}%"
        where.append("(name LIKE ? OR item LIKE ? OR serial LIKE ?)")
        params += [like, like, like]

    item = item.strip()
    if item:
        where.append("item = ?")
        params.append(item)

    if date_from:
        where.append("date(sold_at) >= date(?)")
        params.append(date_from)
    if date_to:
        where.append("date(sold_at) <= date(?)")
        params.append(date_to)

    sql = (
        f"SELECT * FROM sales WHERE {' AND '.join(where)} "
        f"ORDER BY sold_at DESC, id DESC LIMIT ? OFFSET ?"
    )
    params += [limit, offset]

    rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]
