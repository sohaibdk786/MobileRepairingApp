"""Uploading, replacing, deleting, and checking the QZ Tray signing
certificate + private key pair from within the app (Tools > Printer),
the same pattern as backend.cloud.google_key for the Google service
-account key -- upload through the UI instead of only ever placing the
files by hand.

Unlike the Google key (one JSON file), QZ signing needs TWO files that
must genuinely correspond to each other -- a certificate and its
private key. Upload validation checks each file parses as real PEM,
AND that they're actually a matching pair (the private key can produce
a signature the certificate's own public key verifies), since
uploading a real cert with the wrong key -- or vice versa -- would
otherwise fail silently at print time instead of at upload time.
"""
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from backend.core.config import get_qz_certificate_path, get_qz_private_key_path
from backend.printing.qz_signing import SIGNATURE_HASH

_PAIR_CHECK_MESSAGE = b"dropfix-qz-key-pair-check"


class InvalidQzKeyFile(Exception):
    """The uploaded certificate/private key isn't usable. Message is
    safe to show directly in the UI.
    """


def _validate_certificate_bytes(raw: bytes) -> x509.Certificate:
    try:
        return x509.load_pem_x509_certificate(raw)
    except ValueError as exc:
        raise InvalidQzKeyFile("That doesn't look like a valid PEM certificate file") from exc


def _validate_private_key_bytes(raw: bytes) -> rsa.RSAPrivateKey:
    try:
        key = serialization.load_pem_private_key(raw, password=None)
    except (ValueError, TypeError) as exc:
        raise InvalidQzKeyFile("That doesn't look like a valid PEM private key file") from exc
    if not isinstance(key, rsa.RSAPrivateKey):
        raise InvalidQzKeyFile("QZ Tray needs an RSA private key -- this one is a different type")
    return key


def _validate_pair_matches(cert: x509.Certificate, key: rsa.RSAPrivateKey) -> None:
    """Signs a throwaway message with the private key and checks the
    certificate's own public key can verify it -- the real proof that
    these two files belong together, not just that each is valid on
    its own.
    """
    signature = key.sign(_PAIR_CHECK_MESSAGE, padding.PKCS1v15(), SIGNATURE_HASH)
    public_key = cert.public_key()
    if not isinstance(public_key, rsa.RSAPublicKey):
        raise InvalidQzKeyFile("That certificate doesn't hold an RSA public key")
    try:
        public_key.verify(signature, _PAIR_CHECK_MESSAGE, padding.PKCS1v15(), SIGNATURE_HASH)
    except InvalidSignature as exc:
        raise InvalidQzKeyFile("That certificate and private key don't match each other") from exc


def save_qz_key_files(cert_raw: bytes, key_raw: bytes) -> dict:
    """Validates both files AND that they're a genuine pair before
    writing anything -- a bad upload must never overwrite a working
    QZ Tray connection.
    """
    cert = _validate_certificate_bytes(cert_raw)
    key = _validate_private_key_bytes(key_raw)
    _validate_pair_matches(cert, key)
    get_qz_certificate_path().write_bytes(cert_raw)
    get_qz_private_key_path().write_bytes(key_raw)
    return get_qz_key_status()


def delete_qz_key_files() -> None:
    """Idempotent, same as google_key.delete_key_file()."""
    for path in (get_qz_certificate_path(), get_qz_private_key_path()):
        if path.exists():
            path.unlink()


def get_qz_key_status() -> dict:
    """Never raises. Enough for Tools > Printer to show exactly where
    things stand.
    """
    cert_path = get_qz_certificate_path()
    key_path = get_qz_private_key_path()
    if not cert_path.exists() or not key_path.exists():
        return {"present": False, "valid": False, "subject": None, "error": None}

    try:
        cert = _validate_certificate_bytes(cert_path.read_bytes())
        key = _validate_private_key_bytes(key_path.read_bytes())
        _validate_pair_matches(cert, key)
    except InvalidQzKeyFile as exc:
        return {"present": True, "valid": False, "subject": None, "error": str(exc)}

    return {
        "present": True,
        "valid": True,
        "subject": cert.subject.rfc4514_string(),
        "error": None,
    }
