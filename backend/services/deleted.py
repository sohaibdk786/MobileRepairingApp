"""Recently Deleted: soft-deleted repairs and sales, restorable for 3
calendar days, then permanently purged (spec section 9).
"""
import sqlite3
from datetime import datetime, timedelta

from backend.services.sync_queue import enqueue_repair, enqueue_sale


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

    Enqueues a final sync before deleting, even though the earlier soft
    delete already did too -- if that first sync never actually completed
    (Sheets unreachable, not yet drained), the row would otherwise be
    gone from the database with nothing left to tell the Sheet to drop
    it too. push_repair_row() drops the Sheet row for any ticket it's
    asked to sync that no longer exists in the database, purged or not.
    """
    for ticket in tickets:
        enqueue_repair(conn, ticket)
        conn.execute("DELETE FROM payments WHERE ticket = ?", (ticket,))
        conn.execute("DELETE FROM faults WHERE ticket = ?", (ticket,))
        conn.execute("DELETE FROM repairs WHERE ticket = ?", (ticket,))


def _purge_sales(conn: sqlite3.Connection, sale_ids: list[int]) -> None:
    """Same reasoning as _purge_tickets(): enqueue a final sync before
    deleting, so a sale row can never be left behind on the Sheet.
    """
    for sale_id in sale_ids:
        enqueue_sale(conn, sale_id)
        conn.execute("DELETE FROM sales WHERE id = ?", (sale_id,))


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

    expired_sale_ids = [
        row["id"]
        for row in conn.execute(
            "SELECT id FROM sales WHERE deleted_at IS NOT NULL AND date(deleted_at) <= ?",
            (cutoff_date,),
        ).fetchall()
    ]
    _purge_sales(conn, expired_sale_ids)
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

    all_sale_ids = [
        row["id"] for row in conn.execute("SELECT id FROM sales WHERE deleted_at IS NOT NULL").fetchall()
    ]
    _purge_sales(conn, all_sale_ids)
    conn.commit()
