"""Pushing repair rows to the Repairs Google Sheet (spec section 10:
"the Sheet is a simple viewing window only, kept flat... one row per
ticket"), and the one fixed row of the Shop Details Sheet (feeds the
business card + tracker sites' contact info, pushed straight from Tools
> Shop Details, not through the background queue -- see routes/tools.py).
Sales sync was removed -- sales are already fully recorded in the local
database, and CSV export (backend/routes/cloud.py) covers getting them
out when needed.

The Repairs Sheet is also what the public tracking page reads from, so
it only ever carries what a customer scanning the QR could end up
being shown (backend.services.tracking.get_public_repair_status) --
still no phone, no passcode. Notes is the one field that's genuinely
staff-written but customer-facing on purpose: the shop can leave a
message for whoever scans the QR by typing it into the ticket's Notes
field. This column always carries whatever Notes currently holds,
blank or not -- it's the reading side (the tracking page itself) that
decides a blank one means nothing to show.

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
from backend.services.shop_settings import get_shop_settings

REPAIRS_HEADERS = ["Token", "Ticket", "Date", "Name", "Model", "Fault", "Status", "Status Detail", "Total", "Paid", "Remaining", "Updated", "Notes"]
_REPAIRS_TICKET_COLUMN = REPAIRS_HEADERS.index("Ticket") + 1

# One fixed row, never appended or deleted -- a single shop only ever has
# one set of details, so every push just overwrites row 2 in place. Public
# phone only (not receipt_phone) -- this Sheet is read by the public
# tracker site, same "nothing here a customer couldn't already be shown"
# rule as the Repairs Sheet. Header names matter here, not just order --
# the tracker reads this Sheet itself (Customer_QR_Site/index.html) and
# looks fields up by a normalized version of the header (lowercased,
# spaces to underscores), so these must stay "Shop Name" -> shop_name,
# "Phones" -> phones, "Maps URL" -> maps_url, exactly matching that
# page's SHOP_FIELDS list. No Collection Policy column -- the tracker
# keeps that fixed in its own code, not synced live from here.
SHOP_DETAILS_HEADERS = ["Shop Name", "Address", "Phones", "Email", "Maps URL", "Updated"]


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


def open_by_key(client: gspread.Client, sheet_id: str) -> gspread.Spreadsheet:
    """The one place `client.open_by_key()` gets called -- every caller
    (this module's own pushes, restore.py's Sheet-import fallback) goes
    through here so a bad/mistyped/no-longer-shared Sheet ID always comes
    back as a clear SheetsError, never a raw gspread exception. Catches
    GSpreadException (the base class), not just APIError -- a wrong ID
    raises SpreadsheetNotFound instead, a sibling class, not a subclass.
    """
    if not sheet_id:
        raise SheetsError("No Sheet ID configured")
    try:
        return client.open_by_key(sheet_id)
    except gspread.exceptions.GSpreadException as exc:
        raise SheetsError(f"Could not open Sheet {sheet_id}: {exc}") from exc


def _open_sheet(client: gspread.Client, sheet_id: str, headers: list[str]) -> gspread.Worksheet:
    spreadsheet = open_by_key(client, sheet_id)
    worksheet = spreadsheet.sheet1
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
    """Row number (1-indexed) whose given column matches `key`, or None
    if nothing matches.

    gspread's own find() already returns None on a miss (confirmed
    against the installed gspread 6.x: it's a plain Optional[Cell]
    return, not an exception) -- previously this also caught a
    gspread.exceptions.CellNotFound that doesn't exist on this version,
    which would itself have raised AttributeError instead of returning
    None the moment anything ever hit that branch.
    """
    cell = worksheet.find(key, in_column=in_column)
    return cell.row if cell else None


def _plain_amount(pence: Optional[int]) -> str:
    return f"{pence / 100:.2f}" if pence is not None else "Pending"


def status_from_title(title: str) -> str:
    """Reverses STATUS_CUSTOMER_COPY's title back to an internal status
    value, for restore.py. Every title is unique now (Not Agreed/Fixed -
    Collected has its own "Not repaired" title, not a second "Collected"),
    so this is a plain 1:1 lookup -- no more guessing which internal
    status a Sheet-only "Collected" title came from.
    """
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
        repair["notes"],
    ]

    # RAW, not USER_ENTERED -- USER_ENTERED auto-converts numeric-looking
    # text into real Number/Date cells, and once a column is mostly real
    # numbers, Google's public gviz endpoint (what the tracker site reads)
    # infers the whole column as numeric and silently nulls out any
    # leftover text value in it (e.g. "Pending" for an unpriced fault).
    # RAW stores every value exactly as given, so gviz returns it exactly
    # as given too -- same fix already applied to the Shop Details Sheet
    # push below, for the same underlying reason.
    if row_number:
        last_col = chr(ord("A") + len(REPAIRS_HEADERS) - 1)
        worksheet.update(values=[values], range_name=f"A{row_number}:{last_col}{row_number}", value_input_option="RAW")
    else:
        worksheet.append_row(values, value_input_option="RAW")


def push_shop_details_row(conn: sqlite3.Connection, client: gspread.Client, sheet_id: str) -> None:
    """Overwrite the Shop Details Sheet's one row with the current Shop
    Details settings. Always row 2 -- no find-by-key needed, since there's
    only ever one shop.
    """
    worksheet = _open_sheet(client, sheet_id, SHOP_DETAILS_HEADERS)
    shop = get_shop_settings(conn)
    values = [
        shop["shop_name"],
        shop["address"],
        shop["public_phone"],
        shop["email"],
        shop["maps_url"],
        datetime.now().strftime("%d/%m/%Y %H:%M"),
    ]
    last_col = chr(ord("A") + len(SHOP_DETAILS_HEADERS) - 1)
    # RAW, not USER_ENTERED -- every column here is plain text (unlike the
    # Repairs Sheet's money columns), and USER_ENTERED's auto-parsing was
    # silently stripping the "+" off an international phone number.
    worksheet.update(values=[values], range_name=f"A2:{last_col}2", value_input_option="RAW")
