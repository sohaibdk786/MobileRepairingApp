"""Staff API for phones listed for sale."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.core.database import get_connection
from backend.core.money import parse_pounds_to_pence
from backend.services import phones as phones_svc
from backend.services.presenters import present_phone
from backend.services.shop_settings import get_currency_code

router = APIRouter(prefix="/api/phones", tags=["phones"])


class PhoneIn(BaseModel):
    model: str
    price: str
    notes: str = ""
    imei: str = ""
    listed: bool = True


class PhoneEditIn(BaseModel):
    model: str
    price: str
    notes: str = ""
    imei: str = ""
    listed: bool = True


class ListedIn(BaseModel):
    listed: bool


def _present(conn, phone: dict) -> dict:
    phone = dict(phone)
    phone["images"] = phones_svc.list_images(conn, phone["id"])
    return present_phone(phone, get_currency_code(conn))


@router.get("")
def api_list_phones() -> list[dict]:
    conn = get_connection()
    try:
        currency = get_currency_code(conn)
        phones = phones_svc.list_phones(conn)
        images_map = phones_svc.images_for_phones(conn, [p["id"] for p in phones])
        out = []
        for p in phones:
            p = dict(p)
            p["images"] = images_map.get(p["id"], [])
            out.append(present_phone(p, currency))
        return out
    finally:
        conn.close()


@router.post("")
def api_create_phone(payload: PhoneIn) -> dict:
    conn = get_connection()
    try:
        try:
            price_pence = parse_pounds_to_pence(payload.price)
            if price_pence is None:
                raise ValueError("Price is required")
            phone_id = phones_svc.create_phone(
                conn,
                model=payload.model,
                price_pence=price_pence,
                notes=payload.notes,
                imei=payload.imei,
                listed=payload.listed,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        phone = phones_svc.get_phone(conn, phone_id)
        return _present(conn, phone)
    finally:
        conn.close()


@router.get("/{phone_id}")
def api_get_phone(phone_id: int) -> dict:
    conn = get_connection()
    try:
        phone = phones_svc.get_phone(conn, phone_id)
        if phone is None:
            raise HTTPException(404, "Phone not found")
        return _present(conn, phone)
    finally:
        conn.close()


@router.patch("/{phone_id}")
def api_edit_phone(phone_id: int, payload: PhoneEditIn) -> dict:
    conn = get_connection()
    try:
        try:
            price_pence = parse_pounds_to_pence(payload.price)
            if price_pence is None:
                raise ValueError("Price is required")
            phones_svc.update_phone(
                conn,
                phone_id,
                model=payload.model,
                price_pence=price_pence,
                notes=payload.notes,
                imei=payload.imei,
                listed=payload.listed,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        phone = phones_svc.get_phone(conn, phone_id)
        if phone is None:
            raise HTTPException(404, "Phone not found")
        return _present(conn, phone)
    finally:
        conn.close()


@router.post("/{phone_id}/listed")
def api_set_listed(phone_id: int, payload: ListedIn) -> dict:
    conn = get_connection()
    try:
        try:
            phones_svc.set_listed(conn, phone_id, payload.listed)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        phone = phones_svc.get_phone(conn, phone_id)
        if phone is None:
            raise HTTPException(404, "Phone not found")
        return _present(conn, phone)
    finally:
        conn.close()


@router.post("/{phone_id}/images")
async def api_upload_images(
    phone_id: int,
    files: list[UploadFile] = File(...),
) -> dict:
    conn = get_connection()
    try:
        if phones_svc.get_phone(conn, phone_id) is None:
            raise HTTPException(404, "Phone not found")
        uploaded = []
        try:
            for f in files:
                data = await f.read()
                uploaded.append(
                    phones_svc.add_image(
                        conn,
                        phone_id,
                        original_name=f.filename or "",
                        data=data,
                    )
                )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        phone = phones_svc.get_phone(conn, phone_id)
        result = _present(conn, phone)
        result["uploaded"] = uploaded
        return result
    finally:
        conn.close()


@router.delete("/{phone_id}/images/{image_id}")
def api_delete_image(phone_id: int, image_id: int) -> dict:
    conn = get_connection()
    try:
        try:
            phones_svc.delete_image(conn, phone_id, image_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        phone = phones_svc.get_phone(conn, phone_id)
        if phone is None:
            raise HTTPException(404, "Phone not found")
        return _present(conn, phone)
    finally:
        conn.close()


@router.delete("/{phone_id}")
def api_delete_phone(phone_id: int) -> dict:
    conn = get_connection()
    try:
        try:
            phones_svc.soft_delete_phone(conn, phone_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        return {"ok": True}
    finally:
        conn.close()
