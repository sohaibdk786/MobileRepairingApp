"""QZ Tray signed-connection support.

Without this, the browser connects to QZ Tray "anonymously" -- QZ Tray
then has no stable identity to actually remember, so its own "Remember
this decision" checkbox doesn't reliably stick and the trust prompt keeps
reappearing. Signing every connection with a real certificate + private
key gives QZ Tray something consistent to recognize permanently instead.

The private key never leaves this machine and is never sent to the
browser -- only the certificate (public) and, per connection, a computed
signature are. Both files live beside the app (backend.config's relative-path
rule, same as the Google service-account key) so this survives being
copied to a new PC exactly like the database does.
"""
import base64

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from backend.config import get_qz_certificate_path, get_qz_private_key_path

# Must match the algorithm the frontend tells QZ Tray to expect via
# qz.security.setSignatureAlgorithm() (frontend/printing.js) -- a
# mismatch here means QZ Tray silently rejects every signature as
# invalid rather than raising anything obviously wrong.
SIGNATURE_HASH = hashes.SHA512()


def qz_signing_configured() -> bool:
    """False until both files exist -- lets the frontend/routes give a
    clear "not set up yet" answer instead of a raw file-not-found error.
    """
    return get_qz_certificate_path().exists() and get_qz_private_key_path().exists()


def get_certificate_text() -> str:
    return get_qz_certificate_path().read_text(encoding="utf-8")


def sign_message(message: str) -> str:
    """Returns the base64-encoded signature QZ Tray expects back from
    qz.security.setSignaturePromise for the exact string it asked to have
    signed. Re-reads and re-parses the private key on every call rather
    than caching it in memory -- signing happens rarely (once per QZ Tray
    connection, not per print), so there's no real cost to keeping the
    key out of long-lived process memory any longer than each call needs.
    """
    key_bytes = get_qz_private_key_path().read_bytes()
    private_key = serialization.load_pem_private_key(key_bytes, password=None)
    signature = private_key.sign(message.encode("utf-8"), padding.PKCS1v15(), SIGNATURE_HASH)
    return base64.b64encode(signature).decode("ascii")
