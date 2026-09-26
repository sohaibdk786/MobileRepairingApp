"""Shop Details and printer settings -- the editable, non-hardcoded
values that receipts and printing depend on (spec section 11: "shop
details are an editable setting, NOT hardcoded"; "the printer name lives
in one setting, not hardcoded").

Held in the database (the one-row `shop_settings` table) rather than a
config file, because it needs to travel with the .db backup -- if the
manager's phone number changes, that correction should survive a restore
from Drive the same way a repair ticket does. The printer name and
currency display mode live in the same row: both are small, single-value
app settings with nowhere more natural to sit than alongside the rest of
"how this shop's receipts look".
"""
import sqlite3

from backend.core.constants import CURRENCY_CHOICES

VALID_CURRENCY_CODES = {c["code"] for c in CURRENCY_CHOICES}
VALID_PRINT_STYLES = ("sign", "text")


def get_shop_settings(conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT * FROM shop_settings WHERE id = 1").fetchone()
    return dict(row)


def get_currency_code(conn: sqlite3.Connection) -> str:
    """Convenience for the many places (every money-formatting route)
    that only need the currency, not the whole shop_settings row -- so a
    currency picked in Tools > Shop Details shows the same symbol
    everywhere in the app, on screen and on receipts alike, not just
    wherever the full settings row happened to already be loaded.
    """
    row = conn.execute("SELECT currency_code FROM shop_settings WHERE id = 1").fetchone()
    return row["currency_code"] if row else "GBP"


def get_shop_name(conn: sqlite3.Connection) -> str:
    """Convenience for ticket-number generation (backend/services/
    ticket_numbers.py), which only needs the shop name, not the whole row.
    """
    row = conn.execute("SELECT shop_name FROM shop_settings WHERE id = 1").fetchone()
    return row["shop_name"] if row else ""


def update_shop_settings(
    conn: sqlite3.Connection,
    *,
    shop_name: str,
    address: str,
    manager_name: str,
    terms_and_conditions: str,
    warranty_days: int,
    currency_code: str,
    currency_print_style: str,
    public_base_url: str = "",
    shop_website_url: str = "",
    email: str = "",
    maps_url: str = "",
    receipt_phone: str = "",
    public_phone: str = "",
    tracker_site_url: str = "",
) -> None:
    """Plain edit and save, no confirm step (spec section 11) -- this is a
    back-office setting, not a counter action that needs a duplicate guard.
    """
    shop_name = shop_name.strip()
    address = address.strip()
    manager_name = manager_name.strip()
    terms_and_conditions = terms_and_conditions.strip()
    # No format check -- same reasoning as address/phone above: a
    # back-office field, not a counter action worth validating against.
    public_base_url = public_base_url.strip().rstrip("/")
    shop_website_url = shop_website_url.strip()
    email = email.strip()
    maps_url = maps_url.strip()
    receipt_phone = receipt_phone.strip()
    public_phone = public_phone.strip()
    tracker_site_url = tracker_site_url.strip()

    if not shop_name:
        raise ValueError("Shop name is required")
    if not manager_name:
        raise ValueError("Manager name is required")
    if warranty_days < 0:
        raise ValueError("Warranty days cannot be negative")
    if currency_code not in VALID_CURRENCY_CODES:
        raise ValueError(f"Currency must be one of {sorted(VALID_CURRENCY_CODES)}")
    if currency_print_style not in VALID_PRINT_STYLES:
        raise ValueError(f"Currency print style must be one of {VALID_PRINT_STYLES}")

    conn.execute(
        """
        UPDATE shop_settings
        SET shop_name = ?, address = ?, manager_name = ?,
            terms_and_conditions = ?, warranty_days = ?, currency_code = ?,
            currency_print_style = ?, public_base_url = ?,
            shop_website_url = ?, email = ?, maps_url = ?, receipt_phone = ?,
            public_phone = ?, tracker_site_url = ?
        WHERE id = 1
        """,
        (
            shop_name,
            address,
            manager_name,
            terms_and_conditions,
            warranty_days,
            currency_code,
            currency_print_style,
            public_base_url,
            shop_website_url,
            email,
            maps_url,
            receipt_phone,
            public_phone,
            tracker_site_url,
        ),
    )
    conn.commit()


def set_printer_name(conn: sqlite3.Connection, printer_name: str) -> None:
    """Saved from Tools > Detect printers > pick from the list QZ Tray
    reports -- never typed by hand, so no format validation needed here.
    """
    conn.execute("UPDATE shop_settings SET printer_name = ? WHERE id = 1", (printer_name.strip(),))
    conn.commit()
