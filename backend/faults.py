"""Adding and reading fault lines on a repair ticket (spec section 4).

Faults are added over a job's life -- e.g. started as Screen, Battery
found later. Each fault line is its own price and, if added after the
ticket was created, carries a reason (one of the 3 tappable buttons) that
explains why the price rose.
"""
import sqlite3
from datetime import datetime
from typing import Optional

from backend.constants import COLLECTED_STATUSES


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def add_fault(
    conn: sqlite3.Connection,
    *,
    ticket: str,
    description: str,
    price_pence: Optional[int],
    reason: str,
) -> None:
    """Add a fault line to an existing ticket and touch its updated_at.

    `reason` should be one of FAULT_REASON_CHOICES, or the free-typed
    "Other" text (spec: if "Other" is picked and left blank, it stays
    "Other"). Raises ValueError if the ticket doesn't exist or is deleted.
    """
    description = description.strip()
    if not description:
        raise ValueError("Fault description is required")
    reason = reason.strip() or "Other"

    repair = conn.execute(
        "SELECT ticket FROM repairs WHERE ticket = ? AND deleted_at IS NULL", (ticket,)
    ).fetchone()
    if repair is None:
        raise ValueError(f"Ticket {ticket} not found")

    now = _now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            """
            INSERT INTO faults (ticket, description, price_pence, reason, added_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ticket, description, price_pence, reason, now),
        )
        conn.execute("UPDATE repairs SET updated_at = ? WHERE ticket = ?", (now, ticket))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def set_fault_price(conn: sqlite3.Connection, ticket: str, fault_id: int, price_pence: int) -> None:
    """Set or correct a fault's price -- works whether it's still pending
    (fills the original gap: a fault added later via Add Fault and left
    blank previously had no path to ever get a real price, not through
    Edit -- first fault only -- and not through any other route) or
    already has one (correcting a mistake, e.g. quoted 25 but it's
    actually 30). Either way it's a straightforward overwrite, stamping
    price_edited_at same as always.

    No status check here, unlike delete_fault -- correcting a price has
    always been allowed at any point (the first fault could always be
    corrected via ticket-level Edit, collected or not), so this is just
    extending that same standing rule to every fault, not a new one.
    """
    now = _now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cursor = conn.execute(
            "UPDATE faults SET price_pence = ?, price_edited_at = ? WHERE id = ? AND ticket = ?",
            (price_pence, now, fault_id, ticket),
        )
        if cursor.rowcount == 0:
            conn.execute("ROLLBACK")
            raise ValueError(f"Fault {fault_id} not found on {ticket}")
        conn.execute("UPDATE repairs SET updated_at = ? WHERE ticket = ?", (now, ticket))
        conn.execute("COMMIT")
    except ValueError:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise


def delete_fault(conn: sqlite3.Connection, ticket: str, fault_id: int) -> None:
    """Remove a fault line the customer decided not to go ahead with.

    Allowed at any point up until the phone is actually collected
    (COLLECTED_STATUSES) -- regardless of whether the fault has a price
    on it. Once collected, the faults list is the settled record of what
    was actually done and charged, not still-editable; before that,
    correcting it by removing a line entirely (not just zeroing its
    price) is fine. The frontend is the one that decides whether to warn
    first -- a priced fault changes the total, a pending or £0 one
    doesn't, so only the former gets a confirmation with the amount in
    it; this function itself doesn't distinguish the two.

    Also refuses to remove the last remaining fault -- a repair ticket
    describes at least one thing wrong with the phone by definition; zero
    fault lines would leave Faults/Price/Money all blank with nothing to
    say why the ticket exists.
    """
    repair = conn.execute(
        "SELECT ticket, status FROM repairs WHERE ticket = ? AND deleted_at IS NULL", (ticket,)
    ).fetchone()
    if repair is None:
        raise ValueError(f"Ticket {ticket} not found")
    if repair["status"] in COLLECTED_STATUSES:
        raise ValueError("Can't remove a fault once the ticket has been collected")

    now = _now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        count_row = conn.execute(
            "SELECT COUNT(*) AS n FROM faults WHERE ticket = ?", (ticket,)
        ).fetchone()
        if count_row["n"] <= 1:
            conn.execute("ROLLBACK")
            raise ValueError("Can't remove the only fault on a ticket")
        cursor = conn.execute(
            "DELETE FROM faults WHERE id = ? AND ticket = ?",
            (fault_id, ticket),
        )
        if cursor.rowcount == 0:
            conn.execute("ROLLBACK")
            raise ValueError(f"Fault {fault_id} not found on {ticket}")
        conn.execute("UPDATE repairs SET updated_at = ? WHERE ticket = ?", (now, ticket))
        conn.execute("COMMIT")
    except ValueError:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise


def list_faults(conn: sqlite3.Connection, ticket: str) -> list[dict]:
    """All fault lines for a ticket, oldest first (so the intake fault is
    always first -- matches how the "old price struck through -> new
    price" story reads on the detail screen).
    """
    rows = conn.execute(
        "SELECT id, description, price_pence, reason, added_at, price_edited_at "
        "FROM faults WHERE ticket = ? ORDER BY id ASC",
        (ticket,),
    ).fetchall()
    return [dict(row) for row in rows]
