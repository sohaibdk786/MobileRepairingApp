"""Repair ticket API routes: create, view, and change a repair (status,
faults, payments, settled, edit, delete/restore).

Every write route re-fetches and returns the full detail payload, so the
frontend's universal detail screen can just replace its state with
whatever comes back rather than patching fields by hand.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.constants import FAULT_CHOICES, FAULT_REASON_CHOICES, PAYMENT_METHODS, STATUS_CHOICES
from backend.core.database import get_connection
from backend.services.faults import add_fault, delete_fault, set_fault_price
from backend.core.money import format_pence, parse_pounds_to_pence
from backend.services.payments import add_payment, add_refund, add_split_payment
from backend.services.presenters import present_repair_detail
from backend.services.repairs import (
    create_repair,
    edit_repair,
    find_matching_last_repair,
    get_repair_detail,
    restore_repair,
    set_settled,
    soft_delete_repair,
    update_status,
)
from backend.services.shop_settings import get_currency_code
from backend.services.sync_queue import enqueue_repair

router = APIRouter(prefix="/api/repairs", tags=["repairs"])


def _resolve_fault_description(fault: str, fault_other: str) -> str:
    if fault == "Other":
        # Spec section 4: if "Other" is chosen and left blank, it stays "Other".
        return fault_other.strip() or "Other"
    if fault not in FAULT_CHOICES:
        raise HTTPException(400, f"Unknown fault type: {fault}")
    return fault


class RepairIn(BaseModel):
    name: str
    phone: str = ""
    passcode: str = ""
    model: str
    fault: str
    fault_other: str = ""
    price: str = ""  # typed pounds text, e.g. "45" or "" for pending
    force: bool = False  # bypass the identical-to-last check ("Save as a new second ticket")


@router.post("")
def api_create_repair(payload: RepairIn) -> dict:
    fault_description = _resolve_fault_description(payload.fault, payload.fault_other)
    try:
        price_pence = parse_pounds_to_pence(payload.price)
    except ValueError:
        raise HTTPException(400, "Price must be a number, or left blank for pending")

    conn = get_connection()
    try:
        if not payload.force:
            # Spec section 4, "Identical-to-last-print check": if nothing
            # typed differs from the last saved ticket, stop before saving
            # and let the frontend ask the user what they meant, instead
            # of silently creating a click-jam duplicate.
            duplicate_ticket = find_matching_last_repair(
                conn,
                name=payload.name,
                phone=payload.phone,
                passcode=payload.passcode,
                model=payload.model,
                fault_description=fault_description,
                price_pence=price_pence,
            )
            if duplicate_ticket:
                return {"duplicate": True, "last_ticket": duplicate_ticket}

        try:
            ticket = create_repair(
                conn,
                name=payload.name,
                phone=payload.phone,
                passcode=payload.passcode,
                model=payload.model,
                fault_description=fault_description,
                price_pence=price_pence,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()

    return {"duplicate": False, "ticket": ticket, "price_display": format_pence(price_pence, currency_code)}


@router.get("/{ticket}")
def api_get_repair(ticket: str) -> dict:
    conn = get_connection()
    try:
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    if detail is None:
        raise HTTPException(404, f"Ticket {ticket} not found")
    return present_repair_detail(detail, currency_code)


class StatusIn(BaseModel):
    status: str


@router.post("/{ticket}/status")
def api_update_status(ticket: str, payload: StatusIn) -> dict:
    if payload.status not in STATUS_CHOICES:
        raise HTTPException(400, f"Status must be one of {STATUS_CHOICES}")
    conn = get_connection()
    try:
        try:
            update_status(conn, ticket, payload.status)
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class FaultIn(BaseModel):
    description: str
    price: str = ""
    reason: str
    reason_other: str = ""


@router.post("/{ticket}/faults")
def api_add_fault(ticket: str, payload: FaultIn) -> dict:
    reason = payload.reason
    if reason == "Other":
        reason = payload.reason_other.strip() or "Other"
    elif reason not in FAULT_REASON_CHOICES:
        raise HTTPException(400, f"Reason must be one of {FAULT_REASON_CHOICES}")

    try:
        price_pence = parse_pounds_to_pence(payload.price)
    except ValueError:
        raise HTTPException(400, "Price must be a number, or left blank for pending")

    conn = get_connection()
    try:
        try:
            add_fault(
                conn,
                ticket=ticket,
                description=payload.description,
                price_pence=price_pence,
                reason=reason,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class FaultPriceIn(BaseModel):
    price: str


@router.post("/{ticket}/faults/{fault_id}/price")
def api_set_fault_price(ticket: str, fault_id: int, payload: FaultPriceIn) -> dict:
    try:
        price_pence = parse_pounds_to_pence(payload.price)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if price_pence is None:
        raise HTTPException(400, "Price is required")

    conn = get_connection()
    try:
        try:
            set_fault_price(conn, ticket, fault_id, price_pence)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


@router.delete("/{ticket}/faults/{fault_id}")
def api_delete_fault(ticket: str, fault_id: int) -> dict:
    conn = get_connection()
    try:
        try:
            delete_fault(conn, ticket, fault_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class PaymentIn(BaseModel):
    amount: str  # typed pounds text; balance auto-fill is a frontend convenience only
    method: str


@router.post("/{ticket}/payments")
def api_add_payment(ticket: str, payload: PaymentIn) -> dict:
    if payload.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Method must be one of {PAYMENT_METHODS}")
    try:
        amount_pence = parse_pounds_to_pence(payload.amount)
    except ValueError as exc:
        # Forward parse_pounds_to_pence's actual reason (e.g. "Price cannot
        # be negative") instead of a hardcoded generic message -- it used to
        # say "must be a valid number" even when the real problem was a
        # negative amount, which reads like a typo error when it wasn't one.
        raise HTTPException(400, str(exc))
    if amount_pence is None:
        raise HTTPException(400, "Payment amount is required")

    conn = get_connection()
    try:
        try:
            add_payment(conn, ticket=ticket, amount_pence=amount_pence, method=payload.method)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class SplitPaymentIn(BaseModel):
    cash: str = ""
    card: str = ""


@router.post("/{ticket}/payments/split")
def api_add_split_payment(ticket: str, payload: SplitPaymentIn) -> dict:
    try:
        cash_pence = parse_pounds_to_pence(payload.cash) or 0
        card_pence = parse_pounds_to_pence(payload.card) or 0
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    conn = get_connection()
    try:
        try:
            add_split_payment(conn, ticket=ticket, cash_pence=cash_pence, card_pence=card_pence)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class RefundIn(BaseModel):
    amount: str
    method: str


@router.post("/{ticket}/refunds")
def api_add_refund(ticket: str, payload: RefundIn) -> dict:
    if payload.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Method must be one of {PAYMENT_METHODS}")
    try:
        amount_pence = parse_pounds_to_pence(payload.amount)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if amount_pence is None:
        raise HTTPException(400, "Refund amount is required")

    conn = get_connection()
    try:
        try:
            add_refund(conn, ticket=ticket, amount_pence=amount_pence, method=payload.method)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class SettledIn(BaseModel):
    settled: bool


@router.post("/{ticket}/settle")
def api_set_settled(ticket: str, payload: SettledIn) -> dict:
    conn = get_connection()
    try:
        try:
            set_settled(conn, ticket, payload.settled)
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


class EditIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    passcode: Optional[str] = None
    model: Optional[str] = None
    notes: Optional[str] = None
    price: Optional[str] = None  # omitted/None = leave alone; "" = set to pending; else a number


@router.patch("/{ticket}")
def api_edit_repair(ticket: str, payload: EditIn) -> dict:
    price_kwargs = {}
    if payload.price is not None:
        try:
            price_kwargs["price_pence"] = parse_pounds_to_pence(payload.price)
        except ValueError:
            raise HTTPException(400, "Price must be a number, or left blank for pending")

    conn = get_connection()
    try:
        try:
            changed = edit_repair(
                conn,
                ticket,
                name=payload.name,
                phone=payload.phone,
                passcode=payload.passcode,
                model=payload.model,
                notes=payload.notes,
                **price_kwargs,
            )
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        if changed:  # spec: "if nothing is changed, nothing updates" -- including no Sheet re-sync
            enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)


@router.delete("/{ticket}")
def api_delete_repair(ticket: str) -> dict:
    conn = get_connection()
    try:
        try:
            soft_delete_repair(conn, ticket)
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        enqueue_repair(conn, ticket)  # so the background sync removes this row from the Sheet
    finally:
        conn.close()
    return {"deleted": True, "ticket": ticket}


@router.post("/{ticket}/restore")
def api_restore_repair(ticket: str) -> dict:
    conn = get_connection()
    try:
        try:
            restore_repair(conn, ticket)
        except ValueError as exc:
            raise HTTPException(404, str(exc))
        enqueue_repair(conn, ticket)
        detail = get_repair_detail(conn, ticket)
        currency_code = get_currency_code(conn)
    finally:
        conn.close()
    return present_repair_detail(detail, currency_code)
