"""Type-ahead suggestion routes for free-text fields across the app:
Name, Phone, Model, a Sale's custom item, a repair fault's custom
"Other" description, and a fault's custom "Other" reason. One endpoint
per KIND of field, not per screen -- Home and the detail page's Edit/Add
Fault forms share these same endpoints, since it's the same underlying
data either way. A name box must never suggest phone numbers, and so on
for the rest.
"""
from fastapi import APIRouter

from backend.database import get_connection
from backend.suggestions import (
    suggest_custom_sale_items,
    suggest_fault_descriptions,
    suggest_fault_reasons,
    suggest_models,
    suggest_names,
    suggest_phones,
)

router = APIRouter(prefix="/api/suggest", tags=["suggest"])


@router.get("/names")
def api_suggest_names(q: str = "") -> list[str]:
    conn = get_connection()
    try:
        return suggest_names(conn, q)
    finally:
        conn.close()


@router.get("/phones")
def api_suggest_phones(q: str = "") -> list[str]:
    conn = get_connection()
    try:
        return suggest_phones(conn, q)
    finally:
        conn.close()


@router.get("/models")
def api_suggest_models(q: str = "") -> list[str]:
    conn = get_connection()
    try:
        return suggest_models(conn, q)
    finally:
        conn.close()


@router.get("/sale-custom-items")
def api_suggest_sale_custom_items(q: str = "") -> list[str]:
    conn = get_connection()
    try:
        return suggest_custom_sale_items(conn, q)
    finally:
        conn.close()


@router.get("/fault-descriptions")
def api_suggest_fault_descriptions(q: str = "") -> list[str]:
    conn = get_connection()
    try:
        return suggest_fault_descriptions(conn, q)
    finally:
        conn.close()


@router.get("/fault-reasons")
def api_suggest_fault_reasons(q: str = "") -> list[str]:
    conn = get_connection()
    try:
        return suggest_fault_reasons(conn, q)
    finally:
        conn.close()
