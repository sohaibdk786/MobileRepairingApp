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
    """Epson-compatible QR (GS ( k) -- works on most 58mm ESC/POS clones."""
    payload = data.encode("utf-8")
    store_len = len(payload) + 3
    pL = store_len & 0xFF
    pH = (store_len >> 8) & 0xFF
    out = bytearray()
    out += b"\x1d\x28\x6b\x04\x00\x31\x41\x32\x00"  # model 2
    out += b"\x1d\x28\x6b\x03\x00\x31\x43\x06"  # module size 6
    out += b"\x1d\x28\x6b\x03\x00\x31\x45\x31"  # error level M
    out += b"\x1d\x28\x6b" + bytes([pL, pH]) + b"\x31\x50\x30" + payload
    out += b"\x1d\x28\x6b\x03\x00\x31\x51\x30"  # print
    return bytes(out)
