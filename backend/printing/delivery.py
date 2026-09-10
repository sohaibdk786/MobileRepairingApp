"""The single place that decides HOW a receipt gets delivered: a real
ESC/POS print in Live mode, or a PDF file in Test mode (spec: "Test mode
... prints to PDF instead of the real printer ... Behaviour is identical
across modes because it is the same code -- only the database and the
print target differ").

Every route that needs to print something (a repair receipt, a sale
receipt, a pasted voucher, the Tools test print) builds its ReceiptLine
content (see app/receipts.py) and hands it to deliver_receipt() -- this
is the one function both modes go through, so a fix here reaches both
automatically, and neither mode can quietly drift from the other.
"""
import base64

from backend.core.config import is_test_mode
from backend.printing.escpos import render_escpos
from backend.printing.pdf_receipt import render_pdf
from backend.printing.receipts import ReceiptLine


def deliver_receipt(lines: list[ReceiptLine], *, filename_hint: str) -> dict:
    """Returns a JSON-safe dict the frontend acts on directly:
    - Test mode:  {"mode": "test", "pdf_url": "/receipts/....pdf"}
                  -- the frontend just opens this URL in a new tab.
    - Live mode:  {"mode": "live", "escpos_base64": "..."}
                  -- the frontend sends these exact bytes to the printer
                  via QZ Tray's raw/base64 print type, so nothing about
                  our byte encoding is left to the browser's own string
                  handling (see app/escpos.py's docstring for why that
                  matters for '£').
    """
    if is_test_mode():
        pdf_path = render_pdf(lines, filename_hint)
        return {"mode": "test", "pdf_url": f"/receipts/{pdf_path.name}"}
    raw_bytes = render_escpos(lines)
    return {"mode": "live", "escpos_base64": base64.b64encode(raw_bytes).decode("ascii")}
