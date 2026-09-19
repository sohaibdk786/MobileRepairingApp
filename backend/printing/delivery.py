"""The single place that decides HOW a receipt gets delivered: QZ Tray,
the browser's native print dialog via the default printer, or a saved
PDF (spec: "a single place for each concern"). This is independent of
Test/Live mode (backend.core.config.get_mode), which only ever chooses
the database -- the print method can be anything in either mode.

Every route that needs to print something (a repair receipt, a sale
receipt, a pasted voucher, the Tools test print) builds its ReceiptLine
content (see app/receipts.py) and hands it to deliver_receipt() -- this
is the one function every print method goes through, so a fix here
reaches all of them automatically, and none can quietly drift from the
others.
"""
import base64

from backend.core.config import get_print_method
from backend.printing.escpos import render_escpos
from backend.printing.pdf_receipt import render_pdf
from backend.printing.receipts import ReceiptLine


def deliver_receipt(lines: list[ReceiptLine], *, filename_hint: str) -> dict:
    """Returns a JSON-safe dict the frontend acts on directly:
    - "qz":              {"method": "qz", "escpos_base64": "..."}
                         -- sent to the selected printer via QZ Tray's
                         raw/base64 print type, so nothing about our
                         byte encoding is left to the browser's own
                         string handling (see app/escpos.py's docstring
                         for why that matters for '£').
    - "default_printer": {"method": "default_printer", "pdf_url": "..."}
                         -- loaded into a hidden frame and sent to the
                         browser's native print dialog.
    - "save_pdf":        {"method": "save_pdf", "pdf_url": "..."}
                         -- downloaded and opened in a new tab.
    """
    method = get_print_method()
    if method == "qz":
        raw_bytes = render_escpos(lines)
        return {"method": "qz", "escpos_base64": base64.b64encode(raw_bytes).decode("ascii")}
    pdf_path = render_pdf(lines, filename_hint)
    return {"method": method, "pdf_url": f"/receipts/{pdf_path.name}"}
