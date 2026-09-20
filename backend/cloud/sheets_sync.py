"""Pushing repair/sale rows to the two Google Sheets (spec section 10:
"the Sheet is a simple viewing window only, kept flat... one row per
ticket"). Two separate spreadsheets -- Repairs and Sales -- not two tabs
in one, per the owner's choice (repairs opened daily, sales rarely).

The Repairs Sheet is also what the public tracking page reads from, so
it only ever carries what a customer scanning the QR is already shown
(backend.services.tracking.get_public_repair_status) -- no phone, no
passcode.

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
from datetime import datetime
from typing import Optional

import gspread

from backend.cloud.google_auth import GoogleUnavailable, load_credentials
from backend.core.constants import STATUS_CUSTOMER_COPY
from backend.services.repairs import get_repair_detail
from backend.services.sales import get_sale

REPAIRS_HEADERS = ["Token", "Ticket", "Date", "Name", "Model", "Fault", "Status", "Status Detail", "Total", "Paid", "Remaining", "Updated"]
_REPAIRS_TICKET_COLUMN = REPAIRS_HEADERS.index("Ticket") + 1
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


def _find_row(worksheet: gspread.Worksheet, key: str, in_column: int = 1) -> Optional[int]:
    """Row number (1-indexed) whose given column matches `key`, or None.

    gspread's find() has changed behaviour across versions -- older
    releases raise CellNotFound when nothing matches, newer ones return
    None. Handling both here means this works regardless of exactly which
    gspread version is installed.
    """
    try:
        cell = worksheet.find(key, in_column=in_column)
    except gspread.exceptions.CellNotFound:
        return None
    return cell.row if cell else None


def _plain_amount(pence: Optional[int]) -> str:
    return f"{pence / 100:.2f}" if pence is not None else "Pending"


def status_from_title(title: str) -> str:
    """Reverses STATUS_CUSTOMER_COPY's title back to an internal status
    value, for restore.py. "Collected" is ambiguous -- both "Collected"
    and "Not Agreed/Fixed - Collected" show that same title to a
    customer -- so this defaults to the plain "Collected" case, the far
    more common of the two; that distinction is lost once a ticket only
    exists in the Sheet.
    """
    if title == "Collected":
        return "Collected"
    for status, copy in STATUS_CUSTOMER_COPY.items():
        if copy["title"] == title:
            return status
    return "Received"


def push_repair_row(conn: sqlite3.Connection, client: gspread.Client, sheet_id: str, ticket: str) -> None:
    """Update-or-append this ticket's row; delete the row instead if the
    ticket has been soft-deleted or purged entirely (spec: "all edits
    and deletes happen inside the app and sync to the Sheet") --
    get_repair_detail() already returns None for both, so one check
    covers both cases.
    """
    worksheet = _open_sheet(client, sheet_id, REPAIRS_HEADERS)
    row_number = _find_row(worksheet, ticket, in_column=_REPAIRS_TICKET_COLUMN)

    repair = get_repair_detail(conn, ticket)
    if repair is None:
        if row_number:
            worksheet.delete_rows(row_number)
        return

    faults = ", ".join(f["description"] for f in repair["faults"]) or "Diagnostic"
    copy = STATUS_CUSTOMER_COPY.get(repair["status"], {"title": repair["status"], "detail": ""})
    try:
        updated = datetime.fromisoformat(repair["updated_at"]).strftime("%d/%m/%Y %H:%M")
    except (TypeError, ValueError):
        updated = repair["updated_at"] or ""

    values = [
        repair["tracking_token"],
        repair["ticket"],
        repair["created_at"][:10],
        repair["name"],
        repair["model"],
        faults,
        copy["title"],
        copy["detail"],
        _plain_amount(repair["total_pence"]),
        _plain_amount(repair["paid_pence"]),
        _plain_amount(repair["balance_pence"]),
        updated,
    ]

    if row_number:
        last_col = chr(ord("A") + len(REPAIRS_HEADERS) - 1)
        worksheet.update(values=[values], range_name=f"A{row_number}:{last_col}{row_number}", value_input_option="USER_ENTERED")
    else:
        worksheet.append_row(values, value_input_option="USER_ENTERED")


def push_sale_row(conn: sqlite3.Connection, client: gspread.Client, sheet_id: str, sale_id: int) -> None:
    """Append-or-delete this sale's row; get_sale() already returns None
    for both soft-deleted and purged-entirely sales, so one check covers
    the row-cleanup for both.
    """
    worksheet = _open_sheet(client, sheet_id, SALES_HEADERS)
    key = str(sale_id)

    # Date alone isn't a unique lookup key (many sales share a day), so
    # rows are found again -- only ever needed for a delete -- via the
    # "Sale ID" column instead.
    row_number = _find_row_by_hidden_id(worksheet, key)

    sale = get_sale(conn, sale_id)
    if sale is None:
        if row_number:
            worksheet.delete_rows(row_number)
        return
    if row_number:
        return  # already synced and sales are never edited after creation

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
