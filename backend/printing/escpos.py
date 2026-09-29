"""Converting a ReceiptLine list into raw ESC/POS bytes for the shop's
58mm thermal printer (HOP-E58 / Excelvan clone).

ESC/POS is a byte-level command language: the printer watches for
specific control-byte sequences (starting ESC 0x1B or GS 0x1D) mixed in
with plain text bytes, and acts on them immediately. The command
sequences below are reused, unchanged, from the original tool's
printReceipt() / printAccessory() functions (see Reciept.html), which are
already known-working on this exact printer.
"""
from backend.printing.receipts import ReceiptLine

_INIT = b"\x1b\x40"  # ESC @  -- reset the printer to its power-on state
_ALIGN_LEFT = b"\x1b\x61\x00"  # ESC a 0
_ALIGN_CENTER = b"\x1b\x61\x01"  # ESC a 1
_BOLD_ON = b"\x1b\x45\x01"  # ESC E 1
_BOLD_OFF = b"\x1b\x45\x00"  # ESC E 0
_DOUBLE_ON = b"\x1d\x21\x11"  # GS ! 0x11 -- double width + double height
_DOUBLE_OFF = b"\x1d\x21\x00"  # GS ! 0
# A few blank feeds so the cut lands past the text, then GS V A (partial cut).
_FEED_AND_CUT = b"\n\n\n\n" + b"\x1d\x56\x41"


def _encode_line_text(text: str) -> bytes:
    """Text -> single-byte code-page bytes for the printer.

    The printer's power-on default table is CP437 (the near-universal
    ESC/POS default), which maps '£' to byte 0x9C. The OLD tool's "£
    prints wrong" bug (spec section 1, problem #7) happened because a raw
    JS string handed to qz.print() goes out UTF-8 encoded, and '£'
    (U+00A3) in UTF-8 is the TWO bytes 0xC2 0xA3 -- garbage on a
    single-byte code-page printer, which is why the old code gave up and
    printed "GBP" instead.

    The fix here is to explicitly encode into CP437 ourselves and send
    the exact resulting bytes (see app/printing.py -- they're base64'd
    across to the browser and sent to QZ Tray as raw bytes, bypassing any
    further string-encoding step). This sidesteps the bug entirely rather
    than depending on a printer-side code-page-select command (ESC t),
    which varies across clone firmware and can't be verified without the
    real printer -- that command support gets checked at the Phase 4 shop
    test; this encoding fix does not depend on it.

    Any character CP437 can't represent (should be rare -- shop details
    are plain English/numbers) is replaced with '?' rather than raising,
    so a stray character never crashes a print job at the counter.
    """
    return text.encode("cp437", errors="replace")


def render_escpos(lines: list[ReceiptLine]) -> bytes:
    """The full byte stream for one receipt, ending with a paper cut."""
    output = bytearray()
    output += _INIT
    for line in lines:
        if line.qr_data:
            output += _ALIGN_CENTER
            output += _qr_bytes(line.qr_data)
            output += b"\n"
            continue
        output += _ALIGN_CENTER if line.align == "center" else _ALIGN_LEFT
        if line.double:
            output += _DOUBLE_ON
        if line.bold:
            output += _BOLD_ON
        output += _encode_line_text(line.text)
        output += b"\n"
        if line.bold:
            output += _BOLD_OFF
        if line.double:
            output += _DOUBLE_OFF
    output += _ALIGN_LEFT
    output += _FEED_AND_CUT
    return bytes(output)


def _qr_bytes(data: str) -> bytes:
    """Rendered as a raster bit image (GS v 0), not the native GS ( k QR
    command this used to send -- confirmed via a real print on the shop's
    actual printer (HOP-E58 / Excelvan 58mm clone, 2026-09-29) that this
    board doesn't implement GS ( k at all: it printed the command's own
    bytes as literal garbage text instead of drawing anything, while
    every other command on that same receipt (bold, align, double-width,
    cut) printed correctly -- proving the general ESC/POS channel works
    fine and the failure is narrow to that one command family, a known
    gap on cheap clone controllers.

    Raster image printing is a far more universal ESC/POS primitive --
    it's the same mechanism that prints a logo -- so this renders the QR
    as a bitmap ourselves (same `qrcode` library and the same `make()`
    call the PDF path already uses, error correction included) and sends
    it as a plain image instead of asking the printer to generate a QR
    on its own.

    Uses an integer `box_size` (each QR module = a whole number of
    printer dots) rather than generating at a default size and resizing
    -- resizing a sharp black/white pattern with any resampling risks
    blurring or dropping modules and breaking scannability; picking the
    box size upfront avoids that entirely.
    """
    import qrcode

    qr = qrcode.QRCode(border=1)
    qr.add_data(data)
    qr.make(fit=True)
    modules_across = qr.modules_count + 2 * qr.border
    target_dots = 200  # comfortably inside a 58mm printer's ~384-dot
    # printable width (the near-universal 58mm thermal spec) -- leaves
    # margin either side for the caller's ESC_ALIGN_CENTER to center it.
    qr.box_size = max(1, target_dots // modules_across)
    img = qr.make_image().convert("1")
    width, height = img.size

    width_bytes = (width + 7) // 8
    pixels = img.load()
    rows = bytearray(width_bytes * height)
    for y in range(height):
        row_offset = y * width_bytes
        for x in range(width):
            if pixels[x, y] == 0:  # PIL mode "1": 0 = black = print this dot
                rows[row_offset + x // 8] |= 0x80 >> (x % 8)

    xL, xH = width_bytes & 0xFF, (width_bytes >> 8) & 0xFF
    yL, yH = height & 0xFF, (height >> 8) & 0xFF
    return b"\x1d\x76\x30\x00" + bytes([xL, xH, yL, yH]) + bytes(rows)
