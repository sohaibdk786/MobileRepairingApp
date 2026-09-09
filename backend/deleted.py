"""Recently Deleted: soft-deleted repairs and sales, restorable for 3
calendar days, then permanently purged (spec section 9).
"""
import sqlite3
from datetime import datetime, timedelta


def list_recently_deleted(conn: sqlite3.Connection) -> dict:
    """Returns {'repairs': [...], 'sales': [...]}, newest-deleted first."""
    repairs = conn.execute(
        "SELECT ticket, name, model, status, deleted_at FROM repairs "
        "WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    ).fetchall()
    sales = conn.execute(
        "SELECT id, name, item, price_pence, deleted_at FROM sales "
        "WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    ).fetchall()
    return {"repairs": [dict(r) for r in repairs], "sales": [dict(s) for s in sales]}


def _purge_tickets(conn: sqlite3.Connection, tickets: list[str]) -> None:
    """Faults and payments are deleted first, then the repair row --
    foreign keys are enforced (PRAGMA foreign_keys = ON in database.py),
    so an orphaned child row would block the parent delete otherwise. This
    is a real permanent purge, not another soft delete: once purged, the
    history is genuinely gone.
    """
    for ticket in tickets:
        conn.execute("DELETE FROM payments WHERE ticket = ?", (ticket,))
        conn.execute("DELETE FROM faults WHERE ticket = ?", (ticket,))
        conn.execute("DELETE FROM repairs WHERE ticket = ?", (ticket,))


def purge_expired(conn: sqlite3.Connection, *, retention_days: int = 3) -> None:
    """Permanently remove anything deleted 3 or more CALENDAR days ago
    (spec: "kept 3 calendar days from the deleted date ... auto-cleared on
    the next app startup past that mark"). Called once at startup, not on
    every request -- this is background housekeeping, not a user action.

    Calendar days, not 72 hours: something deleted at 23:55 on day 1 is
    cleared as soon as day 4 begins, not after exactly 72 hours.
    """
    cutoff_date = (datetime.now() - timedelta(days=retention_days)).date().isoformat()

    expired_tickets = [
        row["ticket"]
        for row in conn.execute(
            "SELECT ticket FROM repairs WHERE deleted_at IS NOT NULL AND date(deleted_at) <= ?",
            (cutoff_date,),
        ).fetchall()
    ]
    _purge_tickets(conn, expired_tickets)

    conn.execute(
        "DELETE FROM sales WHERE deleted_at IS NOT NULL AND date(deleted_at) <= ?", (cutoff_date,)
    )
    conn.commit()


def purge_all(conn: sqlite3.Connection) -> None:
    """Permanently remove EVERYTHING currently in Recently Deleted, not
    just what's past the 3-day mark -- a user-triggered "empty it now"
    action (Tools > Recently Deleted > Delete All), gated behind a
    confirmation on the frontend since this is unrecoverable.
    """
    all_tickets = [
        row["ticket"]
        for row in conn.execute("SELECT ticket FROM repairs WHERE deleted_at IS NOT NULL").fetchall()
    ]
    _purge_tickets(conn, all_tickets)

    conn.execute("DELETE FROM sales WHERE deleted_at IS NOT NULL")
    conn.commit()
