"""Sale business logic -- the counter's Quick Sale box (spec section 5).

Unlike a repair, a sale is a single transaction: no status, no payments
list, one row start to finish. Sales are saved (not just printed) so a
misprint can be reprinted and phone IMEIs have a record.
"""
import sqlite3
from datetime import datetime
from typing import Optional

from backend.constants import PAYMENT_METHODS


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def create_sale(
    conn: sqlite3.Connection,
    *,
    name: str,
    item: str,
    price_pence: int,
    method: str,
    serial: str,
) -> int:
    """Save a sale. Returns its new row id.

    Serial/IMEI is stored exactly as typed, blank or not -- the "prints
    xxxx if empty" behaviour (spec section 5) is a receipt-formatting
    concern for Phase 3, not something baked into storage here.
    """
    name = name.strip()
    item = item.strip()
    if not name:
        raise ValueError("Name is required")
    if not item:
        raise ValueError("Item is required")
    if price_pence is None:
        raise ValueError("Price is required for a sale")
    if price_pence < 0:
        raise ValueError("Price cannot be negative")
    if method not in PAYMENT_METHODS:
        raise ValueError(f"Payment method must be one of {PAYMENT_METHODS}")

    now = _now_iso()
    cursor = conn.execute(
        """
        INSERT INTO sales (sold_at, name, item, price_pence, method, serial)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (now, name, item, price_pence, method, serial.strip()),
    )
    conn.commit()
    return cursor.lastrowid


def get_sale(conn: sqlite3.Connection, sale_id: int) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL", (sale_id,)
    ).fetchone()
    return dict(row) if row else None


def get_last_sale(conn: sqlite3.Connection) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM sales WHERE deleted_at IS NULL ORDER BY sold_at DESC, id DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


def find_matching_last_sale(
    conn: sqlite3.Connection, *, name: str, item: str, price_pence: int, method: str, serial: str
) -> Optional[int]:
    """Spec section 5, sale duplicate check: if every typed field matches
    the last saved sale exactly (auto time excluded), return its id so the
    caller can ask "Same as last sale, print again?" instead of silently
    saving a second identical row from a double-click.
    """
    last = get_last_sale(conn)
    if last is None:
        return None
    if (
        last["name"] == name.strip()
        and last["item"] == item.strip()
        and last["price_pence"] == price_pence
        and last["method"] == method
        and last["serial"] == serial.strip()
    ):
        return last["id"]
    return None


def edit_sale(
    conn: sqlite3.Connection,
    sale_id: int,
    *,
    name: str,
    item: str,
    price_pence: int,
    method: str,
    serial: str,
) -> None:
    """Plain edit and save, no confirm step -- unlike a repair, a sale is
    a single one-shot transaction with no per-field edit history to
    preserve, so a straightforward overwrite (same validation as
    create_sale) is enough; no partial-update/edited-stamp machinery.
    """
    name = name.strip()
    item = item.strip()
    if not name:
        raise ValueError("Name is required")
    if not item:
        raise ValueError("Item is required")
    if price_pence is None:
        raise ValueError("Price is required for a sale")
    if price_pence < 0:
        raise ValueError("Price cannot be negative")
    if method not in PAYMENT_METHODS:
        raise ValueError(f"Payment method must be one of {PAYMENT_METHODS}")

    cursor = conn.execute(
        """
        UPDATE sales SET name = ?, item = ?, price_pence = ?, method = ?, serial = ?
        WHERE id = ? AND deleted_at IS NULL
        """,
        (name, item, price_pence, method, serial.strip(), sale_id),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Sale {sale_id} not found")
    conn.commit()


def add_sale_refund(conn: sqlite3.Connection, sale_id: int, amount_pence: int) -> None:
    """Record money handed back on a sale -- a return, or an overcharge.

    A sale has no payments ledger (one price, paid once at the till), so
    unlike a repair this isn't its own row -- it accumulates into
    `refunded_pence` on the sale itself. The one invariant: total
    refunded can never exceed what the sale was actually worth
    (price_pence) -- can't hand back more than was ever received.
    """
    if amount_pence <= 0:
        raise ValueError("Refund amount must be greater than zero")

    sale = conn.execute(
        "SELECT price_pence, refunded_pence FROM sales WHERE id = ? AND deleted_at IS NULL", (sale_id,)
    ).fetchone()
    if sale is None:
        raise ValueError(f"Sale {sale_id} not found")

    new_total = sale["refunded_pence"] + amount_pence
    if new_total > sale["price_pence"]:
        raise ValueError(
            f"Can't refund more than the sale was worth "
            f"({(sale['price_pence'] - sale['refunded_pence']) / 100:.2f} left refundable)"
        )

    cursor = conn.execute(
        "UPDATE sales SET refunded_pence = ? WHERE id = ? AND deleted_at IS NULL",
        (new_total, sale_id),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Sale {sale_id} not found")
    conn.commit()


def soft_delete_sale(conn: sqlite3.Connection, sale_id: int) -> None:
    now = _now_iso()
    cursor = conn.execute(
        "UPDATE sales SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", (now, sale_id)
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Sale {sale_id} not found or already deleted")
    conn.commit()


def restore_sale(conn: sqlite3.Connection, sale_id: int) -> None:
    cursor = conn.execute(
        "UPDATE sales SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL", (sale_id,)
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Sale {sale_id} not found in Recently Deleted")
    conn.commit()
