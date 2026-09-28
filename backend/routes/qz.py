"""QZ Tray signed-connection routes -- see app/qz_signing.py for why this
exists (an anonymous connection means QZ Tray can never durably remember
"trust this site").

Both routes are read-only/compute-only and touch no database, so unlike
almost every other route in this app they take no connection at all.
"""
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.printing.qz_key import (
    InvalidQzKeyFile,
    delete_qz_key_files,
    get_qz_key_status,
    save_qz_key_files,
)
from backend.printing.qz_signing import get_certificate_text, qz_signing_configured, sign_message

router = APIRouter(prefix="/api/qz", tags=["qz"])


@router.get("/certificate")
def api_qz_certificate() -> dict:
    """Public -- this is exactly what the browser is meant to hand
    straight to QZ Tray via qz.security.setCertificatePromise.
    """
    if not qz_signing_configured():
        raise HTTPException(404, "QZ signing isn't set up yet -- no certificate/private key on this machine.")
    return {"certificate": get_certificate_text()}


class SignIn(BaseModel):
    data: str


@router.post("/sign")
def api_qz_sign(payload: SignIn) -> dict:
    """The private key never leaves this function -- only the resulting
    signature does, for the exact `data` string QZ Tray asked to have
    signed this one time (see qz.security.setSignaturePromise).
    """
    if not qz_signing_configured():
        raise HTTPException(404, "QZ signing isn't set up yet -- no certificate/private key on this machine.")
    return {"signature": sign_message(payload.data)}


@router.get("/key/status")
def api_qz_key_status() -> dict:
    return get_qz_key_status()


@router.post("/key")
async def api_upload_qz_key(
    certificate: UploadFile = File(...), private_key: UploadFile = File(...)
) -> dict:
    cert_raw = await certificate.read()
    key_raw = await private_key.read()
    try:
        return save_qz_key_files(cert_raw, key_raw)
    except InvalidQzKeyFile as exc:
        raise HTTPException(400, str(exc))


@router.delete("/key")
def api_delete_qz_key() -> dict:
    delete_qz_key_files()
    return get_qz_key_status()
