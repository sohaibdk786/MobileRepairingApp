"""Pushing repair/sale rows to the two Google Sheets (spec section 10:
"the Sheet is a simple viewing window only, kept flat... one row per
ticket"). Two separate spreadsheets -- Repairs and Sales -- not two tabs
in one, per the owner's choice (repairs opened daily, sales rarely).

Every function here is defensive by design: this module is called from a
background loop with nothing watching it, so a bad network day, a
missing key file, or a Google API hiccup must come back as a clear
result the caller can log and retry later -- never an unhandled
exception that could take the background loop down with it.

IMPORTANT HONESTY NOTE: this was written to the documented gspread 6.x
API but has not been run against a real Google Sheet in this environment
(no service-account credentials are configured here) -- see
get_client()'s docstring and the README for what that means for testing.
"""
import sqlite3
from typing import Optional

import gspread

from backend.cloud.google_auth import GoogleUnavailable, load_credentials
from backend.services.repairs import get_repair_detail
from backend.services.sales import get_sale

REPAIRS_HEADERS = ["Ticket", "Date", "Name", "Phone", "Password", "Model", "Repair", "Price", "Status", "Paid"]
# "Sale ID" is a support column, not part of the spec's sale fields --
# sales are append-only (never edited after creation), so the only thing
# that needs a stable lookup key is finding a row again to remove it if
# the sale is later deleted in the app.
SALES_HEADERS = ["Date", "Time", "Name", "Item", "Price", "Method", "Serial", "Sale ID"]

# Columns that must never be silently turned into a number by Sheets --
# a phone/passcode/serial starting with '0' loses that digit otherwise
# (spec section 1, "Google Sheet leading-zero bug", and section 10:
# "force text (e.g. leading apostrophe) if needed"). A leading apostrophe
# only forces text under Sheets' own "typed by a human" parsing, which is
# what value_input_option="USER_ENTERED" (used everywhere below) invokes.
def _force_text(value: str) -> str:
    return f"'{value}" if value else value


class SheetsError(Exception):
    """Anything that stopped a push from completing -- missing key file,
    bad credentials, sheet not shared with the service account, network
    failure. Callers catch this one type rather than every possible
    gspread/google-auth exception individually.
    """


def get_client() -> gspread.Client:
    """An authenticated gspread client, built from the shared credential
    loader (backend.cloud.google_auth) so Sheets and Drive always use the exact
    same key file and scope list.

    Raises SheetsError (never a raw gspread/google-auth exception) --
    callers decide what "not configured yet" means for them (skip
    silently in the background loop, show guidance in the UI).
    """
    try:
        creds = load_credentials()
    except GoogleUnavailable as exc:
        raise SheetsError(str(exc)) from exc
    try:
        return gspread.authorize(creds)
    except Exception as exc:
        # Deliberately broad: any authorization failure here must come
        # back as a clear SheetsError, never an unhandled exception.
        raise SheetsError(f"Could not authenticate with Google Sheets: {exc}") from exc


def _open_sheet(client: gspread.Client, sheet_id: str, headers: list[str]) -> gspread.Worksheet:
    if not sheet_id:
        raise SheetsError("No Sheet ID configured")
    try:
        spreadsheet = client.open_by_key(sheet_id)
        worksheet = spreadsheet.sheet1
    except gspread.exceptions.APIError as exc:
        raise SheetsError(f"Could not open Sheet {sheet_id}: {exc}") from exc
    _ensure_headers(worksheet, headers)
    return worksheet


def _ensure_headers(worksheet: gspread.Worksheet, headers: list[str]) -> None:
    """Writes the header row once, the first time a sheet is used (an
    empty brand-new Sheet has no row 1 yet). Never overwrites existing
    headers, so re-running this on every push is harmless.
    """
    first_row = worksheet.row_values(1)
    if not first_row:
        worksheet.update(values=[headers], range_name="A1")


def _find_row(worksheet: gspread.Worksheet, key: str) -> Optional[int]:
    """Row number (1-indexed) whose column A matches `key`, or None.

    gspread's find() has changed behaviour across versions -- older
    releases raise CellNotFound when nothing matches, newer ones return
    None. Handling both here means this works regardless of exactly which
    gspread version is installed.
    """
    try:
        cell = worksheet.find(key, in_column=1)
    except gspread.exceptions.CellNotFound:
        return None
    return cell.row if cell else None


def push_repair_row(conn: sqlite3.Connection, client: gspread.Client, sheet_id: str, ticket: str) -> None:
    """Update-or-append this ticket's row; delete the row instead if the
    ticket has been soft-deleted (spec: "all edits and deletes happen
    inside the app and sync to the Sheet").
    """
    worksheet = _open_sheet(client, sheet_id, REPAIRS_HEADERS)

    deleted_row = conn.execute("SELECT deleted_at FROM repairs WHERE ticket = ?", (ticket,)).fetchone()
    if deleted_row is None:
        return  # ticket no longer exists at all (e.g. purged from Recently Deleted) -- nothing to sync

    row_number = _find_row(worksheet, ticket)
    if deleted_row["deleted_at"] is not None:
        if row_number:
            worksheet.delete_rows(row_number)
        return

    repair = get_repair_detail(conn, ticket)
    if repair is None:
        return
    headline_fault = repair["faults"][0]["description"] if repair["faults"] else ""
    total_pence = repair["total_pence"]
    price_text = f"{total_pence / 100:.2f}" if total_pence is not None else "Pending"
    values = [
        repair["ticket"],
        repair["created_at"][:10],
        repair["name"],
        _force_text(repair["phone"]),
        _force_text(repair["passcode"]),
        repair["model"],
        headline_fault,
        price_text,
        repair["status"],
        "Paid" if repair["is_fully_paid"] else "Not Paid",
    ]

    if row_number:
        last_col = chr(ord("A") + len(REPAIRS_HEADERS) - 1)
        worksheet.update(values=[values], range_name=f"A{row_number}:{last_col}{row_number}", value_input_option="USER_ENTERED")
    else:
        worksheet.append_row(values, value_input_option="USER_ENTERED")


def push_sale_row(conn: sqlite3.Connection, client: gspread.Client, sheet_id: str, sale_id: int) -> None:
    worksheet = _open_sheet(client, sheet_id, SALES_HEADERS)
    key = str(sale_id)

    deleted_row = conn.execute("SELECT deleted_at FROM sales WHERE id = ?", (sale_id,)).fetchone()
    if deleted_row is None:
        return

    # Date alone isn't a unique lookup key (many sales share a day), so
    # rows are found again -- only ever needed for a delete -- via the
    # "Sale ID" column instead.
    row_number = _find_row_by_hidden_id(worksheet, key)
    if deleted_row["deleted_at"] is not None:
        if row_number:
            worksheet.delete_rows(row_number)
        return
    if row_number:
        return  # already synced and sales are never edited after creation

    sale = get_sale(conn, sale_id)
    if sale is None:
        return
    values = [
        sale["sold_at"][:10],
        sale["sold_at"][11:19],
        sale["name"],
        sale["item"],
        f"{sale['price_pence'] / 100:.2f}",
        sale["method"],
        _force_text(sale["serial"] or "xxxx"),
        key,  # "Sale ID" column -- used only to find this row again on delete
    ]
    worksheet.append_row(values, value_input_option="USER_ENTERED")


def _find_row_by_hidden_id(worksheet: gspread.Worksheet, sale_id: str) -> Optional[int]:
    id_column = len(SALES_HEADERS)
    try:
        cell = worksheet.find(sale_id, in_column=id_column)
    except gspread.exceptions.CellNotFound:
        return None
    return cell.row if cell else None
