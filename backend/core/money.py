"""Money helpers.

Amounts are stored as integer pence throughout the database so totals and
balances never suffer floating-point rounding drift (e.g. 0.1 + 0.2 !=
0.3). Only the edges -- what the user types, what a receipt shows -- deal
in pounds-and-pence text.
"""
from typing import Optional

from backend.core.constants import CURRENCY_CHOICES

_CURRENCY_SYMBOLS = {c["code"]: c["symbol"] for c in CURRENCY_CHOICES}


def parse_pounds_to_pence(text: str) -> Optional[int]:
    """Turn user-typed pounds ('12', '12.50', '  ') into integer pence.

    Returns None for blank input, meaning "price not agreed yet / pending"
    (spec section 12 -- the old sheet has 'later' rows with no price yet;
    a repair can be created before a price is settled).

    Raises ValueError if the text is non-blank but not a valid amount.
    """
    text = (text or "").strip()
    if not text:
        return None
    value = float(text)  # raises ValueError on junk like "25 or 20"
    if value < 0:
        raise ValueError("Price cannot be negative")
    return round(value * 100)


def format_pence(pence: Optional[int], currency_code: str = "GBP") -> str:
    """Format integer pence as a money string -- used both on screen and
    on printed receipts, so a currency picked in Tools > Shop Details
    shows the same symbol everywhere in the app, not just on paper.
    None -> 'Pending'. Falls back to £ for an unrecognised code rather
    than raising (spec section 16: "fail safe, never crash") -- a bad
    setting must never blank out every money value in the app.

    This never converts the amount: prices are stored as plain pence, not
    tied to any one currency, so switching currency only changes which
    character shows, not the number itself.

    A negative balance (overpayment -- nothing stops a payment exceeding
    the total) puts the minus sign before the symbol ('-£30.00'), not
    between them ('£-30.00', which f-string formatting would otherwise
    produce since Python puts the sign on the number itself).
    """
    if pence is None:
        return "Pending"
    sign = "-" if pence < 0 else ""
    amount = f"{abs(pence) / 100:.2f}"
    symbol = _CURRENCY_SYMBOLS.get(currency_code, "£")
    separator = " " if symbol[-1].isalpha() else ""
    return f"{sign}{symbol}{separator}{amount}"


def format_pence_for_print(pence: Optional[int], currency_code: str = "GBP", print_style: str = "sign") -> str:
    """Same as format_pence(), but for a printed receipt ONLY -- the app
    screen always shows the real sign (spec: "if i select aud using text
    it still uses the aud sign in all app interface... that using of
    texts are just for printing error or bugs fixing"). print_style
    'text' is the one escape hatch for the one real hardware constraint a
    symbol can hit: a specific thermal printer's limited codepage failing
    to print it cleanly -- in which case this prints the plain currency
    code instead (e.g. "USD 45.00" instead of "$45.00").
    """
    if pence is None:
        return "Pending"
    amount = f"{pence / 100:.2f}"
    if print_style == "text":
        return f"{currency_code} {amount}"
    return format_pence(pence, currency_code)
