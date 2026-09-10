"""Rendering a ReceiptLine list as a small PDF -- standing in for the real
thermal printer in Test mode (spec: "Test mode ... prints to PDF instead
of the real printer... so it can be tested on a laptop with no printer").

Renders the exact same content the live ESC/POS path (app/escpos.py)
would print -- see app/printing.py, the one place that picks between the
two -- so what you see in the PDF is a faithful preview of what Live mode
sends to the printer.
"""
import re
import secrets
from datetime import datetime
from pathlib import Path

from fpdf import FPDF

from backend.core.config import get_base_dir
from backend.printing.receipts import ReceiptLine

# 58mm paper. The page height is computed per-receipt (see render_pdf) so
# the PDF looks like a real strip of receipt paper -- just long enough
# for its content -- rather than a fixed A4-ish page with empty space.
_PAGE_WIDTH_MM = 58
_MARGIN_MM = 2.0
# Courier is fixed-width, and every receipt line is built to fit the
# spec's 32-character width (app/text_formatting.py). 9pt measures ~61mm
# for 32 chars -- wider than the ~54mm usable width, which clips the
# right edge instead of wrapping. 7.5pt measures ~51mm, comfortably
# inside 54mm (checked with pdf.get_string_width() against the real
# Courier metrics, not just estimated).
_FONT_SIZE = 7.5
_LINE_HEIGHT_MM = 3.6


def _receipts_dir() -> Path:
    directory = get_base_dir() / "test_receipts"
    directory.mkdir(exist_ok=True)
    return directory


def _safe_filename(hint: str) -> str:
    """Turn a ticket number / description into a filesystem-safe,
    collision-resistant filename.

    The timestamp is for humans browsing the folder; the random suffix is
    what actually guarantees uniqueness. Two rapid reprints DID collide
    and silently overwrite each other in testing even with a
    microsecond-precision timestamp -- Windows' system clock only
    actually updates every ~15ms, so datetime.now() can return the exact
    same value (down to the microsecond field) for calls that are
    genuinely microseconds apart in wall-clock terms. A wall clock is
    never a safe uniqueness source on its own; secrets.token_hex() is.
    """
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", hint).strip("_") or "receipt"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    unique = secrets.token_hex(4)
    return f"{slug}_{stamp}_{unique}.pdf"


def render_pdf(lines: list[ReceiptLine], filename_hint: str) -> Path:
    """Write the receipt to test_receipts/ and return its path."""
    qr_mm = 28
    total_height_mm = 2 * _MARGIN_MM + 10 + sum(
        (qr_mm + 2) if line.qr_data else _LINE_HEIGHT_MM * (1.6 if line.double else 1.0)
        for line in lines
    )

    pdf = FPDF(orientation="P", unit="mm", format=(_PAGE_WIDTH_MM, max(total_height_mm, 40)))
    pdf.set_auto_page_break(auto=False)  # one continuous strip, never a second page
    pdf.set_margins(_MARGIN_MM, _MARGIN_MM, _MARGIN_MM)
    pdf.add_page()

    usable_width = _PAGE_WIDTH_MM - 2 * _MARGIN_MM
    for line in lines:
        if line.qr_data:
            _draw_qr(pdf, line.qr_data, usable_width, qr_mm)
            continue
        style = "B" if line.bold else ""
        size = _FONT_SIZE + 3 if line.double else _FONT_SIZE
        pdf.set_font("Courier", style=style, size=size)
        align = "C" if line.align == "center" else "L"
        text = line.text.encode("latin-1", errors="replace").decode("latin-1")
        pdf.cell(usable_width, _LINE_HEIGHT_MM, text, align=align, new_x="LMARGIN", new_y="NEXT")

    path = _receipts_dir() / _safe_filename(filename_hint)
    pdf.output(str(path))
    return path


def _draw_qr(pdf: FPDF, data: str, usable_width: float, size_mm: float) -> None:
    import io

    import qrcode

    img = qrcode.make(data, border=1)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    x = _MARGIN_MM + max(0, (usable_width - size_mm) / 2)
    pdf.image(buf, x=x, w=size_mm, h=size_mm)
    # fpdf2 already advances pdf.y past the image itself here (confirmed
    # directly -- even though x is given explicitly, y still auto-advances
    # by h since y itself was never passed). Only a small breathing gap is
    # needed on top of that -- ln(size_mm + 2) was double-counting the QR's
    # own height, which is exactly what produced the big empty gap under
    # every QR code on a receipt.
    pdf.ln(2)
