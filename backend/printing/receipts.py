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
from datetime import datetime

from backend.core.money import format_pence_for_print
from backend.core.text_formatting import wrap_line, wrap_paragraph


@dataclass
class ReceiptLine:
    text: str = ""
    align: str = "left"  # "left" | "center"
    bold: bool = False
    double: bool = False  # double width + height -- used once, for the shop name banner
    qr_data: str | None = None  # when set, printers render a QR instead of text


def _divider() -> ReceiptLine:
    return ReceiptLine("-" * 32)


def _wrapped(text: str, *, bold: bool = False, align: str = "left") -> list[ReceiptLine]:
    """Word-wrap to 32 chars so long Name/Model/fault lines don't get cut off."""
    return [ReceiptLine(part, bold=bold, align=align) for part in wrap_line(text)]


def _shop_qr_block(shop: dict) -> list[ReceiptLine]:
    """QR to the shop's public website (editable in Shop Details).

    Skipped when no website URL is set. QR only -- no printed URL.
    """
    url = (shop.get("shop_website_url") or "").strip()
    if not url:
        return []
    return [
        _divider(),
        ReceiptLine("Visit our website", align="center", bold=True),
        ReceiptLine("Scan for shop info & contact", align="center"),
        ReceiptLine(qr_data=url, align="center"),
    ]


def _tracker_qr_block(repair: dict) -> list[ReceiptLine]:
    """QR to this ticket's own public tracking page -- intake receipt
    only (spec: the phone is still in the shop, so this is the one
    receipt where checking status is actually useful; collection and
    sale never get one, on request, to not waste paper on a QR nobody
    will use).
    """
    url = (repair.get("track_url") or "").strip()
    if not url:
        return []
    return [
        _divider(),
        ReceiptLine("Track your repair", align="center", bold=True),
        ReceiptLine("Scan to check status online", align="center"),
        ReceiptLine(qr_data=url, align="center"),
    ]


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
    # Blank lines after Tel give paper feed room before the cut.
    return [
        _divider(),
        ReceiptLine(f"Manager: {shop['manager_name']}", align="center"),
        ReceiptLine(f"Tel: {shop['receipt_phone']}", align="center"),
        ReceiptLine(""),
        ReceiptLine(""),
    ]


def _footer() -> list[ReceiptLine]:
    # Receipt ends after manager + blank space (cut follows in the printer).
    return []


def build_intake_receipt(repair: dict, shop: dict) -> list[ReceiptLine]:
    """Quoted price, and -- if a deposit was taken -- a deposit line and
    balance due fitted into the same receipt. No separate deposit
    receipt design.

    Deliberately no Passcode/Pattern on this (or any) receipt -- a lost
    paper receipt would otherwise hand a stranger the customer's name,
    phone, model, AND passcode together. Staff already have it in the
    app; it never needs to leave the counter on paper.
    """
    currency = shop["currency_code"]
    print_style = shop["currency_print_style"]
    lines = _shop_header(shop)
    lines.append(ReceiptLine("INTAKE RECEIPT", align="center", bold=True))
    lines.append(_divider())
    lines.append(ReceiptLine(f"Ticket: {repair['ticket']}", bold=True))
    lines += _wrapped(f"Name: {repair['name']}")
    lines += _wrapped(f"Phone: {repair['phone']}")
    lines += _wrapped(f"Model: {repair['model']}")
    lines.append(_divider())
    for fault in repair["faults"]:
        price = format_pence_for_print(fault["price_pence"], currency, print_style)
        lines += _wrapped(f"{fault['description']}: {price}")
    lines.append(_divider())
    lines += _wrapped(f"Price: {format_pence_for_print(repair['total_pence'], currency, print_style)}", bold=True)

    if repair["paid_pence"] > 0 and repair["balance_pence"] is not None and repair["balance_pence"] <= 0:
        # The full agreed price was paid at/before drop-off -- not a
        # deposit, so say so plainly instead of printing "Deposit paid"
        # next to a misleading "Balance due: £0.00".
        lines += _wrapped(
            f"Paid in full: {format_pence_for_print(repair['paid_pence'], currency, print_style)}", bold=True
        )
    elif repair["paid_pence"] > 0:
        # A genuine deposit was taken at intake -- show it plus the
        # balance still due, on the same receipt.
        lines += _wrapped(f"Deposit paid: {format_pence_for_print(repair['paid_pence'], currency, print_style)}")
        balance_text = (
            format_pence_for_print(repair["balance_pence"], currency, print_style)
            if repair["balance_pence"] is not None
            else "Pending"
        )
        lines += _wrapped(f"Balance due: {balance_text}")
    else:
        # Nothing taken at drop-off -- say so on the receipt itself rather
        # than leaving payment status unstated (the customer's only copy
        # of this ticket).
        lines += _wrapped("Payment: Due on collection")

    lines += _tracker_qr_block(repair)
    lines.append(_divider())
    lines += _terms_block(shop)
    lines += _manager_block(shop)
    lines += _footer()
    return lines


