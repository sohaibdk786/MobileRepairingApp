"""Small read-only routes the frontend uses to stay in sync with the
backend's fixed choice lists and current mode, instead of hardcoding its
own copies (spec section 16: "a single place for each concern").
"""
from fastapi import APIRouter

from backend.core.config import get_mode, get_print_dialog_mode, get_print_method
from backend.core.constants import (
    CURRENCY_CHOICES,
    FAULT_ADD_CHOICES,
    FAULT_CHOICES,
    PAYMENT_METHODS,
    SALE_ITEMS,
    STATUS_CHOICES,
    STATUS_STAFF_HINTS,
)

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/status")
def api_status() -> dict:
    """Which mode (test/live) the app is running in, so the frontend can
    show an unmissable banner. The user must never be left guessing
    whether they're typing into fake or real data.

    Also carries the current print method and print dialog mode
    (Tools > Printer) -- separate settings from mode, but the frontend
    needs all three on load.
    """
    return {
        "mode": get_mode(),
        "print_method": get_print_method(),
        "print_dialog_mode": get_print_dialog_mode(),
    }


@router.get("/fault-choices")
def api_fault_choices() -> list[str]:
    return FAULT_CHOICES


@router.get("/fault-add-choices")
def api_fault_add_choices() -> list[str]:
    return FAULT_ADD_CHOICES


@router.get("/sale-items")
def api_sale_items() -> list[str]:
    return SALE_ITEMS


@router.get("/payment-methods")
def api_payment_methods() -> list[str]:
    return PAYMENT_METHODS


@router.get("/status-choices")
def api_status_choices() -> list[str]:
    return STATUS_CHOICES


@router.get("/status-hints")
def api_status_hints() -> dict[str, str]:
    """Short staff labels for each status button on the detail screen."""
    return STATUS_STAFF_HINTS


@router.get("/currency-choices")
def api_currency_choices() -> list[dict]:
    return CURRENCY_CHOICES
