"""Phones listed for sale (stock catalogue for the public /shop QR page).

Separate from completed `sales` rows so customer names and IMEIs never
leak onto the public shop page. Photos are stored as files under
backend/phone_images/ with rows in phone_images.
"""
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import get_base_dir

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_MAX_IMAGE_BYTES = 6 * 1024 * 1024  # 6 MB
_MAX_IMAGES_PER_PHONE = 8


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def phone_images_dir() -> Path:
    path = get_base_dir() / "phone_images"
    path.mkdir(exist_ok=True)
    return path


def image_public_url(filename: str) -> str:
    return f"/phone-images/{filename}"


def create_phone(
    conn: sqlite3.Connection,
    *,
    model: str,
    price_pence: int,
    notes: str = "",
    imei: str = "",
    listed: bool = True,
) -> int:
    model = model.strip()
    if not model:
        raise ValueError("Model is required")
    if price_pence is None or price_pence < 0:
        raise ValueError("Price is required and cannot be negative")

    now = _now_iso()
    cursor = conn.execute(
        """
        INSERT INTO phones_for_sale
            (created_at, updated_at, model, price_pence, notes, imei, listed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now,
            now,
            model,
            price_pence,
            notes.strip(),
            imei.strip(),
            1 if listed else 0,
        ),
    )
    conn.commit()
    return cursor.lastrowid


def get_phone(conn: sqlite3.Connection, phone_id: int) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM phones_for_sale WHERE id = ? AND deleted_at IS NULL",
        (phone_id,),
    ).fetchone()
    return dict(row) if row else None


def list_phones(conn: sqlite3.Connection, *, listed_only: bool = False) -> list[dict]:
    sql = "SELECT * FROM phones_for_sale WHERE deleted_at IS NULL"
    if listed_only:
        sql += " AND listed = 1"
    sql += " ORDER BY updated_at DESC, id DESC"
    return [dict(r) for r in conn.execute(sql).fetchall()]


def list_images(conn: sqlite3.Connection, phone_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, phone_id, filename, created_at
        FROM phone_images
        WHERE phone_id = ?
        ORDER BY id ASC
        """,
        (phone_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "filename": r["filename"],
            "url": image_public_url(r["filename"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def images_for_phones(conn: sqlite3.Connection, phone_ids: list[int]) -> dict[int, list[dict]]:
    if not phone_ids:
        return {}
    placeholders = ",".join("?" * len(phone_ids))
    rows = conn.execute(
        f"""
        SELECT id, phone_id, filename, created_at
        FROM phone_images
        WHERE phone_id IN ({placeholders})
        ORDER BY id ASC
        """,
        phone_ids,
    ).fetchall()
    out: dict[int, list[dict]] = {pid: [] for pid in phone_ids}
    for r in rows:
        out[r["phone_id"]].append(
            {
                "id": r["id"],
                "filename": r["filename"],
                "url": image_public_url(r["filename"]),
                "created_at": r["created_at"],
            }
        )
    return out


def update_phone(
    conn: sqlite3.Connection,
    phone_id: int,
    *,
    model: str,
    price_pence: int,
    notes: str,
    imei: str,
    listed: bool,
) -> None:
    model = model.strip()
    if not model:
        raise ValueError("Model is required")
    if price_pence is None or price_pence < 0:
        raise ValueError("Price is required and cannot be negative")

    cursor = conn.execute(
        """
        UPDATE phones_for_sale
        SET model = ?, price_pence = ?, notes = ?, imei = ?, listed = ?,
            updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
        """,
        (
            model,
            price_pence,
            notes.strip(),
            imei.strip(),
            1 if listed else 0,
            _now_iso(),
            phone_id,
        ),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Phone {phone_id} not found")
    conn.commit()


def set_listed(conn: sqlite3.Connection, phone_id: int, listed: bool) -> None:
    cursor = conn.execute(
        """
        UPDATE phones_for_sale
        SET listed = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
        """,
        (1 if listed else 0, _now_iso(), phone_id),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Phone {phone_id} not found")
    conn.commit()


def add_image(
    conn: sqlite3.Connection,
    phone_id: int,
    *,
    original_name: str,
    data: bytes,
) -> dict:
    phone = get_phone(conn, phone_id)
    if phone is None:
        raise ValueError(f"Phone {phone_id} not found")

    count = conn.execute(
        "SELECT COUNT(*) AS n FROM phone_images WHERE phone_id = ?",
        (phone_id,),
    ).fetchone()["n"]
    if count >= _MAX_IMAGES_PER_PHONE:
        raise ValueError(f"Maximum {_MAX_IMAGES_PER_PHONE} photos per phone")

    if not data:
        raise ValueError("Empty image file")
    if len(data) > _MAX_IMAGE_BYTES:
        raise ValueError("Image too large (max 6 MB)")

    ext = Path(original_name or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        # sniff common magic bytes if no/odd extension
        if data[:3] == b"\xff\xd8\xff":
            ext = ".jpg"
        elif data[:8] == b"\x89PNG\r\n\x1a\n":
            ext = ".png"
        elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            ext = ".webp"
        elif data[:6] in (b"GIF87a", b"GIF89a"):
            ext = ".gif"
        else:
            raise ValueError("Use JPG, PNG, WEBP, or GIF")

    filename = f"{phone_id}_{uuid.uuid4().hex}{ext}"
    dest = phone_images_dir() / filename
    dest.write_bytes(data)

    now = _now_iso()
    cursor = conn.execute(
        """
        INSERT INTO phone_images (phone_id, filename, created_at)
        VALUES (?, ?, ?)
        """,
        (phone_id, filename, now),
    )
    conn.execute(
        "UPDATE phones_for_sale SET updated_at = ? WHERE id = ?",
        (now, phone_id),
    )
    conn.commit()
    return {
        "id": cursor.lastrowid,
        "filename": filename,
        "url": image_public_url(filename),
        "created_at": now,
    }


def delete_image(conn: sqlite3.Connection, phone_id: int, image_id: int) -> None:
    row = conn.execute(
        """
        SELECT id, filename FROM phone_images
        WHERE id = ? AND phone_id = ?
        """,
        (image_id, phone_id),
    ).fetchone()
    if row is None:
        raise ValueError("Image not found")

    conn.execute("DELETE FROM phone_images WHERE id = ?", (image_id,))
    conn.execute(
        "UPDATE phones_for_sale SET updated_at = ? WHERE id = ?",
        (_now_iso(), phone_id),
    )
    conn.commit()

    path = phone_images_dir() / row["filename"]
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def soft_delete_phone(conn: sqlite3.Connection, phone_id: int) -> None:
    images = list_images(conn, phone_id)
    cursor = conn.execute(
        """
        UPDATE phones_for_sale
        SET deleted_at = ?, updated_at = ?, listed = 0
        WHERE id = ? AND deleted_at IS NULL
        """,
        (_now_iso(), _now_iso(), phone_id),
    )
    if cursor.rowcount == 0:
        raise ValueError(f"Phone {phone_id} not found")
    conn.execute("DELETE FROM phone_images WHERE phone_id = ?", (phone_id,))
    conn.commit()
    for img in images:
        path = phone_images_dir() / img["filename"]
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