def build_collection_receipt(repair: dict, shop: dict) -> list[ReceiptLine]:
    """Spec section 4: "Collection receipt (at handover): final faults
    done, final price, payment breakdown. No passcode on this one
    (customer keeps it)."

    Balance shown is the ACTUAL balance, not forced to zero -- a
    "settled" ticket can still carry a small honest leftover balance the
    shop has chosen not to chase (spec section 2), and a collection
    receipt should never print a false £0.

    Not Agreed/Fixed - Collected is the one exception to the
    Total/Balance block below: the repair never happened, so instead of
    printing the quoted price as though it were charged or still owed,
    it states plainly that the repair wasn't carried out and, if
    anything was actually taken, that it was a diagnostic fee only.
    """
    currency = shop["currency_code"]
    print_style = shop["currency_print_style"]
    lines = _shop_header(shop)
    lines.append(ReceiptLine("COLLECTION RECEIPT", align="center", bold=True))
    lines.append(_divider())
    lines.append(ReceiptLine(f"Ticket: {repair['ticket']}", bold=True))
    lines += _wrapped(f"Name: {repair['name']}")
    lines += _wrapped(f"Model: {repair['model']}")
    lines.append(_divider())
    for fault in repair["faults"]:
        price = format_pence_for_print(fault["price_pence"], currency, print_style)
        lines += _wrapped(f"{fault['description']}: {price}")
    lines.append(_divider())

    if repair["status"] == "Not Agreed/Fixed - Collected":
        # The repair never happened -- the fault prices above are kept on
        # the receipt as the quote on record (so a return visit for the
        # same repair has it), not what was actually charged. Whatever
        # was paid here, if anything, is a diagnostic fee only, so this
        # replaces the normal Total/Balance block (which would otherwise
        # read as still owing the full quoted price for work that was
        # never done) with a plain statement instead.
        paid_pence = sum(p["amount_pence"] for p in repair["payments"])
        lines.append(ReceiptLine("Repair not carried out.", bold=True))
        if paid_pence > 0:
            fee = format_pence_for_print(paid_pence, currency, print_style)
            lines += _wrapped(f"Diagnostic fee only -- {fee}")
            for payment in repair["payments"]:
                amount = format_pence_for_print(payment["amount_pence"], currency, print_style)
                if payment["amount_pence"] < 0:
                    lines += _wrapped(f"Refund ({payment['method']}): {amount}")
                else:
                    lines += _wrapped(f"{payment['method']}: {amount}")
        else:
            lines += _wrapped("No charge taken.")
    else:
        lines.append(ReceiptLine(f"Total: {format_pence_for_print(repair['total_pence'], currency, print_style)}", bold=True))
        for payment in repair["payments"]:
            amount = format_pence_for_print(payment["amount_pence"], currency, print_style)
            # A refund is stored as a negative amount_pence in this same
            # table (backend.services.payments.add_refund) -- label it plainly instead of
            # printing e.g. "Cash: -£10.00" with no explanation of why a
            # payment line is negative.
            if payment["amount_pence"] < 0:
                lines += _wrapped(f"Refund ({payment['method']}): {amount}")
            else:
                lines += _wrapped(f"{payment['method']}: {amount}")
        balance_text = (
            format_pence_for_print(repair["balance_pence"], currency, print_style)
            if repair["balance_pence"] is not None
            else "Pending"
        )
        lines += _wrapped(f"Balance: {balance_text}", bold=True)

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
    to 32 chars by backend.core.text_formatting.format_voucher_text(). No shop
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
        ReceiptLine(""),
        ReceiptLine(""),
    ]
    return lines


def build_shop_qr_receipt(shop: dict) -> list[ReceiptLine]:
    """Printable QR for the shop website (Tools → Shop Details)."""
    lines = _shop_header(shop)
    lines += _shop_qr_block(shop)
    if not any(line.qr_data for line in lines):
        lines += [
            _divider(),
            ReceiptLine("No website URL set", align="center", bold=True),
            ReceiptLine("Add it in Shop Details", align="center"),
        ]
    lines += [
        ReceiptLine(""),
        ReceiptLine(shop["address"], align="center"),
        ReceiptLine(f"Tel: {shop['receipt_phone']}", align="center"),
        ReceiptLine(""),
        ReceiptLine(""),
    ]
    return lines
