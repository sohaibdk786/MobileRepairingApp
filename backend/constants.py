"""Fixed choice lists shared across the app (spec section 4).

Kept in one place so the backend (validation) and frontend (dropdowns,
fetched via /api/fault-choices) can never drift apart.
"""

# The 5-state status list for a repair ticket. Status is ONE field, one
# value at a time (spec section 4) -- add a state here only if a real case
# genuinely doesn't fit any of these; never split status into multiple
# fields.
#
# "Not Agreed - Collected" and "Not Fixed - Collected" started as two
# separate states (price never agreed vs. genuinely couldn't be fixed),
# then got merged into one -- the owner didn't need that distinction kept
# at the status level once it was pointed out, since either way the
# ticket ends the same way: not repaired, phone collected anyway.
STATUS_CHOICES = [
    "In Progress",
    "Ready",
    "Collected",
    "Not Agreed/Fixed - In Shop",
    "Not Agreed/Fixed - Collected",
]
DEFAULT_STATUS = STATUS_CHOICES[0]

# The two statuses where the phone has actually left the shop. The two
# receipts are mutually exclusive windows around that moment: the intake
# receipt (passcode + quoted/deposit price) only makes sense BEFORE it,
# the collection receipt (final payment breakdown + warranty date) only
# makes sense AFTER it. Both print/reprint routes gate on this list
# (app/routes/printing.py), and it's mirrored client-side in detail.js
# for an immediate warning instead of a round trip.
COLLECTED_STATUSES = ("Collected", "Not Agreed/Fixed - Collected")

# The two statuses where the phone is waiting on the customer -- fixed
# and ready for pickup, or the customer declined and it's just sitting
# here waiting for them to come get it anyway. Both are "nothing more
# for us to do here, ball's in the customer's court" -- whether the
# repair itself succeeded doesn't change that. Mirrors COLLECTED_STATUSES
# above; used by the Search "Ready" filter (app/search.py).
READY_STATUSES = ("Ready", "Not Agreed/Fixed - In Shop")

# The 6-option fault dropdown (spec section 4). "Other" pairs with a free
# text box in the UI; if left blank on "Other" it stays "Other".
FAULT_CHOICES = [
    "Diagnostic",
    "Screen",
    "Battery",
    "Charging Port",
    "Software",
    "Other",
]

# The 3 tappable reason buttons shown when a fault is added to an EXISTING
# ticket (spec section 4). Not shown for the first/intake fault -- only
# for faults added later, since that's when a price change needs a reason
# on record. "Other" pairs with a free text box; if left blank it stays
# "Other" / empty, same rule as the fault dropdown.
FAULT_REASON_CHOICES = [
    "Customer agreed on price",
    "Device cannot work without this fault fixed",
    "Other",
]

# How a payment or sale was paid for.
PAYMENT_METHODS = ["Cash", "Card"]

# The Quick Sale item dropdown -- kept EXACTLY as it was in the original
# tool (Reciept.html, id="itemDropdown"), per the spec's instruction to
# reuse the existing list rather than invent a new one. "Other" pairs with
# a free text box (id="customItem" in the original).
SALE_ITEMS = [
    "Other",
    "Case / Cover",
    "Glass Protector",
    "Camera Lens Protector",
    "Speaker",
    "Vape",
    "Perfume",
    "Mobile Phone",
    "Headphone",
    "AirPods",
    "Handsfree",
    "Cable",
    "Charger",
    "USB Stick",
    "MicroSD Card",
    "Mobile Phone Holder",
    "Car Holder",
    "Car Charger",
    "PlayStation Controller",
]

# Which symbol shows in front of an amount, on screen AND on a printed
# receipt alike (Tools > Shop Details). This never converts the amount --
# prices are stored as plain pence, not tied to any one currency, so
# picking a different entry here only changes which character shows,
# never the number itself (spec section 11's original "£ symbol or GBP
# text" choice, grown into a world-currency picker). Every entry uses the
# real sign for that currency, not a plain-text stand-in -- a text
# abbreviation only belongs here later, for a SPECIFIC currency, if a
# real thermal printer test finds that one sign doesn't print cleanly
# (same reasoning "GBP text" existed for £), not pre-emptively for
# currencies whose signs just look more exotic on screen.
CURRENCY_CHOICES = [
    {"code": "GBP", "symbol": "£"},
    {"code": "USD", "symbol": "$"},
    {"code": "EUR", "symbol": "€"},
    {"code": "PKR", "symbol": "Rs"},
    {"code": "INR", "symbol": "₹"},
    {"code": "AUD", "symbol": "A$"},
    {"code": "CAD", "symbol": "C$"},
    {"code": "NZD", "symbol": "NZ$"},
    {"code": "AED", "symbol": "د.إ"},
    {"code": "SAR", "symbol": "﷼"},
    {"code": "CNY", "symbol": "¥"},
    {"code": "JPY", "symbol": "¥"},
    {"code": "ZAR", "symbol": "R"},
    {"code": "TRY", "symbol": "₺"},
    {"code": "BDT", "symbol": "৳"},
]
