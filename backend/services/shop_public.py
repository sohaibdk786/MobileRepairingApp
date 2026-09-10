"""Public shop catalogue (QR): phones for sale + shop contact/address."""
import sqlite3

from backend.core.money import format_pence
from backend.services.phones import images_for_phones, list_phones
from backend.services.shop_settings import get_currency_code, get_shop_settings


def build_shop_url(shop: dict) -> str:
    base = (shop.get("public_base_url") or "").strip().rstrip("/")
    path = "/shop"
    if base:
        return f"{base}{path}"
    return path


def get_public_shop(conn: sqlite3.Connection) -> dict:
    shop = get_shop_settings(conn)
    currency = get_currency_code(conn)
    phones = list_phones(conn, listed_only=True)
    images_map = images_for_phones(conn, [p["id"] for p in phones])
    return {
        "shop_name": shop["shop_name"],
        "address": shop["address"],
        "phone": shop["manager_phone"],
        "manager_name": shop["manager_name"],
        "phones": [
            {
                "id": p["id"],
                "model": p["model"],
                "price_display": format_pence(p["price_pence"], currency),
                "notes": (p["notes"] or "").strip(),
                "images": [
                    {"id": img["id"], "url": img["url"]}
                    for img in images_map.get(p["id"], [])
                ],
            }
            for p in phones
        ],
    }
