"""Adding and reading payments on a repair ticket (spec section 4).

A ticket holds a list of payments, not a single Paid flag, so part
payments (deposit, then a top-up in cash or card) are just more rows.
Total/paid/balance are always derived from these rows -- see
backend.financials -- never stored as a fixed column.
"""
import sqlite3
from datetime import datetime

from backend.constants import PAYMENT_METHODS


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def add_payment(conn: sqlite3.Connection, *, ticket: str, amount_pence: int, method: str) -> None:
    """Record one payment against a ticket and touch its updated_at.

    Raises ValueError for a bad amount/method or an unknown ticket, so the
    route layer can turn that into a clean 400 rather than a crash.
    """
    if amount_pence <= 0:
        raise ValueError("Payment amount must be greater than zero")
    if method not in PAYMENT_METHODS:
        raise ValueError(f"Payment method must be one of {PAYMENT_METHODS}")

    repair = conn.execute(
        "SELECT ticket FROM repairs WHERE ticket = ? AND deleted_at IS NULL", (ticket,)
    ).fetchone()
    if repair is None:
        raise ValueError(f"Ticket {ticket} not found")

    now = _now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "INSERT INTO payments (ticket, amount_pence, method, paid_at) VALUES (?, ?, ?, ?)",
            (ticket, amount_pence, method, now),
        )
        conn.execute("UPDATE repairs SET updated_at = ? WHERE ticket = ?", (now, ticket))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def add_refund(conn: sqlite3.Connection, *, ticket: str, amount_pence: int, method: str) -> None:
    """Record a refund against a ticket -- money handed back, e.g. after a
    quoted-but-declined fault is removed post-payment, or an overpayment
    by mistake. Stored as a NEGATIVE row in the same `payments` table
    rather than a separate ledger or a cosmetic "resolved" flag: SUM()
    over that one table is already exactly what total/paid/balance are
    computed from (see backend.financials), so a refund correcting the real
    balance is just this one row, with zero changes needed anywhere else
    in the money math -- no new calculation path to ever drift from the
    original. Distinguished from a normal payment purely by sign (a
    negative amount_pence); presenters/receipts key off that to label it
    "Refund" instead of a plain payment line.

    The one invariant enforced: net paid (sum of every payment AND
    refund so far) can never go negative -- you can't hand back more
    than has genuinely been received, ever, in total. No cap beyond
    that: a refund can bring an overpaid ticket back past zero into
    owing money again if that's genuinely what happened (same
    permissive philosophy as payments and settling elsewhere in this
    app -- reflect reality, don't second-guess the till operator).
    """
    if amount_pence <= 0:
        raise ValueError("Refund amount must be greater than zero")
    if method not in PAYMENT_METHODS:
        raise ValueError(f"Payment method must be one of {PAYMENT_METHODS}")

    repair = conn.execute(
        "SELECT ticket FROM repairs WHERE ticket = ? AND deleted_at IS NULL", (ticket,)
    ).fetchone()
    if repair is None:
        raise ValueError(f"Ticket {ticket} not found")

    current_paid = conn.execute(
        "SELECT COALESCE(SUM(amount_pence), 0) AS paid FROM payments WHERE ticket = ?", (ticket,)
    ).fetchone()["paid"]
    if amount_pence > current_paid:
        raise ValueError(
            f"Can't refund more than has been paid so far ({current_paid / 100:.2f} received)"
        )

    now = _now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "INSERT INTO payments (ticket, amount_pence, method, paid_at) VALUES (?, ?, ?, ?)",
            (ticket, -amount_pence, method, now),
        )
        conn.execute("UPDATE repairs SET updated_at = ? WHERE ticket = ?", (now, ticket))
        conn.execute("COMMIT")
    except ValueError:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise


def add_split_payment(conn: sqlite3.Connection, *, ticket: str, cash_pence: int, card_pence: int) -> None:
    """Record a payment split across both methods in one atomic step --
    either both rows land or neither does, so a split can never end up
    half-recorded (e.g. the cash portion saved but the card portion lost
    to a dropped connection). A zero side is simply skipped, not an
    error, so picking "Cash + Card" but only filling one in still works
    -- it's then no different from a plain single-method payment.
    """
    if cash_pence < 0 or card_pence < 0:
        raise ValueError("Amount cannot be negative")
    if cash_pence == 0 and card_pence == 0:
        raise ValueError("Enter at least one amount")

    repair = conn.execute(
        "SELECT ticket FROM repairs WHERE ticket = ? AND deleted_at IS NULL", (ticket,)
    ).fetchone()
    if repair is None:
        raise ValueError(f"Ticket {ticket} not found")

    now = _now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        if cash_pence > 0:
            conn.execute(
                "INSERT INTO payments (ticket, amount_pence, method, paid_at) VALUES (?, ?, 'Cash', ?)",
                (ticket, cash_pence, now),
            )
        if card_pence > 0:
            conn.execute(
                "INSERT INTO payments (ticket, amount_pence, method, paid_at) VALUES (?, ?, 'Card', ?)",
                (ticket, card_pence, now),
            )
        conn.execute("UPDATE repairs SET updated_at = ? WHERE ticket = ?", (now, ticket))
        conn.execute("COMMIT")
    except ValueError:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise


def list_payments(conn: sqlite3.Connection, ticket: str) -> list[dict]:
    """All payments for a ticket, oldest first."""
    rows = conn.execute(
        "SELECT id, amount_pence, method, paid_at FROM payments WHERE ticket = ? ORDER BY id ASC",
        (ticket,),
    ).fetchall()
    return [dict(row) for row in rows]
