"""Deriving a repair's total / paid / balance from its faults and payments.

The single place this calculation happens (spec section 16: "a single
place for each concern"). Repairs never store a price or a paid flag
directly (spec section 2) -- both are always summed from the `faults` and
`payments` child tables, so they can never drift out of sync with the
actual line items.

REPAIR_FINANCIALS_JOIN is a SQL fragment other queries (repairs.py,
search.py) can append to a `FROM repairs r` query to get the computed
total/paid columns alongside a repair row, without join fan-out: each
child table is pre-aggregated in its own subquery before joining, so a
repair with 3 faults and 2 payments still yields exactly one row.
"""
from typing import Optional

REPAIR_FINANCIALS_JOIN = """
LEFT JOIN (
    SELECT ticket,
           SUM(price_pence) AS total_pence,
           SUM(CASE WHEN price_pence IS NULL THEN 1 ELSE 0 END) AS pending_count
    FROM faults
    GROUP BY ticket
) fault_totals ON fault_totals.ticket = r.ticket
LEFT JOIN (
    SELECT ticket, SUM(amount_pence) AS paid_pence
    FROM payments
    GROUP BY ticket
) payment_totals ON payment_totals.ticket = r.ticket
"""

# Selected alongside `r.*` wherever REPAIR_FINANCIALS_JOIN is used.
REPAIR_FINANCIALS_COLUMNS = (
    "fault_totals.total_pence AS total_pence, "
    "fault_totals.pending_count AS pending_count, "
    "COALESCE(payment_totals.paid_pence, 0) AS paid_pence"
)


def compute_financials(total_pence: Optional[int], pending_count: Optional[int], paid_pence: Optional[int]) -> dict:
    """Turn the raw joined columns into total/paid/balance/is_fully_paid.

    total_pence is SQL's SUM(price_pence) across this ticket's faults,
    which already ignores NULL (pending) fault prices on its own -- SQL's
    SUM always skips NULLs. So if a ticket has "Diagnostic" (no price
    yet) and "Screen: £33", total_pence arrives here as 3300, the correct
    sum of what IS known (spec section 4: "the ticket price is the sum of
    the fault lines") -- it must NOT be thrown away and replaced with
    None just because something else is still pending. It's still None
    when NOTHING has a price yet (a brand new pending-price ticket), or
    when a ticket somehow has zero fault rows at all.

    has_pending_faults is surfaced separately so the UI can show "some
    items still need a price" without hiding the money that IS agreed --
    and a ticket can't count as fully paid while it's true, since there's
    still unpriced work that could add to the bill.
    """
    pending_count = pending_count or 0
    paid_pence = paid_pence or 0
    has_pending_faults = pending_count > 0

    if total_pence is None:
        return {
            "total_pence": None,
            "paid_pence": paid_pence,
            "balance_pence": None,
            "is_fully_paid": False,
            "has_pending_faults": has_pending_faults,
        }

    balance_pence = total_pence - paid_pence
    return {
        "total_pence": total_pence,
        "paid_pence": paid_pence,
        "balance_pence": balance_pence,
        "is_fully_paid": balance_pence <= 0 and not has_pending_faults,
        "has_pending_faults": has_pending_faults,
    }


def financials_from_row(row) -> dict:
    """Convenience wrapper for a sqlite3.Row that includes the
    REPAIR_FINANCIALS_COLUMNS aliases.
    """
    return compute_financials(row["total_pence"], row["pending_count"], row["paid_pence"])
