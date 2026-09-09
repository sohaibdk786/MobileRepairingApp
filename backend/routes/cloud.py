"""Phase 4 routes: Google key management, Sheet/Drive connection
settings, manual backup, both restore paths, and CSV export.

Kept as its own router (not folded into routes/tools.py) because it's a
distinct concern -- everything here is about the app's connection to the
outside world, where routes/tools.py is shop content and hardware
settings that never leave this PC.
"""
import csv
import io
import sqlite3

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.cloud_settings import get_cloud_settings, update_cloud_settings
from backend.database import get_connection
from backend.drive_backup import BackupError, run_backup_now
from backend.financials import REPAIR_FINANCIALS_COLUMNS, REPAIR_FINANCIALS_JOIN, financials_from_row
from backend.google_key import InvalidKeyFile, delete_key_file, get_key_status, save_key_file
from backend.money import format_pence
from backend.restore import RestoreError, import_from_db_upload, import_from_sheet
from backend.shop_settings import get_currency_code
from backend.sync_queue import count_pending

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


@router.get("/status")
def api_cloud_status() -> dict:
    conn = get_connection()
    try:
        settings = get_cloud_settings(conn)
        pending = count_pending(conn)
    finally:
        conn.close()
    return {
        "key": get_key_status(),
        "repairs_sheet_id": settings["repairs_sheet_id"],
        "sales_sheet_id": settings["sales_sheet_id"],
        "drive_folder_id": settings["drive_folder_id"],
        "last_backup_at": settings["last_backup_at"],
        "sync_queue_pending": pending,
    }


class CloudSettingsIn(BaseModel):
    repairs_sheet_id: str
    sales_sheet_id: str
    drive_folder_id: str


@router.put("/settings")
def api_update_cloud_settings(payload: CloudSettingsIn) -> dict:
    conn = get_connection()
    try:
        update_cloud_settings(conn, **payload.model_dump())
        return get_cloud_settings(conn)
    finally:
        conn.close()


@router.post("/key")
async def api_upload_key(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    try:
        return save_key_file(raw)
    except InvalidKeyFile as exc:
        raise HTTPException(400, str(exc))


@router.delete("/key")
def api_delete_key() -> dict:
    delete_key_file()
    return get_key_status()


@router.post("/backup-now")
def api_backup_now() -> dict:
    conn = get_connection()
    try:
        try:
            message = run_backup_now(conn)
        except BackupError as exc:
            raise HTTPException(400, str(exc))
        return {"message": message}
    finally:
        conn.close()


@router.post("/restore/db")
async def api_restore_from_db(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    try:
        message = import_from_db_upload(raw)
    except Exception as exc:
        # import_from_db_upload can raise RestoreError (a bad upload) or,
        # in principle, an OSError copying files on a locked/read-only
        # disk -- either way the counter needs a plain message, not a
        # stack trace, so this is the one place a broad catch is correct.
        raise HTTPException(400, str(exc))
    return {"message": message}


class SheetImportIn(BaseModel):
    sheet_id: str


@router.post("/restore/sheet")
def api_restore_from_sheet(payload: SheetImportIn) -> dict:
    conn = get_connection()
    try:
        try:
            message = import_from_sheet(conn, payload.sheet_id)
        except RestoreError as exc:
            raise HTTPException(400, str(exc))
        return {"message": message}
    finally:
        conn.close()


def _rows_to_csv(rows: list[dict]) -> io.StringIO:
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buffer.seek(0)
    return buffer


@router.get("/export/repairs.csv")
def api_export_repairs_csv() -> StreamingResponse:
    conn = get_connection()
    try:
        rows = _repairs_export_rows(conn)
    finally:
        conn.close()
    buffer = _rows_to_csv(rows)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=repairs.csv"},
    )


@router.get("/export/sales.csv")
def api_export_sales_csv() -> StreamingResponse:
    conn = get_connection()
    try:
        rows = _sales_export_rows(conn)
    finally:
        conn.close()
    buffer = _rows_to_csv(rows)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sales.csv"},
    )


def _repairs_export_rows(conn: sqlite3.Connection) -> list[dict]:
    currency_code = get_currency_code(conn)
    query = (
        f"SELECT r.*, {REPAIR_FINANCIALS_COLUMNS} FROM repairs r {REPAIR_FINANCIALS_JOIN} "
        "WHERE r.deleted_at IS NULL ORDER BY r.created_at"
    )
    rows = []
    for row in conn.execute(query).fetchall():
        financials = financials_from_row(row)
        rows.append(
            {
                "Ticket": row["ticket"],
                "Created": row["created_at"],
                "Updated": row["updated_at"],
                "Name": row["name"],
                "Phone": row["phone"],
                "Model": row["model"],
                "Status": row["status"],
                "Settled": "Yes" if row["settled"] else "No",
                "Total": format_pence(financials["total_pence"], currency_code),
                "Paid": format_pence(financials["paid_pence"], currency_code),
                "Balance": format_pence(financials["balance_pence"], currency_code) if financials["balance_pence"] is not None else "Pending",
            }
        )
    return rows


def _sales_export_rows(conn: sqlite3.Connection) -> list[dict]:
    currency_code = get_currency_code(conn)
    rows = []
    for row in conn.execute("SELECT * FROM sales WHERE deleted_at IS NULL ORDER BY sold_at").fetchall():
        rows.append(
            {
                "Sold": row["sold_at"],
                "Name": row["name"],
                "Item": row["item"],
                "Price": format_pence(row["price_pence"], currency_code),
                "Method": row["method"],
                "Serial": row["serial"] or "xxxx",
            }
        )
    return rows
