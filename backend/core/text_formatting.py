"""32-character-wide text formatting shared by every receipt (spec
section 11: "32 characters per line for alignment") and the Paste & Print
voucher passthrough (spec section 6).
"""
import re

LINE_WIDTH = 32
_PIN_PATTERN = re.compile(r"^[0-9]{10,}$")


def center_line(text: str) -> str:
    padding = max(0, (LINE_WIDTH - len(text)) // 2)
    return " " * padding + text


def wrap_line(text: str) -> list[str]:
    """Word-wrap one paragraph (no embedded newlines) to LINE_WIDTH."""
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        if len(current + word) > LINE_WIDTH:
            lines.append(current.strip())
            current = word + " "
        else:
            current += word + " "
    if current.strip():
        lines.append(current.strip())
    return lines or [""]


def chunk_text(text: str, width: int = LINE_WIDTH) -> list[str]:
    """Hard-break a single unbroken string (a URL, a token) into
    fixed-width chunks -- unlike wrap_line(), which splits on spaces and
    can't do anything useful with one long space-free string. Used so a
    tracking URL longer than one line wraps onto a second line instead of
    being truncated with "..." and silently hiding part of it -- the
    printed text should always be the complete, real URL, not a shortened
    guess of it.
    """
    if not text:
        return [""]
    return [text[i : i + width] for i in range(0, len(text), width)]


def wrap_paragraph(text: str) -> list[str]:
    """Split on the author's own newlines first, then word-wrap each
    resulting line -- so intentional paragraph breaks (e.g. in the shop's
    editable Terms & Conditions text) survive, and blank lines become
    spacers rather than being wrapped away.
    """
    output: list[str] = []
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            output.append("")
        else:
            output.extend(wrap_line(line))
    return output


def format_voucher_text(raw_text: str) -> list[str]:
    """Free-form pasted text -> printable 32-char lines. Price lines
    (containing '£') and long digit strings (a PIN, 10+ digits) are
    centered; everything else is left-aligned and word-wrapped. Ported
    from the original tool's formatVoucher() (Reciept.html) so behaviour
    is unchanged for the one screen that's a pure passthrough.
    """
    output: list[str] = []
    for raw_line in raw_text.split("\n"):
        line = raw_line.strip()
        if not line:
            output.append("")
            continue
        if "£" in line or _PIN_PATTERN.match(line):
            output.append(center_line(line))
        else:
            output.extend(wrap_line(line))
    return output
