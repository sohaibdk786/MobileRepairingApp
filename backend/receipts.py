"""Building each receipt's CONTENT: what it says, not how it's printed.

This is the single place that decides what goes on a receipt (spec
section 16: "a single place for each concern") -- both the real ESC/POS
printer (app/escpos.py) and the Test-mode PDF (app/pdf_receipt.py) render
the exact same ReceiptLine list (via app/printing.py), so Test mode is a
faithful preview of what Live mode will actually print.

Every builder takes the raw dicts already produced elsewhere (repairs.py
get_repair_detail(), sales.py get_sale(), shop_settings.py
get_shop_settings()) rather than re-querying the database itself -- this
module only ever turns data into words, never fetches it.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from backend.money import format_pence_for_print
from backend.text_formatting import wrap_paragraph


@dataclass
class ReceiptLine:
    text: str = ""
    align: str = "left"  # "left" | "center"
    bold: bool = False
    double: bool = False  # double width + height -- used once, for the shop name banner


def _divider() -> ReceiptLine:
    return ReceiptLine("-" * 32)


def _shop_header(shop: dict) -> list[ReceiptLine]:
    now = datetime.now()
    return [
        ReceiptLine(shop["shop_name"], align="center", bold=True, double=True),
        ReceiptLine(shop["address"], align="center"),
        ReceiptLine(f"{now.strftime('%d/%m/%Y')} {now.strftime('%H:%M:%S')}", align="center"),
        _divider(),
    ]


def _terms_block(shop: dict) -> list[ReceiptLine]:
    lines = [ReceiptLine("TERMS & CONDITIONS", bold=True)]
    lines += [ReceiptLine(text) for text in wrap_paragraph(shop["terms_and_conditions"])]
    return lines


def _manager_block(shop: dict) -> list[ReceiptLine]:
    # Spec section 11: the contact line label is "Manager", not "Owner"
    # (the old tool printed "Owner: Ali Asghar").
    return [
        _divider(),
        ReceiptLine(f"Manager: {shop['manager_name']}"),
        ReceiptLine(f"Tel: {shop['manager_phone']}"),
    ]


def _footer() -> list[ReceiptLine]:
    return [_divider(), ReceiptLine("Thank you!", align="center", bold=True)]


def build_intake_receipt(repair: dict, shop: dict) -> list[ReceiptLine]:
    """Spec section 4: "Intake receipt (at drop-off): has passcode, quoted
    price, and -- if a deposit was taken -- a deposit line and balance due
    fitted into the same receipt." No separate deposit receipt design.
    """
    currency = shop["currency_code"]
    print_style = shop["currency_print_style"]
    lines = _shop_header(shop)
    lines += [
        ReceiptLine(f"Ticket: {repair['ticket']}", bold=True),
        ReceiptLine(f"Name: {repair['name']}"),
        ReceiptLine(f"Phone: {repair['phone']}"),
        ReceiptLine(f"Password: {repair['passcode']}"),
        ReceiptLine(f"Model: {repair['model']}"),
        _divider(),
    ]
    for fault in repair["faults"]:
        price = format_pence_for_print(fault["price_pence"], currency, print_style)
        lines.append(ReceiptLine(f"{fault['description']}: {price}"))
    lines.append(_divider())
    lines.append(ReceiptLine(f"Price: {format_pence_for_print(repair['total_pence'], currency, print_style)}", bold=True))

    if repair["paid_pence"] > 0:
        # A deposit was taken at intake -- show it plus the balance still
        # due, on the same receipt.
        lines.append(ReceiptLine(f"Deposit paid: {format_pence_for_print(repair['paid_pence'], currency, print_style)}"))
        balance_text = (
            format_pence_for_print(repair["balance_pence"], currency, print_style)
            if repair["balance_pence"] is not None
            else "Pending"
        )
        lines.append(ReceiptLine(f"Balance due: {balance_text}"))

    lines.append(_divider())
    lines += _terms_block(shop)
    lines += _manager_block(shop)
    lines += _footer()
    return lines


def build_collection_receipt(repair: dict, shop: dict) -> list[ReceiptLine]:
    """Spec section 4: "Collection receipt (at handover): final faults
    done, final price, payment breakdown, £0 balance, warranty-until date.
    No passcode on this one (customer keeps it)."

    Balance shown is the ACTUAL balance, not forced to zero -- a
    "settled" ticket can still carry a small honest leftover balance the
    shop has chosen not to chase (spec section 2), and a collection
    receipt should never print a false £0.
    """
    currency = shop["currency_code"]
    print_style = shop["currency_print_style"]
    lines = _shop_header(shop)
    lines += [
        ReceiptLine(f"Ticket: {repair['ticket']}", bold=True),
        ReceiptLine(f"Name: {repair['name']}"),
        ReceiptLine(f"Model: {repair['model']}"),
        _divider(),
    ]
    for fault in repair["faults"]:
        price = format_pence_for_print(fault["price_pence"], currency, print_style)
        lines.append(ReceiptLine(f"{fault['description']}: {price}"))
    lines.append(_divider())
    lines.append(ReceiptLine(f"Total: {format_pence_for_print(repair['total_pence'], currency, print_style)}", bold=True))
    for payment in repair["payments"]:
        amount = format_pence_for_print(payment["amount_pence"], currency, print_style)
        # A refund is stored as a negative amount_pence in this same
        # table (backend.payments.add_refund) -- label it plainly instead of
        # printing e.g. "Cash: -£10.00" with no explanation of why a
        # payment line is negative.
        if payment["amount_pence"] < 0:
            lines.append(ReceiptLine(f"Refund ({payment['method']}): {amount}"))
        else:
            lines.append(ReceiptLine(f"{payment['method']}: {amount}"))
    balance_text = (
        format_pence_for_print(repair["balance_pence"], currency, print_style)
        if repair["balance_pence"] is not None
        else "Pending"
    )
    lines.append(ReceiptLine(f"Balance: {balance_text}", bold=True))

    # Warranty starts from collection (today), not drop-off -- the
    # customer only has the device to notice a fault recur once they've
    # actually got it back.
    warranty_until = date.today() + timedelta(days=shop["warranty_days"])
    lines.append(_divider())
    lines.append(ReceiptLine(f"Warranty until: {warranty_until.strftime('%d/%m/%Y')}"))

    lines.append(_divider())
    lines += _terms_block(shop)
    lines += _manager_block(shop)
    lines += _footer()
    return lines


def build_sale_receipt(sale: dict, shop: dict) -> list[ReceiptLine]:
    currency = shop["currency_code"]
    print_style = shop["currency_print_style"]
    lines = _shop_header(shop)
    lines += [
        ReceiptLine(f"Name: {sale['name']}"),
        _divider(),
        ReceiptLine(f"Item: {sale['item']}"),
        _divider(),
        ReceiptLine(f"Payment: {sale['method']}"),
        _divider(),
        ReceiptLine(f"Price: {format_pence_for_print(sale['price_pence'], currency, print_style)}", bold=True),
        # Spec section 5: IMEI/Serial is always on the sale receipt,
        # blank prints as "xxxx".
        ReceiptLine(f"IMEI/Serial: {sale['serial'] or 'xxxx'}"),
    ]
    # Only shown once something's actually been refunded -- Price above
    # always stays the original charge (what the item was sold for),
    # never silently rewritten, same principle as a repair's Total.
    if sale["refunded_pence"] > 0:
        net_pence = sale["price_pence"] - sale["refunded_pence"]
        lines.append(ReceiptLine(f"Refunded: {format_pence_for_print(sale['refunded_pence'], currency, print_style)}"))
        lines.append(ReceiptLine(f"Net paid: {format_pence_for_print(net_pence, currency, print_style)}", bold=True))
    lines.append(_divider())
    lines += _terms_block(shop)
    lines += _manager_block(shop)
    lines += _footer()
    return lines


def build_voucher_receipt(formatted_lines: list[str]) -> list[ReceiptLine]:
    """Paste & Print (spec section 6): pure passthrough, already formatted
    to 32 chars by backend.text_formatting.format_voucher_text(). No shop
    header, no terms, no saving -- exactly what's pasted, nothing added.
    """
    return [ReceiptLine(text) for text in formatted_lines]


def build_test_receipt(shop: dict) -> list[ReceiptLine]:
    """Tools > Test print (spec section 11): confirms the right printer
    is selected and alignment looks right before serving a customer.
    """
    lines = _shop_header(shop)
    lines += [
        ReceiptLine("TEST PRINT", align="center", bold=True),
        ReceiptLine("If you can read this clearly,", align="center"),
        ReceiptLine("the printer and alignment are correct.", align="center"),
    ]
    lines += _footer()
    return lines
