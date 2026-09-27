"""The two recovery paths (spec section 10): restoring from a `.db`
backup file, and the basic fallback of importing from the Repairs Sheet
when the `.db` is also lost.

This module builds the REUSABLE import mechanism only -- reading a
CLEAN sheet already arranged into the columns backend.cloud.sheets_sync
writes (Token, Ticket, Date, Name, Model, Fault, Status, Status Detail,
Total, Paid, Remaining, Updated). Phone and passcode are never on this
sheet at all (it's also what the public tracking page reads from), so a
Sheet-only restore can never bring those back -- only a `.db` backup
can. It deliberately does not include the one-time cutover logic for
the real messy production sheet (typo-normalising "colllected", the
Status/Description column swap, etc. -- spec section 12) since that's a
one-time job for actual go-live, not something to build ahead of it.
"""
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import get_db_path, is_test_mode
from backend.core.money import parse_pounds_to_pence
from backend.cloud.sheets_sync import SheetsError, get_client, open_by_key, status_from_title


class RestoreError(Exception):
    """Anything that stopped a restore from completing. Message is safe
    to show directly in the Tools UI.
    """


# The columns every `repairs` table has had since the very first schema
# (database.py's own base CREATE TABLE) -- init_db()'s migrations only
# ever ADD columns on top of this baseline, they never assume it's
# missing. A file with a `repairs` table but not these columns isn't a
# DropFix backup from any real version of this app, and letting it
# through crashes init_db() hard on the next restart (a migration
# reading/writing a column that was never there to begin with) --
# discovered by deliberately testing with a malformed file, not
# hypothetical.
_REQUIRED_REPAIRS_COLUMNS = {
    "ticket", "created_at", "updated_at", "name", "phone",
    "passcode", "model", "status", "settled", "notes",
}


def _looks_like_dropfix_db(path: Path) -> None:
    """Raises RestoreError if `path` isn't a readable SQLite file with a
    genuine `repairs` table -- a basic sanity check so uploading an
    unrelated or malformed file can't silently wipe the real database,
    or worse, get accepted and then crash the app on its next restart.
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
            # Plain tuples on this connection (no row_factory set) --
            # PRAGMA table_info's columns are (cid, name, type, notnull,
            # dflt_value, pk), so index 1 is the column name.
            columns = {row[1] for row in conn.execute("PRAGMA table_info(repairs)").fetchall()}
            missing = _REQUIRED_REPAIRS_COLUMNS - columns
            if missing:
                raise RestoreError(
                    "That file has a 'repairs' table but it's missing column(s) "
                    f"{', '.join(sorted(missing))} -- it doesn't look like a genuine "
                    "DropFix backup"
                )
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise RestoreError(f"Could not read that file as a database: {exc}") from exc


def _check_mode_mismatch(filename: str) -> None:
    """Guards against the realistic accident this is actually for: staff
    grabbing the wrong file from Downloads and restoring a disposable
    Test-mode backup straight onto the real Live database. Every backup
    this app itself ever generates is already named after which database
    it came from ("dropfix.db" / "dropfix_test.db", and the
    .before-restore-*.db copies below keep that same stem) -- so the
    uploaded file's own name is a real, already-existing signal, not a
    new one this has to invent. Deliberately one-directional: uploading
    something onto the disposable Test database is low-stakes regardless
    of its name, so only the dangerous direction (a Test-named file
    landing on Live) is actually blocked.
    """
    if is_test_mode():
        return
    if "test" in (filename or "").lower():
        raise RestoreError(
            "This file's name suggests it's a Test-mode backup, but you're "
            "restoring onto your real Live database. If you're sure this is "
            "the right file, rename it to remove \"test\" from the name and "
            "try again."
        )


def import_from_db_upload(raw: bytes, filename: str = "") -> str:
    """Validates an uploaded `.db` file, keeps a timestamped copy of the
    CURRENT database (so a bad restore is itself recoverable), then
    replaces it. The app must be restarted afterwards to pick up any
    schema changes an older backup might be missing -- the file swap
    itself actually takes effect on the very next request (every route
    opens a fresh connection per request), but a restart is what gives
    the migrations in init_db() a chance to bring an older backup up to
    the current schema, so it's still the right advice.
    """
    _check_mode_mismatch(filename)
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
    Recovers ticket, date, name, model, faults, status, and the actual
    total/paid amounts -- NOT the detailed per-payment history or phone
    and passcode, because the Sheet never carries those (see this
    module's docstring).

    Already-existing ticket numbers are skipped, not overwritten, so this
    is safe to re-run if a previous import was interrupted partway
    through.
    """
    try:
        client = get_client()
        spreadsheet = open_by_key(client, sheet_id)
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

    status = status_from_title(str(row.get("Status", "")).strip())
    total_pence = _parse_price_cell(str(row.get("Total", "")).strip())
    paid_pence = _parse_price_cell(str(row.get("Paid", "")).strip())

    conn.execute(
        """
        INSERT INTO repairs
            (ticket, created_at, updated_at, name, phone, passcode, model, status, settled, notes, tracking_token)
        VALUES (?, ?, ?, ?, '', '', ?, ?, 0, ?, ?)
        """,
        (
            ticket,
            created_at,
            now,
            str(row.get("Name", "")).strip(),
            str(row.get("Model", "")).strip(),
            status,
            str(row.get("Notes", "")).strip(),
            str(row.get("Token", "")).strip(),
        ),
    )
    # The Fault column can hold several faults joined together -- the
    # Sheet only ever carried their combined total, never a per-fault
    # price, so this restores as one fault entry holding the full
    # combined text rather than guessing a split.
    conn.execute(
        "INSERT INTO faults (ticket, description, price_pence, reason, added_at) VALUES (?, ?, ?, '', ?)",
        (ticket, str(row.get("Fault", "")).strip() or "Imported", total_pence, created_at),
    )
    if paid_pence:
        conn.execute(
            "INSERT INTO payments (ticket, amount_pence, method, paid_at) VALUES (?, ?, 'Cash', ?)",
            (ticket, paid_pence, created_at),
        )


def _parse_price_cell(text: str) -> Optional[int]:
    try:
        return parse_pounds_to_pence(text)
    except ValueError:
        return None  # unparseable price text (e.g. "later") imports as pending, never guessed at
