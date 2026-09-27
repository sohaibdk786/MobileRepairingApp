"""SQLite schema, connections, and additive migrations.

The local SQLite file is "the boss" (spec section 2) -- the single source
of truth. Every other module reads and writes through get_connection() and
the table shapes defined here, so the schema lives in exactly one place.

Four tables, not three: the spec (section 2) names three tables (Repairs,
Payments, Sales), but section 4 describes faults behaving exactly like
payments -- multiple timestamped lines per ticket, each with its own price
and reason. That needs its own table (`faults`), the same way `payments`
does, so it's included here as the fourth table. Decided with the owner
during Phase 1 planning.

Migrations: new columns added in Phase 2 (edit-stamps, soft-delete) are
applied additively via _apply_migrations() rather than baked into the
CREATE TABLE statements. That lets an existing dropfix_test.db (already
holding Phase 1 tickets) pick up the new columns on next startup instead
of needing to be deleted and recreated -- the same additive approach a
15-year tool needs for any future schema change.
"""
import sqlite3

from backend.core.config import get_db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS repairs (
    ticket      TEXT PRIMARY KEY,      -- e.g. 'MT0251' (prefix = shop's initials); permanent, never renumbered or reused
    created_at  TEXT NOT NULL,         -- ISO local timestamp (shop PC's own clock)
    updated_at  TEXT NOT NULL,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    passcode    TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Received',
    settled     INTEGER NOT NULL DEFAULT 0,  -- 0/1, "done, don't chase" flag (spec section 2)
    notes       TEXT NOT NULL DEFAULT ''
);

-- One row per fault line on a repair. A ticket can gain faults over its
-- life (spec section 4), each with its own price and an "added HH:MM" tag
-- once it's added after creation. The ticket's total price is
-- SUM(faults.price_pence) for that ticket -- never stored on `repairs` --
-- so the total can't drift out of sync with its parts, the same principle
-- the spec applies to Payments (never a fixed cash/card column).
CREATE TABLE IF NOT EXISTS faults (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket       TEXT NOT NULL REFERENCES repairs(ticket),
    description  TEXT NOT NULL,
    price_pence  INTEGER,              -- NULL = price not agreed yet ("pending")
    reason       TEXT NOT NULL DEFAULT '',  -- why the price rose, for faults added later
    added_at     TEXT NOT NULL
);

-- One row per individual payment (spec section 2: never fixed cash/card
-- columns on the ticket, because part-payments -- e.g. cash deposit then a
-- card top-up -- need a list, not a single flag).
CREATE TABLE IF NOT EXISTS payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket       TEXT NOT NULL REFERENCES repairs(ticket),
    amount_pence INTEGER NOT NULL,
    method       TEXT NOT NULL CHECK (method IN ('Cash', 'Card')),
    paid_at      TEXT NOT NULL
);

-- One row per counter sale.
CREATE TABLE IF NOT EXISTS sales (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sold_at      TEXT NOT NULL,
    name         TEXT NOT NULL,
    item         TEXT NOT NULL,
    price_pence  INTEGER NOT NULL,
    method       TEXT NOT NULL CHECK (method IN ('Cash', 'Card')),
    serial       TEXT NOT NULL DEFAULT ''  -- blank prints as 'xxxx' on the receipt
);

-- Phones listed for sale (stock), shown on the public /shop QR page.
-- Separate from `sales` (completed till transactions) so buyer/IMEI
-- data is never exposed on the customer catalogue.
CREATE TABLE IF NOT EXISTS phones_for_sale (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    model        TEXT NOT NULL,
    price_pence  INTEGER NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    imei         TEXT NOT NULL DEFAULT '',
    listed       INTEGER NOT NULL DEFAULT 1,
    deleted_at   TEXT
);

-- Photos for a phone listing (files live in backend/phone_images/).
CREATE TABLE IF NOT EXISTS phone_images (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_id     INTEGER NOT NULL REFERENCES phones_for_sale(id),
    filename     TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

-- One row, always id=1: the editable shop details that print on receipts
-- (spec section 11 -- "shop details are an editable setting, NOT
-- hardcoded"). Seeded with the shop's current real details on first run;
-- see _seed_shop_settings().
CREATE TABLE IF NOT EXISTS shop_settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    shop_name           TEXT NOT NULL,
    address             TEXT NOT NULL,
    manager_name        TEXT NOT NULL,
    manager_phone       TEXT NOT NULL,
    terms_and_conditions TEXT NOT NULL,
    warranty_days       INTEGER NOT NULL
);

-- One row, always id=1: the Google Sheets/Drive identifiers (spec
-- section 10). Separate from shop_settings because these are technical
-- connection details, not receipt content -- Tools > Google Connection
-- edits this row, Tools > Shop Details never touches it.
CREATE TABLE IF NOT EXISTS cloud_settings (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    repairs_sheet_id  TEXT NOT NULL DEFAULT '',
    drive_folder_id   TEXT NOT NULL DEFAULT '',
    last_backup_at    TEXT
);

-- The local queue behind "every save pushes the row up in the
-- background... if offline, the row queues locally and uploads when
-- back" (spec section 10). A row here means "this ticket's Sheet row
-- is out of date, push it when possible". UNIQUE means re-queueing
-- something already pending (e.g. two quick edits before the queue is
-- drained) just refreshes its queued_at instead of piling up duplicates
-- -- only the latest state matters, since the whole row gets rewritten.
CREATE TABLE IF NOT EXISTS sync_queue (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL CHECK (entity_type = 'repair'),
    entity_id    TEXT NOT NULL,
    queued_at    TEXT NOT NULL,
    UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_faults_ticket ON faults(ticket);
CREATE INDEX IF NOT EXISTS idx_payments_ticket ON payments(ticket);
"""

# Columns added after the original Phase 1 schema. (table -> [(column, sql_type), ...])
_MIGRATIONS: dict[str, list[tuple[str, str]]] = {
    "repairs": [
        # Inline "edited HH:MM" stamps (spec: "Edit behaviour") -- one per
        # editable field, set only when that specific field's value changes.
        ("name_edited_at", "TEXT"),
        ("phone_edited_at", "TEXT"),
        ("passcode_edited_at", "TEXT"),
        ("model_edited_at", "TEXT"),
        ("notes_edited_at", "TEXT"),
        # Soft delete: NULL = active. Set to a timestamp on delete so
        # Recently Deleted can show it and purge it 3 calendar days later
        # (spec section 9).
        ("deleted_at", "TEXT"),
        # Public customer tracking token for the QR on intake/collection
        # receipts. Opaque URL-safe secret -- never the ticket number alone.
        ("tracking_token", "TEXT"),
        # Android-style unlock pattern, an alternative to passcode -- a
        # dot sequence like "1-4-7-8-9" (grid numbered 1-9, left to
        # right, top to bottom). Set at intake only, alongside (not
        # instead of, at the schema level) passcode -- which one the
        # ticket actually uses is just whichever of the two is
        # non-blank. Staff-only, same as passcode: never on a receipt.
        ("pattern", "TEXT NOT NULL DEFAULT ''"),
    ],
    "faults": [
        # Set when the *first* fault's price is corrected via Edit (see the
        # "Edit vs price" decision: Edit only ever corrects the intake
        # fault's price; new work goes through Add Fault instead).
        ("price_edited_at", "TEXT"),
    ],
    "sales": [
        ("deleted_at", "TEXT"),
        # A running total, not a ledger -- sales have no payments table
        # to begin with (one price, paid once at the till), so unlike a
        # repair's refunds (their own negative rows in `payments`), a
        # sale's refund(s) just accumulate into this one column. Can
        # never exceed price_pence -- see sales.add_sale_refund.
        ("refunded_pence", "INTEGER NOT NULL DEFAULT 0"),
    ],
    "shop_settings": [
        # The one QZ Tray printer everything prints to (spec section 11:
        # "the printer name lives in one setting, not hardcoded"). Blank
        # until the owner runs Tools > Detect printers > pick > save.
        ("printer_name", "TEXT NOT NULL DEFAULT ''"),
        # Which currency's symbol shows throughout the app (screen and
        # receipts alike) -- a code from backend.core.constants.CURRENCY_CHOICES
        # (e.g. 'GBP', 'USD'), never a conversion. See money.format_pence.
        ("currency_code", "TEXT NOT NULL DEFAULT 'GBP'"),
        # 'sign' or 'text' -- ONLY affects the printed receipt (the app
        # screen always shows the real sign). A fallback for the one real
        # hardware constraint a currency symbol can hit: some signs may
        # not print cleanly on a specific thermal printer's codepage. See
        # money.format_pence_for_print.
        ("currency_print_style", "TEXT NOT NULL DEFAULT 'sign'"),
        # Superseded -- Tools > Shop Website used to embed this as a
        # Google Form for updating the separately-hosted public shop
        # site; that page now just edits shop_website_url/
        # tracker_site_url directly. Kept only because migrations here
        # are additive-only (no column removal); nothing reads this any
        # more.
        (
            "website_form_url",
            "TEXT NOT NULL DEFAULT "
            "'https://docs.google.com/forms/d/e/1FAIpQLSfIRuSK3vEa7ZIP4hsfj5t0nZ7lhn9pso2S5CW4-msPzZheSQ/viewform'",
        ),
        # Base URL printed into receipt QR codes (e.g. https://dropfix.shop
        # or http://192.168.1.10:8000). Blank = QR uses relative /track/...
        # which only works if the phone can reach this same host.
        ("public_base_url", "TEXT NOT NULL DEFAULT ''"),
        # Public shop website shown as a QR on sale receipts (not the
        # old /shop phones catalogue). Editable in Shop Details.
        (
            "shop_website_url",
            "TEXT NOT NULL DEFAULT "
            "'https://mobiletechproltd.github.io/Mobile_Tech_Pro_Ltd/'",
        ),
        # Superseded by receipt_phone/public_phone below -- kept only
        # because migrations here are additive-only (no column removal);
        # nothing reads these two any more.
        ("shop_phone", "TEXT NOT NULL DEFAULT ''"),
        ("default_phone", "TEXT NOT NULL DEFAULT 'manager'"),
        # Not tied to anything yet (not a receipt, not a Sheet push) --
        # just held here for when the tracking page and business card
        # connect to this settings row later.
        ("email", "TEXT NOT NULL DEFAULT ''"),
        ("maps_url", "TEXT NOT NULL DEFAULT ''"),
        # Two clearly-scoped numbers, no toggle: receipt_phone always
        # prints on paper (intake, collection, sale, shop QR); public_phone
        # is for the tracking page + business card once those connect to
        # this settings row. Replaces manager_phone (paper) / shop_phone
        # (public) + the default_phone picker above.
        ("receipt_phone", "TEXT NOT NULL DEFAULT ''"),
        ("public_phone", "TEXT NOT NULL DEFAULT ''"),
        # The separate Customer_QR_Site's URL, for the receipt QR.
        # Defaults to the real deployed Pages URL, same reasoning as
        # shop_website_url above -- a known, predictable address, not a
        # placeholder. Kept apart from public_base_url above (that one
        # still builds this app's own LAN /track/... link) since the two
        # serve different purposes and shouldn't be conflated even
        # though only one is likely to end up used long-term.
        (
            "tracker_site_url",
            "TEXT NOT NULL DEFAULT "
            "'https://mobiletechproltd.github.io/repair-status/'",
        ),
    ],
    "cloud_settings": [
        # Not pushed to yet -- the Sheet ID has somewhere to live in
        # Tools > Google Connection ahead of the push code that'll
        # actually use it.
        ("shop_details_sheet_id", "TEXT NOT NULL DEFAULT ''"),
    ],
}


def get_connection() -> sqlite3.Connection:
    """Open a connection to whichever database the current mode points at
    (dropfix_test.db or dropfix.db -- see backend.core.config).

    Each call opens its own short-lived connection. That's deliberate: a
    single shared connection across FastAPI's threaded request handling is
    a classic source of "works alone, breaks under two clicks" bugs, and
    SQLite handles many short connections to a local file just fine at this
    scale (one counter, one till).
    """
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _apply_migrations(conn: sqlite3.Connection) -> None:
    for table, columns in _MIGRATIONS.items():
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column_name, column_type in columns:
            if column_name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_type}")


def _migrate_currency_mode_to_code(conn: sqlite3.Connection) -> None:
    """currency_mode ('symbol'/'gbp_text', a 2-way £-or-text toggle) was
    replaced by currency_code (an actual currency's code, e.g. 'GBP' /
    'USD' / 'PKR' -- see backend.core.constants.CURRENCY_CHOICES) once Tools >
    Shop Details grew from that toggle into a world-currency picker.
    Renamed rather than left as a second column so its name still matches
    what it actually holds. Must run before _apply_migrations(), which
    otherwise would add a fresh currency_code column instead of finding
    the renamed one.
    """
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(shop_settings)")}
    if "currency_mode" not in existing or "currency_code" in existing:
        return
    conn.execute("ALTER TABLE shop_settings RENAME COLUMN currency_mode TO currency_code")
    # Old values were 'symbol' or 'gbp_text', neither a real currency
    # code -- both meant "this UK shop's own currency", so both become
    # GBP either way.
    conn.execute("UPDATE shop_settings SET currency_code = 'GBP' WHERE currency_code IN ('symbol', 'gbp_text')")


def _migrate_merged_status(conn: sqlite3.Connection) -> None:
    """"Not Agreed - Collected" and "Not Fixed - Collected" started as two
    separate statuses, then got merged into one "Not Agreed/Fixed -
    Collected"; "Not Agreed - In Shop" was then renamed the same way, to
    "Not Agreed/Fixed - In Shop", for naming consistency (see
    backend.core.constants.STATUS_CHOICES). Any ticket already saved under one of
    these old values needs updating so status stays one of the current
    choices -- otherwise it'd show as none of the status buttons selected
    on the detail screen.
    """
    conn.execute(
        "UPDATE repairs SET status = 'Not Agreed/Fixed - Collected' "
        "WHERE status IN ('Not Agreed - Collected', 'Not Fixed - Collected')"
    )
    conn.execute(
        "UPDATE repairs SET status = 'Not Agreed/Fixed - In Shop' "
        "WHERE status = 'Not Agreed - In Shop'"
    )


def _seed_cloud_settings(conn: sqlite3.Connection) -> None:
    """Insert the one empty cloud_settings row if it doesn't exist yet --
    unlike shop_settings there's no real default to seed, since Sheet/
    Drive IDs are the owner's to fill in from Tools > Google Connection.
    """
    row = conn.execute("SELECT 1 FROM cloud_settings WHERE id = 1").fetchone()
    if row is not None:
        return
    conn.execute("INSERT INTO cloud_settings (id) VALUES (1)")


def _seed_shop_settings(conn: sqlite3.Connection) -> None:
    """Insert one placeholder shop_settings row if it doesn't exist yet --
    only ever runs on a genuinely fresh install (a real shop's own row
    already exists long before this could fire again). Deliberately
    obvious placeholder text, not real-looking values: this used to be
    literal early-development seed data ("DropFix Limited", a real
    address, a real person's name and phone number) that just happened
    to survive into a fresh install's first run, easily mistaken for
    actual configured data. Tools > Shop Details is the only way these
    values change after this.
    """
    row = conn.execute("SELECT 1 FROM shop_settings WHERE id = 1").fetchone()
    if row is not None:
        return
    conn.execute(
        """
        INSERT INTO shop_settings
            (id, shop_name, address, manager_name, manager_phone, terms_and_conditions, warranty_days)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        """,
        (
            "Your Shop Name",
            "Your Shop Address",
            "Manager Name",
            "",
            "Collect within 14 days or we are not responsible. "
            "Warranty covers the same repaired fault only. "
            "No warranty for liquid, physical, or 3rd-party repair damage. "
            "No refunds; exchange only if faulty and packaging is kept.",
            7,
        ),
    )


def _backfill_tracking_tokens(conn: sqlite3.Connection) -> None:
    """Give every existing repair a tracking_token so old tickets can still
    print a working QR without re-creating them.
    """
    import secrets

    rows = conn.execute(
        "SELECT ticket FROM repairs WHERE tracking_token IS NULL OR tracking_token = ''"
    ).fetchall()
    for row in rows:
        conn.execute(
            "UPDATE repairs SET tracking_token = ? WHERE ticket = ?",
            (secrets.token_urlsafe(16), row["ticket"]),
        )


def init_db() -> None:
    """Create the DB file and tables if they don't exist yet, add any
    columns introduced since, and seed default shop settings.

    Safe to call on every startup -- every step here is idempotent, so
    this just needs to run once near the top of main.py.
    """
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        _migrate_currency_mode_to_code(conn)
        _apply_migrations(conn)
        _migrate_merged_status(conn)
        _backfill_tracking_tokens(conn)
        _seed_shop_settings(conn)
        _seed_cloud_settings(conn)
        conn.commit()
    finally:
        conn.close()
