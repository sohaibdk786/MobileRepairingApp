"""The local queue behind background Sheet pushes (spec section 10:
"Every save pushes the row up in the background... If offline, the row
queues locally and uploads when back").

A row means "this ticket/sale's Sheet row is stale, push it when
possible". Callers (the repair/sale API routes) enqueue after every
successful write; backend.background_tasks drains the queue on a timer.
Persisted in SQLite rather than kept in memory so a crash or restart
never silently drops a pending sync -- it's just still in the queue next
time the app starts.
"""
import sqlite3
from datetime import datetime


def enqueue_repair(conn: sqlite3.Connection, ticket: str) -> None:
    _enqueue(conn, "repair", ticket)


def enqueue_sale(conn: sqlite3.Connection, sale_id: int) -> None:
    _enqueue(conn, "sale", str(sale_id))


def _enqueue(conn: sqlite3.Connection, entity_type: str, entity_id: str) -> None:
    now = datetime.now().isoformat(timespec="seconds")
    # A second save before the queue drains just refreshes queued_at --
    # only the latest state needs pushing, so there's no reason to keep
    # more than one pending entry per ticket/sale.
    conn.execute(
        """
        INSERT INTO sync_queue (entity_type, entity_id, queued_at)
        VALUES (?, ?, ?)
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET queued_at = excluded.queued_at
        """,
        (entity_type, entity_id, now),
    )
    conn.commit()


def list_pending(conn: sqlite3.Connection) -> list[dict]:
    """Oldest first, so the queue drains in the order things happened."""
    rows = conn.execute("SELECT * FROM sync_queue ORDER BY queued_at ASC, id ASC").fetchall()
    return [dict(row) for row in rows]


def remove(conn: sqlite3.Connection, queue_id: int) -> None:
    conn.execute("DELETE FROM sync_queue WHERE id = ?", (queue_id,))
    conn.commit()


def count_pending(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM sync_queue").fetchone()
    return row["n"]
