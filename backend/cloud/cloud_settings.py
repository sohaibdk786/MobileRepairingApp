"""Google Sheets/Drive connection settings -- the Sheet IDs and Drive
folder ID the app syncs and backs up to, plus the last-backup timestamp.

Kept separate from backend.services.shop_settings (which is receipt CONTENT: shop
name, address, T&C) because these are technical connection details --
Tools > Google Connection edits this row, Tools > Shop Details never
touches it.
"""
import sqlite3
from datetime import datetime
from typing import Optional


def get_cloud_settings(conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT * FROM cloud_settings WHERE id = 1").fetchone()
    return dict(row)


def update_cloud_settings(
    conn: sqlite3.Connection, *, repairs_sheet_id: str, sales_sheet_id: str, drive_folder_id: str
) -> None:
    conn.execute(
        """
        UPDATE cloud_settings
        SET repairs_sheet_id = ?, sales_sheet_id = ?, drive_folder_id = ?
        WHERE id = 1
        """,
        (repairs_sheet_id.strip(), sales_sheet_id.strip(), drive_folder_id.strip()),
    )
    conn.commit()


def record_backup_success(conn: sqlite3.Connection, *, when: Optional[datetime] = None) -> None:
    when = when or datetime.now()
    conn.execute(
        "UPDATE cloud_settings SET last_backup_at = ? WHERE id = 1", (when.isoformat(timespec="seconds"),)
    )
    conn.commit()
