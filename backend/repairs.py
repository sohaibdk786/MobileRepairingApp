"""Repair ticket business logic.

The one place that creates, reads, and changes repair tickets, so this
logic never gets duplicated across screens (spec section 16: "a single
place for each concern").
"""
import sqlite3
from datetime import datetime
from typing import Optional

from backend.constants import DEFAULT_STATUS, STATUS_CHOICES
from backend.faults import list_faults
from backend.financials import REPAIR_FINANCIALS_COLUMNS, REPAIR_FINANCIALS_JOIN, financials_from_row
from backend.payments import list_payments
from backend.ticket_numbers import generate_next_ticket_number

# Sentinel distinguishing "this field was not included in the edit
# request" from "set this field to None" -- needed because price_pence's
# real value can legitimately be None (pending).
_UNSET = object()


def _now_iso() -> str:
    # Local system clock only (spec section 11): never hardcode a timezone
    # or offset. Windows already applies the UK daylight-saving shift to
    # the PC's own clock, so reading local time here is always correct.
    return datetime.now().isoformat(timespec="seconds")


def create_repair(
    conn: sqlite3.Connection,
    *,
    name: str,
    phone: str,
    passcode: str,
    model: str,
    fault_description: str,
    price_pence: Optional[int],
) -> str:
    """Create a new repair ticket with its first fault line.

    Returns the new ticket number. Raises ValueError on missing required
    fields -- the caller (route layer) turns that into a clean 400
    response rather than a crash.
    """
    name = name.strip()
    model = model.strip()
    fault_description = fault_description.strip()
    if not name:
        raise ValueError("Name is required")
    if not model:
        raise ValueError("Model is required")
    if not fault_description:
        raise ValueError("Fault is required")

    now = _now_iso()

    # BEGIN IMMEDIATE + the ticket-number read happen inside one
    # transaction, so two near-simultaneous saves can't both read the same
    # "highest number" and collide on the same ticket number.
    conn.execute("BEGIN IMMEDIATE")
    try:
        ticket = generate_next_ticket_number(conn)
        conn.execute(
            """
            INSERT INTO repairs
                (ticket, created_at, updated_at, name, phone, passcode, model, status, settled, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '')
            """,
            (ticket, now, now, name, phone.strip(), passcode.strip(), model, DEFAULT_STATUS),
        )
        conn.execute(
            """
            INSERT INTO faults (ticket, description, price_pence, reason, added_at)
            VALUES (?, ?, ?, '', ?)
            """,
            (ticket, fault_description, price_pence, now),
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return ticket


def get_last_repair(conn: sqlite3.Connection) -> Optional[dict]:
    """Most recently created, non-deleted repair, plus its first (intake)
    fault's description/price. Used for both the Reprint screen's "last
    repair" button and the identical-to-last-print duplicate check.
    """
    row = conn.execute(
        "SELECT * FROM repairs WHERE deleted_at IS NULL ORDER BY created_at DESC, ticket DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    repair = dict(row)
    first_fault = conn.execute(
        "SELECT description, price_pence FROM faults WHERE ticket = ? ORDER BY id ASC LIMIT 1",
        (repair["ticket"],),
    ).fetchone()
    repair["first_fault_description"] = first_fault["description"] if first_fault else None
    repair["first_fault_price_pence"] = first_fault["price_pence"] if first_fault else None
    return repair


def find_matching_last_repair(
    conn: sqlite3.Connection,
    *,
    name: str,
    phone: str,
    passcode: str,
    model: str,
    fault_description: str,
    price_pence: Optional[int],
) -> Optional[str]:
    """Spec section 4, "Identical-to-last-print check": if every typed
    field matches the last saved ticket exactly (auto date/time excluded
    by design -- we never compare timestamps here), return that ticket
    number so the caller can ask the user what they meant. Returns None if
    this is a genuinely new ticket.
    """
    last = get_last_repair(conn)
    if last is None:
        return None
    if (
        last["name"] == name.strip()
        and last["phone"] == phone.strip()
        and last["passcode"] == passcode.strip()
        and last["model"] == model.strip()
        and last["first_fault_description"] == fault_description.strip()
        and last["first_fault_price_pence"] == price_pence
    ):
        return last["ticket"]
    return None


def get_repair_detail(conn: sqlite3.Connection, ticket: str) -> Optional[dict]:
    """Everything the universal ticket detail screen needs in one call:
    the repair row, its computed financials, its faults, and its
    payments. Returns None if the ticket doesn't exist or is deleted.
    """
    row = conn.execute(
        f"SELECT r.*, {REPAIR_FINANCIALS_COLUMNS} "
        f"FROM repairs r {REPAIR_FINANCIALS_JOIN} "
        f"WHERE r.ticket = ? AND r.deleted_at IS NULL",
        (ticket,),
    ).fetchone()
    if row is None:
        return None
    detail = dict(row)
    detail.update(financials_from_row(row))
    detail["faults"] = list_faults(conn, ticket)
    detail["payments"] = list_payments(conn, ticket)
    return detail


def update_status(conn: sqlite3.Connection, ticket: str, new_status: str) -> None:
    if new_status not in STATUS_CHOICES:
        raise ValueError(f"Status must be one of {STATUS_CHOICES}")
    now = _now_iso()
    cursor = conn.execute(
        "UPDATE repairs SET status = ?, updated_at = ? WHERE ticket = ? AND deleted_at IS NULL",
        (new_status, now, ticket),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Ticket {ticket} not found")
    conn.commit()


def set_settled(conn: sqlite3.Connection, ticket: str, settled: bool) -> None:
    now = _now_iso()
    cursor = conn.execute(
        "UPDATE repairs SET settled = ?, updated_at = ? WHERE ticket = ? AND deleted_at IS NULL",
        (1 if settled else 0, now, ticket),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Ticket {ticket} not found")
    conn.commit()


def edit_repair(
    conn: sqlite3.Connection,
    ticket: str,
    *,
    name: Optional[str] = None,
    phone: Optional[str] = None,
    passcode: Optional[str] = None,
    model: Optional[str] = None,
    notes: Optional[str] = None,
    price_pence=_UNSET,
) -> bool:
    """Update only the fields whose value actually changed, stamping each
    changed field with its own '<field>_edited_at' timestamp.

    Spec ("Edit behaviour"): untouched fields show no stamp, and if
    nothing changed at all, nothing updates -- not even updated_at. Text
    fields left as None here mean "not supplied, leave alone". price_pence
    needs a sentinel default because None is itself a valid target value
    (pending) -- see the "Edit vs price" decision: Edit only ever corrects
    the intake (first) fault's price; new work goes through Add Fault.

    Returns True if anything actually changed.
    """
    current = conn.execute(
        "SELECT * FROM repairs WHERE ticket = ? AND deleted_at IS NULL", (ticket,)
    ).fetchone()
    if current is None:
        raise ValueError(f"Ticket {ticket} not found")

    now = _now_iso()
    repair_updates: dict = {}
    stamp_updates: dict = {}

    def maybe_update_text(field: str, new_value: Optional[str]) -> None:
        if new_value is None:
            return
        new_value = new_value.strip()
        if new_value != current[field]:
            repair_updates[field] = new_value
            stamp_updates[f"{field}_edited_at"] = now

    maybe_update_text("name", name)
    maybe_update_text("phone", phone)
    maybe_update_text("passcode", passcode)
    maybe_update_text("model", model)
    maybe_update_text("notes", notes)

    first_fault = None
    fault_price_changed = False
    if price_pence is not _UNSET:
        first_fault = conn.execute(
            "SELECT id, price_pence FROM faults WHERE ticket = ? ORDER BY id ASC LIMIT 1", (ticket,)
        ).fetchone()
        if first_fault is not None and first_fault["price_pence"] != price_pence:
            fault_price_changed = True

    if not repair_updates and not fault_price_changed:
        return False  # nothing changed -- do not touch updated_at or sync anything

    conn.execute("BEGIN IMMEDIATE")
    try:
        all_updates = {**repair_updates, **stamp_updates, "updated_at": now}
        set_clause = ", ".join(f"{col} = ?" for col in all_updates)
        conn.execute(
            f"UPDATE repairs SET {set_clause} WHERE ticket = ?",
            (*all_updates.values(), ticket),
        )
        if fault_price_changed:
            conn.execute(
                "UPDATE faults SET price_pence = ?, price_edited_at = ? WHERE id = ?",
                (price_pence, now, first_fault["id"]),
            )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return True


def soft_delete_repair(conn: sqlite3.Connection, ticket: str) -> None:
    now = _now_iso()
    cursor = conn.execute(
        "UPDATE repairs SET deleted_at = ?, updated_at = ? WHERE ticket = ? AND deleted_at IS NULL",
        (now, now, ticket),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Ticket {ticket} not found or already deleted")
    conn.commit()


def restore_repair(conn: sqlite3.Connection, ticket: str) -> None:
    now = _now_iso()
    cursor = conn.execute(
        "UPDATE repairs SET deleted_at = NULL, updated_at = ? WHERE ticket = ? AND deleted_at IS NOT NULL",
        (now, ticket),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Ticket {ticket} not found in Recently Deleted")
    conn.commit()
