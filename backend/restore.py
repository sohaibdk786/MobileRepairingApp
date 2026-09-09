"""The two recovery paths (spec section 10): restoring from a `.db`
backup file, and the basic fallback of importing from the Repairs Sheet
when the `.db` is also lost.

This module builds the REUSABLE import mechanism only -- reading a
CLEAN sheet already arranged into the columns backend.sheets_sync writes
(Ticket, Date, Name, Phone, Password, Model, Repair, Price, Status,
Paid). It deliberately does not include the one-time cutover logic for
the real messy production sheet (typo-normalising "colllected", the
Status/Description column swap, etc. -- spec section 12) since that's a
one-time job for actual go-live, not something to build ahead of it.
"""
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.config import get_db_path
from backend.money import parse_pounds_to_pence
from backend.sheets_sync import SheetsError, get_client


class RestoreError(Exception):
    """Anything that stopped a restore from completing. Message is safe
    to show directly in the Tools UI.
    """


def _looks_like_dropfix_db(path: Path) -> None:
    """Raises RestoreError if `path` isn't a readable SQLite file with
    (at least) a `repairs` table -- a basic sanity check so uploading an
    unrelated file can't silently wipe the real database.
    """
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            result = conn.execute("PRAGMA integrity_check").fetchone()
            if not result or result[0] != "ok":
                raise RestoreError(f"That file failed a database integrity check: {result}")
            has_repairs_table = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'repairs'"
            ).fetchone()
            if not has_repairs_table:
                raise RestoreError("That file doesn't look like a DropFix database (no 'repairs' table)")
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise RestoreError(f"Could not read that file as a database: {exc}") from exc


def import_from_db_upload(raw: bytes) -> str:
    """Validates an uploaded `.db` file, keeps a timestamped copy of the
    CURRENT database (so a bad restore is itself recoverable), then
    replaces it. The app must be restarted afterwards to pick up the new
    file cleanly (every route opens a fresh connection per request, but a
    full file swap under a running app is not worth the risk when "stop,
    swap, start" is simple and matches how the normal PC-swap restore
    already works).
    """
    current_path = get_db_path()
    temp_path = current_path.with_suffix(".uploaded.tmp")
    temp_path.write_bytes(raw)
    try:
        _looks_like_dropfix_db(temp_path)
        if current_path.exists():
            backup_path = current_path.with_name(
                f"{current_path.stem}.before-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
            )
            shutil.copy2(current_path, backup_path)
        shutil.move(str(temp_path), str(current_path))
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return "Database restored. Restart the app to use it."


def import_from_sheet(conn: sqlite3.Connection, sheet_id: str) -> str:
    """The basic fallback (spec: used only if the `.db` is also lost).
    Recovers ticket, date, name, phone, passcode, model, headline fault,
    price, and a simple paid/not-paid flag -- NOT the detailed per-
    payment history, because the Sheet doesn't store it (a "Paid" row
    gets one payment line for the full price so the derived balance
    reads correctly; "Not Paid" gets none).

    Already-existing ticket numbers are skipped, not overwritten, so this
    is safe to re-run if a previous import was interrupted partway
    through.
    """
    try:
        client = get_client()
        spreadsheet = client.open_by_key(sheet_id)
        rows = spreadsheet.sheet1.get_all_records()
    except SheetsError as exc:
        raise RestoreError(str(exc)) from exc

    imported = 0
    skipped_existing = 0
    skipped_blank = 0

    conn.execute("BEGIN IMMEDIATE")
    try:
        for row in rows:
            ticket = str(row.get("Ticket", "")).strip()
            if not ticket:
                skipped_blank += 1
                continue
            exists = conn.execute("SELECT 1 FROM repairs WHERE ticket = ?", (ticket,)).fetchone()
            if exists:
                skipped_existing += 1
                continue
            _import_one_repair_row(conn, ticket, row)
            imported += 1
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

    return f"Imported {imported} ticket(s). Skipped {skipped_existing} already present, {skipped_blank} blank row(s)."


def _import_one_repair_row(conn: sqlite3.Connection, ticket: str, row: dict) -> None:
    now = datetime.now().isoformat(timespec="seconds")
    date_text = str(row.get("Date", "")).strip()
    created_at = f"{date_text}T00:00:00" if date_text else now

    price_pence = _parse_price_cell(str(row.get("Price", "")).strip())
    status = str(row.get("Status", "")).strip() or "In Progress"
    paid = str(row.get("Paid", "")).strip().lower() == "paid"

    conn.execute(
        """
        INSERT INTO repairs
            (ticket, created_at, updated_at, name, phone, passcode, model, status, settled, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '')
        """,
        (
            ticket,
            created_at,
            now,
            str(row.get("Name", "")).strip(),
            str(row.get("Phone", "")).strip(),
            str(row.get("Password", "")).strip(),
            str(row.get("Model", "")).strip(),
            status,
        ),
    )
    conn.execute(
        "INSERT INTO faults (ticket, description, price_pence, reason, added_at) VALUES (?, ?, ?, '', ?)",
        (ticket, str(row.get("Repair", "")).strip() or "Imported", price_pence, created_at),
    )
    if paid and price_pence is not None:
        conn.execute(
            "INSERT INTO payments (ticket, amount_pence, method, paid_at) VALUES (?, ?, 'Cash', ?)",
            (ticket, price_pence, created_at),
        )


def _parse_price_cell(text: str) -> Optional[int]:
    try:
        return parse_pounds_to_pence(text)
    except ValueError:
        return None  # unparseable price text (e.g. "later") imports as pending, never guessed at
