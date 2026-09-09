"""Local ticket-number generation (spec section 4: 'DF' + 4 digits).

Numbers are generated locally and instantly so printing never waits on a
network round trip -- that round trip was the #1 problem with the old
tool. The next number is always read from the highest existing ticket
already in the DB, never kept as a separate counter that could drift from
reality, and never hardcoded. That is also what makes the future one-time
import (spec section 12) safe: imported old tickets and new ones can never
collide, because "next" is always "one past whatever is actually there".
"""
import sqlite3

TICKET_PREFIX = "DF"
TICKET_DIGITS = 4


def generate_next_ticket_number(conn: sqlite3.Connection) -> str:
    """Must be called inside the same transaction that inserts the new
    repair row (see repairs.create_repair), so two tickets can't be handed
    out for the same number.
    """
    row = conn.execute(
        "SELECT MAX(CAST(SUBSTR(ticket, 3) AS INTEGER)) AS highest "
        "FROM repairs WHERE ticket LIKE 'DF%'"
    ).fetchone()
    highest = row["highest"] or 0
    next_number = highest + 1
    return f"{TICKET_PREFIX}{next_number:0{TICKET_DIGITS}d}"
