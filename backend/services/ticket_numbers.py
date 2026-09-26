"""Local ticket-number generation: shop-initials prefix + 4 digits.

Numbers are generated locally and instantly so printing never waits on a
network round trip -- that round trip was the #1 problem with the old
tool. The next number is always read from the highest existing ticket
already in the DB, never kept as a separate counter that could drift from
reality, and never hardcoded. That is also what makes the future one-time
import (spec section 12) safe: imported old tickets and new ones can never
collide, because "next" is always "one past whatever is actually there".

The prefix is the shop name's initials (Tools > Shop Details), not a fixed
string, so a shop trading as "Mobile Tech" gets MT0001, MT0002, etc. It's
read fresh from the DB on every ticket, so renaming the shop changes it
immediately -- older tickets keep whatever prefix they were made under
(ticket numbers are permanent, spec section 4); only new ones pick up the
new one.
"""
import sqlite3

from backend.services.shop_settings import get_shop_name

TICKET_DIGITS = 4


def ticket_prefix_from_shop_name(shop_name: str) -> str:
    """First letter of the shop name's first word + first letter of its
    second word, e.g. "Mobile Tech" -> "MT". A one-word name (no second
    word to take a letter from) falls back to that word's own first two
    letters instead, so the prefix is always exactly two characters --
    generate_next_ticket_number's SUBSTR(ticket, 3) below depends on that.
    """
    words = shop_name.split()
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    if words:
        return (words[0] * 2)[:2].upper()
    return "DF"  # shop_name is required (shop_settings.update_shop_settings) -- unreachable in practice


def generate_next_ticket_number(conn: sqlite3.Connection) -> str:
    """Must be called inside the same transaction that inserts the new
    repair row (see repairs.create_repair), so two tickets can't be handed
    out for the same number.
    """
    prefix = ticket_prefix_from_shop_name(get_shop_name(conn))
    row = conn.execute(
        "SELECT MAX(CAST(SUBSTR(ticket, 3) AS INTEGER)) AS highest "
        "FROM repairs WHERE ticket LIKE ? || '%'",
        (prefix,),
    ).fetchone()
    highest = row["highest"] or 0
    next_number = highest + 1
    return f"{prefix}{next_number:0{TICKET_DIGITS}d}"
