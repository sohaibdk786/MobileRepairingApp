# DropFix — coding conventions

This project has two contributors editing the same repo (the shop owner via
Claude Code, and a developer working by hand). These conventions come from
his code, not the other way around — match them exactly when editing this
repo. Don't introduce a different style even if it's "cleaner" in the
abstract.

## Directory structure — never mix layers

- `backend/` (FastAPI) and `frontend-react/` (Vite + React + Tailwind) are
  fully separate trees. Never put frontend logic in a backend file or
  vice versa.
- Inside `backend/`, code is split by concern into subpackages:
  `core/` (shared low-level helpers: text formatting, money, constants,
  database), `services/` (business logic, one file per domain: repairs,
  sales, payments, tracking, shop_settings...), `routes/` (FastAPI
  endpoints, thin — call into `services/`, don't contain logic),
  `printing/` (receipt content + rendering).
- One concern per file. If a new piece of logic doesn't fit an existing
  file's stated purpose, it gets its own file in the right subpackage —
  it does not get bolted onto an unrelated file.
- Legacy/replaced code is deleted outright, not left half-migrated
  alongside the new version (see: the old vanilla-JS `frontend/` folder,
  fully removed once `frontend-react/` replaced it).

## Function style

- Small, single-purpose functions named for exactly what they build or do
  (`_shop_qr_block`, `_manager_block`, `_terms_block`, `_wrapped`,
  `_divider`). Prefixed `_` when private to the module.
- Receipts (and similar composite output) are built by composing these
  small helpers into a list (`lines = _shop_header(shop); lines += [...]`),
  never as one long inline block.
- One shared data model rendered by multiple backends: `ReceiptLine` is
  built once per receipt type and rendered identically by both the
  Test-mode PDF path and the real ESC/POS path — never duplicate content
  logic per output format.
- When a helper already exists for a risk/pattern (e.g. `_wrapped()` for
  overflow-safe text, `chunk_text()` for hard-breaking long tokens), reuse
  it everywhere that same risk applies, not just in the newest code path.
  (This was the actual bug found and fixed 2026-09-19: the intake receipt
  used plain `ReceiptLine(...)` for Name/Phone/Model while the collection
  receipt used `_wrapped()` for the same kind of fields.)

## Docstrings and comments

- Module and function docstrings cite the spec by section number where
  one exists, e.g. `"""Spec section 4: "Intake receipt (at drop-off):
  ..."""` — the docstring's job is to say *why* this shape was chosen,
  not to restate the function name in prose.
- Comments explain non-obvious *why* only: a specific historical bug, a
  workaround, a hidden constraint. Never comment what the code obviously
  does. If removing a comment wouldn't confuse a future reader, don't
  write it.
- Keep docstrings in sync with the actual field list — if a field is
  intentionally removed (e.g. passcode dropped from the intake receipt
  for customer security), update the docstring in the same change,
  don't leave it describing the old behavior.

## .gitignore / repo hygiene

- Generated/environment artifacts are always ignored, never committed:
  virtualenvs (`venv/`, `.venv/`), `node_modules/`, build output
  (`frontend-react/dist/`), generated test receipts, exported
  spreadsheets.
- `Start Shop App.bat` (Windows) / `Start DropFix.command` (Mac)
  regenerate the environment from scratch on a shop PC — don't
  hand-create a venv at a different path and expect the launcher to
  find it (expects `backend/.venv`, with a dot).
- The Windows launcher only reinstalls/rebuilds when
  `requirements.txt` / `package.json` actually changed since the last
  successful run (tracked via hash files inside `.venv`/`dist`, both
  already gitignored) — it does not blindly skip forever, and does not
  blindly rebuild every launch either. Added 2026-09-19; see
  [[dropfix-shop-app-launcher]].

## README / documentation style

- Written for two different audiences in the same document, kept in
  clearly separate sections: a "Quick start" section for non-technical
  shop staff (numbered steps, a troubleshooting table, no jargon), and a
  separate "Developer run" section for anyone editing code (venv path,
  exact run commands, ports).

## Workflow for this repo specifically

- Pull before starting work; commit and push after every verified,
  requested change — this repo is actively shared with another developer,
  so local and remote should stay in sync rather than diverging for long.
- Only change what was explicitly asked. Findings noticed along the way
  get reported, not silently fixed, unless asked for.
- Verify live (run the server, hit the real endpoint, check the real
  output) before calling a change done — don't rely on reading the code
  alone.
