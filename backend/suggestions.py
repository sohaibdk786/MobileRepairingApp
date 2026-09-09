"""Type-ahead suggestions for free-text fields: Name, Phone, Model, a
Sale's custom item, a repair fault's custom "Other" description, and a
fault's custom "Other" reason. Originally just Home's own fields; the
exact same functions now also back the equivalent fields reached later
in a ticket's life (repair/sale Edit, Add Fault) -- one function per
kind of data, never per screen, so there's nothing to keep in sync
between "the same field, asked twice."

Pulled from this shop's own past repairs/sales (spec section 16: a single
source of truth), not the browser's own autofill memory -- so it works
the same on any till, not just whichever browser has "remembered" it
before. Every field is suggested completely independently: picking a
name suggestion never touches the phone box, and vice versa -- each
function here queries exactly one column (or the same column across
repairs+sales, for name), never a shared or fuzzy search across
everything.
"""
import sqlite3

from backend.constants import FAULT_CHOICES, FAULT_REASON_CHOICES, SALE_ITEMS

MAX_SUGGESTIONS = 8


def suggest_names(conn: sqlite3.Connection, query: str) -> list[str]:
    """Distinct past customer names starting with `query` (case-
    insensitive), drawn from both repairs and sales, most-recently-used
    first.
    """
    query = query.strip()
    if not query:
        return []
    like = f"{query}%"
    rows = conn.execute(
        """
        SELECT name, MAX(used_at) AS last_used FROM (
            SELECT name, created_at AS used_at FROM repairs WHERE deleted_at IS NULL
            UNION ALL
            SELECT name, sold_at AS used_at FROM sales WHERE deleted_at IS NULL
        )
        WHERE name LIKE ? COLLATE NOCASE
        GROUP BY name
        ORDER BY last_used DESC
        LIMIT ?
        """,
        (like, MAX_SUGGESTIONS),
    ).fetchall()
    return [row["name"] for row in rows]


def suggest_phones(conn: sqlite3.Connection, query: str) -> list[str]:
    """Distinct past phone numbers starting with `query`, most-recently-
    used first. Repairs only -- sales have no phone field.
    """
    query = query.strip()
    if not query:
        return []
    like = f"{query}%"
    rows = conn.execute(
        """
        SELECT phone, MAX(created_at) AS last_used
        FROM repairs
        WHERE deleted_at IS NULL AND phone != '' AND phone LIKE ?
        GROUP BY phone
        ORDER BY last_used DESC
        LIMIT ?
        """,
        (like, MAX_SUGGESTIONS),
    ).fetchall()
    return [row["phone"] for row in rows]


def suggest_models(conn: sqlite3.Connection, query: str) -> list[str]:
    """Distinct past phone models starting with `query`, most-recently-
    used first.
    """
    query = query.strip()
    if not query:
        return []
    like = f"{query}%"
    rows = conn.execute(
        """
        SELECT model, MAX(created_at) AS last_used
        FROM repairs
        WHERE deleted_at IS NULL AND model != '' AND model LIKE ?
        GROUP BY model
        ORDER BY last_used DESC
        LIMIT ?
        """,
        (like, MAX_SUGGESTIONS),
    ).fetchall()
    return [row["model"] for row in rows]


def suggest_custom_sale_items(conn: sqlite3.Connection, query: str) -> list[str]:
    """Distinct past custom "Other" sale items starting with `query` --
    excludes the fixed SALE_ITEMS dropdown values, since those are
    already picked from the dropdown and suggesting them back would just
    be noise. Only genuinely typed-in custom items show up here.
    """
    query = query.strip()
    if not query:
        return []
    like = f"{query}%"
    placeholders = ",".join("?" for _ in SALE_ITEMS)
    rows = conn.execute(
        f"""
        SELECT item, MAX(sold_at) AS last_used
        FROM sales
        WHERE deleted_at IS NULL AND item LIKE ? AND item NOT IN ({placeholders})
        GROUP BY item
        ORDER BY last_used DESC
        LIMIT ?
        """,
        (like, *SALE_ITEMS, MAX_SUGGESTIONS),
    ).fetchall()
    return [row["item"] for row in rows]


def suggest_fault_descriptions(conn: sqlite3.Connection, query: str) -> list[str]:
    """Distinct past custom "Other" fault descriptions starting with
    `query` -- excludes the fixed FAULT_CHOICES dropdown values, same
    reasoning as suggest_custom_sale_items. Draws from every fault ever
    typed under "Other", not just ones added at intake, since both end up
    in the same faults.description column.
    """
    query = query.strip()
    if not query:
        return []
    like = f"{query}%"
    placeholders = ",".join("?" for _ in FAULT_CHOICES)
    rows = conn.execute(
        f"""
        SELECT description, MAX(added_at) AS last_used
        FROM faults
        JOIN repairs ON repairs.ticket = faults.ticket
        WHERE repairs.deleted_at IS NULL
          AND description LIKE ?
          AND description NOT IN ({placeholders})
        GROUP BY description
        ORDER BY last_used DESC
        LIMIT ?
        """,
        (like, *FAULT_CHOICES, MAX_SUGGESTIONS),
    ).fetchall()
    return [row["description"] for row in rows]


def suggest_fault_reasons(conn: sqlite3.Connection, query: str) -> list[str]:
    """Distinct past custom "Other" reasons (why a fault's price rose)
    starting with `query` -- excludes the fixed FAULT_REASON_CHOICES
    dropdown values, same reasoning and same shape as
    suggest_fault_descriptions, just aimed at faults.reason instead of
    faults.description.
    """
    query = query.strip()
    if not query:
        return []
    like = f"{query}%"
    placeholders = ",".join("?" for _ in FAULT_REASON_CHOICES)
    rows = conn.execute(
        f"""
        SELECT reason, MAX(added_at) AS last_used
        FROM faults
        JOIN repairs ON repairs.ticket = faults.ticket
        WHERE repairs.deleted_at IS NULL
          AND reason LIKE ?
          AND reason NOT IN ({placeholders})
        GROUP BY reason
        ORDER BY last_used DESC
        LIMIT ?
        """,
        (like, *FAULT_REASON_CHOICES, MAX_SUGGESTIONS),
    ).fetchall()
    return [row["reason"] for row in rows]
