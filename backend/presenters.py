"""Turning raw DB dicts into display-ready JSON for the API.

Kept separate from the business-logic modules (repairs.py, sales.py, ...)
so those stay pure data/DB concerns, and every route formats money,
dates, and the empty-serial-prints-as-xxxx rule the same way (spec
section 16: "a single place for each concern").
"""
from backend.money import format_pence


def present_repair_summary(repair: dict, currency_code: str = "GBP") -> dict:
    """Compact shape used in search results, the Reprint "last repair"
    lookup, and the duplicate-check response -- not the full detail
    screen payload (see present_repair_detail for that).

    currency_code (from Tools > Shop Details) picks which symbol every
    *_display string below uses -- on screen, not just on a printed
    receipt, so choosing a currency there changes the whole app
    consistently. It never converts the amount, only the character shown.
    """
    balance_pence = repair["balance_pence"]
    return {
        "ticket": repair["ticket"],
        "name": repair["name"],
        "phone": repair["phone"],
        "passcode": repair["passcode"],
        "model": repair["model"],
        "status": repair["status"],
        "settled": bool(repair["settled"]),
        "created_at": repair["created_at"],
        "updated_at": repair["updated_at"],
        # Raw pence alongside the display strings: the frontend needs
        # exact numbers (e.g. "tap the balance to fill in the payment
        # amount", or the old-price-struck-through view) without having to
        # re-parse a "£65.00" string back into money.
        "total_pence": repair["total_pence"],
        "paid_pence": repair["paid_pence"],
        "balance_pence": balance_pence,
        "total_display": format_pence(repair["total_pence"], currency_code),
        "paid_display": format_pence(repair["paid_pence"], currency_code),
        "balance_display": format_pence(balance_pence, currency_code) if balance_pence is not None else "Pending",
        "is_fully_paid": repair["is_fully_paid"],
        # True when at least one fault still has no agreed price -- lets
        # the detail screen say "some items still need a price" without
        # that ever meaning the money that IS agreed gets hidden too.
        "has_pending_faults": repair["has_pending_faults"],
    }


def present_repair_detail(repair: dict, currency_code: str = "GBP") -> dict:
    """Full shape for the universal ticket detail screen: the summary
    fields plus passcode, notes, per-field edit stamps, faults, payments.
    """
    detail = present_repair_summary(repair, currency_code)
    detail["passcode"] = repair["passcode"]
    detail["notes"] = repair["notes"]
    detail["name_edited_at"] = repair["name_edited_at"]
    detail["phone_edited_at"] = repair["phone_edited_at"]
    detail["passcode_edited_at"] = repair["passcode_edited_at"]
    detail["model_edited_at"] = repair["model_edited_at"]
    detail["notes_edited_at"] = repair["notes_edited_at"]
    detail["faults"] = [present_fault(f, currency_code) for f in repair["faults"]]
    detail["payments"] = [present_payment(p, currency_code) for p in repair["payments"]]
    return detail


def present_fault(fault: dict, currency_code: str = "GBP") -> dict:
    return {
        "id": fault["id"],
        "description": fault["description"],
        "price_pence": fault["price_pence"],
        "price_display": format_pence(fault["price_pence"], currency_code),
        "reason": fault["reason"],
        "added_at": fault["added_at"],
        "price_edited_at": fault["price_edited_at"],
    }


def present_payment(payment: dict, currency_code: str = "GBP") -> dict:
    # A refund is stored as a negative amount_pence in the exact same
    # payments table (backend.payments.add_refund) -- this flag is purely a
    # presentation label off that sign, not a separate concept in storage,
    # so the frontend/receipts can say "Refund" instead of a plain
    # payment line without either drifting from the other.
    return {
        "id": payment["id"],
        "amount_pence": payment["amount_pence"],
        "amount_display": format_pence(payment["amount_pence"], currency_code),
        "method": payment["method"],
        "paid_at": payment["paid_at"],
        "is_refund": payment["amount_pence"] < 0,
    }


def present_sale(sale: dict, currency_code: str = "GBP") -> dict:
    # `serial` stays exactly as typed (possibly blank); `serial_display` is
    # where the "empty prints as xxxx" rule (spec section 5) is applied, so
    # the raw stored value is never silently rewritten to "xxxx".
    return {
        "id": sale["id"],
        "sold_at": sale["sold_at"],
        "name": sale["name"],
        "item": sale["item"],
        "price_pence": sale["price_pence"],
        "price_display": format_pence(sale["price_pence"], currency_code),
        "method": sale["method"],
        "serial": sale["serial"],
        "serial_display": sale["serial"] or "xxxx",
        "refunded_pence": sale["refunded_pence"],
        "refunded_display": format_pence(sale["refunded_pence"], currency_code),
        # What the customer actually ended up paying, net of any refund
        # -- price_pence itself never changes (that's what was charged
        # at the time), this is the derived "what's left" figure.
        "net_price_pence": sale["price_pence"] - sale["refunded_pence"],
        "net_price_display": format_pence(sale["price_pence"] - sale["refunded_pence"], currency_code),
    }
