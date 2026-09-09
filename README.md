# DropFix Shop System

A local shop-management app for DropFix Limited (phone repairs). Full
design and reasoning: `DropFix_App_Spec.md`. Build order: `DropFix_Build_Plan.md`.

This README covers the current state of the build only.

## Standing rule: never hardcode a currency symbol

Whichever currency is picked in Tools > Shop Details must control **every**
money symbol in the app -- screen and receipts alike -- with zero
exceptions. Audited the whole codebase for this (2026-08-16): every money
display already goes through one of three reactive mechanisms, and
**nothing was hardcoded** -- keep it that way on every future edit:

1. **Backend display strings**: always `app.money.format_pence(pence,
   currency_code)` for anything shown on screen, or
   `format_pence_for_print(pence, currency_code, print_style)` for
   anything printed on a receipt. Never build a money string by hand
   with `f"£{...}"` or similar -- if a new field needs a `_display`
   value, add it through one of these two functions, matching the
   pattern already used for every `*_display` field in
   `app/presenters.py` and every money line in `app/receipts.py`.
2. **Frontend HTML labels** (e.g. "Price (£)"): never type the £
   character directly. Wrap it as `<span
   class="currency-symbol">&pound;</span>` -- `app/static/common.js`
   fills every one of these in from the live currency setting on every
   page load, so a static `&pound;` is only ever the pre-JS fallback,
   not what actually shows.
3. **Frontend JS-computed values** (money worked out client-side, not
   straight from the API): never hardcode `"£"`. Use
   `formatPenceLike(pence, sampleDisplay)` from `app/static/util.js`,
   which pulls the symbol out of an already-reactive `*_display` string
   from the same API response -- so it can never drift out of sync with
   whatever the backend is currently using.

The only literal `£` characters that are ever correct to write: the
`GBP` entry in `app.constants.CURRENCY_CHOICES` itself, and
`format_pence`'s documented fail-safe fallback for an unrecognised
currency code (never fires in normal use). Everything else -- a new
button, a new label, a new receipt line, a new detail-page field -- must
go through one of the three mechanisms above.

## Data flow (how information moves)

```
Home page (Repair / Sale / Paste boxes)          Search / Reprint / Tools
      |                                                    |
      v                                                    v
FastAPI routes (app/routes/*.py)  <----------------------->+
      |
      v
Business-logic modules (repairs.py, sales.py, faults.py,
payments.py, deleted.py, shop_settings.py)
      |
      v
SQLite database  <-- THE BOSS, single source of truth
  dropfix_test.db (Test mode)  or  dropfix.db (Live mode)
      |
      +--> Printing: app/receipts.py builds content -> app/printing.py
      |    picks Test (PDF) or Live (ESC/POS via browser -> QZ Tray)
      |
      +--> app/sync_queue.py queues a row every time something changes
           -> app/background_tasks.py drains it every ~15s into
              app/sheets_sync.py (Google Sheets) -- all behind
              app/google_auth.py, which needs a service-account key
      |
      +--> app/background_tasks.py also fires app/drive_backup.py at
           11:00/19:00 (with startup catch-up), backing up the whole
           .db file to Google Drive
```

## What's built (Phases 1-4, minus real go-live steps)

**Phases 1-3** (foundation, all screens, printing): see git history / prior
notes -- ticket numbering, the Repair/Sale/Paste boxes, the universal
ticket detail screen, Search, Reprint, Recently Deleted, and real
ESC/POS + PDF receipt printing with the £ fix.

**This round added:**

### Visual design overhaul
Rewrote `style.css` as a proper design system (colour/spacing/shadow/
radius tokens, Apple-influenced palette and typography) instead of
one-off values per component. Fixed the specific "boxes up/down"
misalignment on Home and Reprint: those grids now stretch every card to
the row's tallest card, and each card is a flex column with its main
button pinned to the bottom, so buttons line up across cards regardless
of how much text is above them.

### Tools restructure
`/tools` is now a menu, not one long page. Each tile opens its own page
and its own URL (originally 5 tiles; a 6th, Appearance, was added in the
post-launch round below):
- `/tools/shop-details` -- name, address, manager, T&C, warranty, currency
- `/tools/printer` -- detect/select/test print
- `/tools/backup` -- backup now, restore (both paths), CSV export
- `/tools/google` -- key upload/replace/remove, Sheet/Drive IDs
- `/tools/deleted` -- Recently Deleted
- `/tools/appearance` -- Light/Dark/System theme + accent colour (see below)

### Phase 4: Google Sheets sync
Every repair/sale write enqueues itself (`app/sync_queue.py`, a real
SQLite table, so nothing is lost on a crash or restart); a background
loop drains the queue every ~30 seconds and pushes each row to the
Repairs or Sales Sheet, update-or-append, using CP1252-safe text-forcing
for phone/passcode/serial so leading zeros survive. A soft-deleted
ticket's row is removed from the Sheet; a restored one reappears.

### Phase 4: Drive backup
Twice-daily backup (11:00/19:00) of the whole `.db` file, with a
`PRAGMA integrity_check` health check before every upload -- a corrupt
database is never allowed to overwrite a good backup. Missed marks are
caught up once at the next startup, never silently skipped.

### Phase 4: Restore, key management, export
- **Restore from `.db`**: upload a file in Tools > Backup & Restore; it's
  validated (integrity check + has a `repairs` table) before anything is
  touched, and the current database is kept as a timestamped copy first.
- **Import from Sheet**: reads a *clean*, already-correctly-columned
  Sheet (the same layout the sync module writes) and creates any tickets
  not already present. Deliberately does **not** include the one-time
  messy-column-remapping logic for the real production sheet (spec
  section 12) -- you told me to leave that for actual go-live.
- **Google key**: upload/replace/remove the service-account JSON
  directly in Tools > Google Connection, with the key's own
  `client_email` shown back to you (that's exactly what you share the
  Sheets and Drive folder with).
- **CSV export**: `repairs.csv` / `sales.csv`, fully local, no Google
  needed.

### PWA
A real manifest (installable, opens in its own window) and a small
service worker that caches the app's own HTML/CSS/JS (never `/api/*`) so
the shell survives a brief network hiccup and the CDN-loaded QZ Tray
library survives a short internet outage once fetched. Not attempted:
packaging into a PyInstaller `.exe` -- you asked to leave that out too.

## Post-launch refinement round (live, on the running app)

Everything below happened *after* Phase 4, testing the live app directly
and fixing/adding things by instruction -- exactly what the Build Plan's
own "After go-live" section anticipated. Grouped by theme, not
chronological order.

### Dark mode + accent colour theming
- **Theme** (`app/static/theme.js`): Light / Dark / System, in
  Tools > Appearance. Stored in `localStorage` (a per-browser display
  preference, not shop data -- deliberately NOT in the database, so a
  second till never inherits it). `data-theme` on `<html>`; `style.css`
  defines the dark palette twice (once for the explicit choice, once
  inside a `prefers-color-scheme` query for "System") since a page can't
  conditionally nest a selector inside half a media query.
- **Accent colour** (`app/static/accent.js`): Green (default) / Blue /
  Red / Cyan / Purple / Orange / Indigo / Pink, in the same Tools >
  Appearance page, as a **separate, independent** setting from Theme
  (own storage key, own
  `data-accent` attribute) -- switching one never touches the other.
  Only `--accent` and `--select-arrow` (a colour baked into an encoded
  SVG, the one thing that *can't* be a formula) are given a literal value
  per colour; every other accent-derived token (`--accent-dark`,
  `--accent-focus-ring`, `--ok`, `--ok-bg`) is a CSS `color-mix()`
  formula that recomputes on its own -- so a 7th colour later only needs
  one `--accent` + `--select-arrow` pair added per theme context, not a
  hand-tuned shade for every derived token. The default green's formula
  ratios (69%/12% light, 83%/26% dark) were solved to land within
  rounding error of the exact hex values used before this became a
  formula, verified against real Chromium-computed colours (headless
  Chrome), not just arithmetic -- confirmed pixel-identical or within 1
  RGB point, except dark mode's `--ok-bg`, which is a close approximation
  (the original hex wasn't reachable by any single-formula mix).
- Both scripts load early, un-deferred, in every page's `<head>`, right
  after `<meta charset>`, so the right theme/colour applies before first
  paint (no flash-of-wrong-colour). Both re-apply on `pageshow` when
  `event.persisted` is true, fixing a real bug: the browser's
  back-forward cache can restore a page exactly as it looked when frozen,
  *before* a theme/colour change made on another page.

### Currency: world-currency picker + separate sign/text print toggle
Tools > Shop Details > Currency now offers 15 world currencies (GBP,
USD, EUR, PKR, INR, AUD, CAD, NZD, AED, SAR, CNY, JPY, ZAR, TRY, BDT --
`app/constants.py: CURRENCY_CHOICES`), each a `{code, symbol}` pair.
Two rules keep this simple and safe:
1. **Never a conversion.** Prices are stored as plain pence, not tied to
   any currency -- picking a different one only changes which character
   shows, never the number. `app/money.py: format_pence()` is the one
   function every screen and receipt goes through.
2. **The screen always shows the real sign.** A second setting, "How it
   prints on receipts" (Sign / Text), affects *only* the printed receipt
   -- `format_pence_for_print()` -- as an escape hatch for the one real
   hardware constraint a symbol can hit (a specific thermal printer's
   codepage not rendering it), the same reasoning the old £-vs-"GBP text"
   toggle already existed for. Text mode prints the plain 3-letter code
   (`"USD 45.00"`) instead of the sign.

The old `currency_mode` ('symbol'/'gbp_text') column was **renamed** to
`currency_code` via a real migration (`app/database.py:
_migrate_currency_mode_to_code`), not left as a second column -- old
values are normalised to `'GBP'` on first startup after the upgrade.

Every `Price (£)` / `Amount (£)` label in the HTML is no longer
hardcoded: the £ is wrapped in `<span class="currency-symbol">`, filled
in by `common.js` (which already runs on every page for the mode banner
and shop name) from whichever currency is actually selected.

### Search: passcode visible, quick-reprint moved here, old Reprint page removed
The old standalone `/reprint` page duplicated Search's own filter/browse
UI once its 3 quick-action cards ("Last repair" / "Last collection
receipt" / "Last sale") moved to the top of `/search`. The page,
its route, and the nav link are gone; `app/static/reprint.js` (the logic
behind those 3 cards) is NOT dead code -- it's loaded by `search.html`
now instead.

Every repair row in Search, and a ticket's own detail page header, now
shows its passcode right there (`DF0096 · Daniel Hussain · 078443`) --
no need to open a ticket just to read it back to a customer. Styled to
match the name's own font/size/colour exactly, just underlined
(`.passcode-match-name`). Three earlier variants (a chip badge, a lock
icon + underline, green text) were kept around unused for a while as
easy fallbacks, but were dead code with nothing ever referencing them --
removed during a later dead-code sweep.

### Status list simplified: 6 -> 5
"Not Agreed - Collected" and "Not Fixed - Collected" merged into one,
**"Not Agreed/Fixed - Collected"** (`app/constants.py: STATUS_CHOICES`)
-- both meant "not repaired, phone collected anyway" once the
distinction was actually needed. "Not Agreed - In Shop" was renamed the
same way for consistency, to "Not Agreed/Fixed - In Shop". A migration
(`app/database.py: _migrate_merged_status`) normalises any ticket saved
under an old value, every time the app starts.

### Type-ahead suggestions from the shop's own history
`app/suggestions.py` + `/api/suggest/*` (`app/routes/suggest.py`) +
`app/static/suggest.js` (`attachSuggestions(inputEl, endpoint)`,
generic, attached independently per field): Home's Name, Phone, Model,
and "Other" fault description fields, plus Sale's Name and custom item
field, all suggest from what's genuinely been typed into this shop's own
data before -- never a fixed list, always a live query, so it scales
with real data automatically (proven live: created a ticket for a
brand-new name, it was suggestible immediately, no restart). Each field
suggests only its own kind of data (name suggestions never leak into the
phone box); "Other"-style fields exclude the fixed dropdown choices, so
they only ever suggest genuinely custom past entries.

### Real bugs found and fixed this round
- **Financials showing "Pending" when some money WAS known**:
  `compute_financials()` was discarding a valid partial total (e.g.
  "Diagnostic: pending, Screen: £33") just because *something* was still
  unpriced. Fixed to show what's known, with a separate
  `has_pending_faults` flag so the UI can still warn without hiding real
  money (`app/financials.py`).
- **Deleted items not disappearing from Search until a manual refresh**:
  browser back-forward-cache restoring a frozen, stale DOM. Fixed with
  the same `pageshow`/`event.persisted` pattern used for theme/accent
  above (`app/static/search.js`).
- **Home/Reprint card heights not matching**: `.box + .box { margin-top
  }`, written for stacked cards in normal flow, was also matching
  adjacent-sibling cards inside a CSS Grid row, silently offsetting card
  2 and 3 downward inside their own (equal-height) grid cell. Reset to
  `margin-top: 0` inside grid containers.
- **Some Tools icons rendering flat/colourless**: 3 of the 6 tile emoji
  (☁️ 🔗 🗑️) were falling back to a monochrome symbol font on this
  system while the other 3 rendered in colour -- a known cross-platform
  emoji-font inconsistency, not a CSS bug. Replaced those 3 with inline
  SVG icons (solid fills / theme-token strokes) so they render
  identically everywhere, never relying on an emoji font again.
- **Search's balance column reading as "£0.00 = worthless"**: it was
  showing the *balance owed*, and a fully-paid ticket correctly has a
  £0 balance -- just ambiguous at a glance. Now shows the job's total
  value once it's paid off, and only labels a figure "Balance" when
  something's genuinely still due.
- **Intake/collection receipts printable regardless of status**: both
  could be printed at any point in a ticket's life, even after the phone
  had already left the shop, or before it ever arrived back. The two
  receipts are now mutually exclusive windows around the actual
  collection moment (`app.constants.COLLECTED_STATUSES` = `Collected` /
  `Not Agreed/Fixed - Collected`): **intake** only while the ticket is
  NOT yet in one of those two statuses, **collection** only once it IS.
  Enforced at the source -- `POST /api/repairs/{ticket}/print/intake`
  and `.../print/collection` each reject with a 400 and a clear message
  outside their window -- so it holds everywhere a print can be
  triggered from, not just the obvious button. The ticket detail page's
  two Reprint buttons stay clickable either way (not greyed out) and
  show that same explanation as an on-screen warning if clicked outside
  the right window, so nothing fails silently. The Search/Reprint "last
  collection receipt" quick card's lookup (`/api/reprint/last-collection`)
  was also fixed to consider both collected statuses -- it previously
  only matched the literal `'Collected'` string, silently missing
  `Not Agreed/Fixed - Collected` tickets as candidates.
  - The warning banner (`showTransientError`, `app/static/detail.js`)
    stays up **11 seconds** by default -- long enough to actually read,
    not the original 4s. But `renderRepair()`/`renderSale()` (the
    re-render that runs after *every* successful write) clear it
    immediately on entry, so if the warning gets acted on right away --
    e.g. it says "not collected yet", so the status gets changed to
    Collected and that succeeds -- the banner disappears the moment that
    next action lands, instead of sitting there for the rest of the 11s
    regardless.

### Sheet-sync push delay: 15s -> 30s
Rapid status-button clicking (Ready/In Progress/Collected/... back and
forth) was pushing to the live Google Sheet too eagerly. The queue
already de-duped multiple saves of the same ticket before a drain (only
the latest state is kept, `app/sync_queue.py`), so this wasn't about
spamming the Sheet with every intermediate click -- it was that the
drain loop itself (`app/background_tasks.py:
_SYNC_DRAIN_INTERVAL_SECONDS`) could fire as soon as 15s after a change,
mid-fiddle. Bumped to 30s so there's more room to settle on a final
status before it goes out. Verified with 3 rapid status changes on one
ticket: still exactly one queued row, timestamped at the last change.

### "Paid" redefined + new "Unsettled" filter (repairs only)
Search's Paid filter (repairs) is now 4 states: Any / Paid / Not Paid /
Unsettled (`app/search.py: search_repairs`). Went through two rounds
before landing on the final rule -- the first version kept "Not Paid" as
a pure money question independent of settled, which meant a settled
ticket with a real leftover balance showed under *both* Paid and Not
Paid at once. Corrected after seeing it live: settling now moves a
ticket fully into Paid and out of Not Paid -- the two are mutually
exclusive, every ticket lands in exactly one of them.
- **Paid** matches if the ticket is genuinely fully paid by money **OR**
  it's marked "settled" -- ticking settled means the shop has decided
  not to chase the remaining balance, no matter the amount, so for
  filtering purposes it counts as done.
- **Not Paid** is now the exact complement of Paid (`NOT (paid_by_money
  OR settled)`) -- a settled ticket never appears here, even with a real
  balance still technically owing.
- **Unsettled** is a separate, third question: balance > £0 **and** not
  marked settled. A genuinely £0-balance ticket can never appear here.
  An unpaid ticket that's never been touched still shows under *both*
  Not Paid and Unsettled at once (verified this still holds after the
  fix above) -- those two remain independent questions; it's only
  Paid/Not Paid that became mutually exclusive.
- No cap or restriction on how much can be settled -- ticking it is a
  private "not chasing this" decision, not a payment.

This round also tried adding an equivalent "settled" flag to Sales
(button on the sale detail page + a Search filter) -- pulled back out
again since a sale is paid in full the moment it's created and the
concept didn't land cleanly; may come back in a different shape later.

### Edit forms redesigned -- they were never real `<form>` elements
The repair Edit form, sale Edit form, and Add Fault/Add Payment forms
were plain `<div>`s, not `<form>` elements -- so none of the app's real
input/label styling (`form label`/`form input` in style.css) ever
applied, and they rendered as cramped, unstyled 1990s-looking inputs.
Converted all four to real `<form>` elements (same field pairing as
Home's create-forms), with a `submit` listener that just calls
`preventDefault()` as a safety net (every Save button is `type="button"`
with its own click handler, so nothing should ever trigger a native
submit -- this just guards the edge case). Zero new CSS needed; it
already existed and just wasn't being reached.

### Per-fault price editing + a real math verification pass
Took a repair and a sale through every combination I could throw at
them (partial/full/over- payment, mixed priced/pending faults, every
status, settle, every edit field, invalid input) and checked the
numbers at each step against what they should be. Found and fixed four
real issues:
- **A fault added after the first could never be priced, ever.** Only
  the ticket-level Edit form's price field existed, and it only ever
  touched the *first* fault (`repairs.edit_repair`). Fixed with a new
  `POST /api/repairs/{ticket}/faults/{fault_id}/price`
  (`app.faults.set_fault_price`) and an inline price control on any
  fault row missing a price. This also now lets you *correct* an
  already-priced fault's amount (not just fill a blank one) -- same
  endpoint, no restriction on which state the fault is in.
- **Overpayment (nothing stops one -- no cap anywhere) displayed as
  `£-30.00`** instead of `-£30.00`. Fixed in `app.money.format_pence()`;
  confirmed the fix holds for every currency, not just GBP, including
  alpha-suffix ones (`-Rs 30.00`) and RTL ones (`-د.إ 30.00`).
- **A negative payment amount showed a generic "must be a valid number"**
  instead of the real reason. `app/routes/repairs.py`'s payment route now
  forwards `parse_pounds_to_pence`'s actual exception message.
- **Search's list view collapsed 3 different situations into one.**
  Any repair with `balance <= 0` just showed the total, whether it was
  actually finished, still had an unpriced fault (paid up to what's
  *known*, more could be owed), or was overpaid. `repairMoneyDisplay()`
  in search.js now shows `Balance £X` (money owed always wins),
  `£X · pending item`, `Overpaid £X`, or just `£X` for genuinely done --
  in that priority order, verified against all 7 combinations including
  the two rare double-cases (owed *and* pending; overpaid *and* pending).

**Fault deletion** (`DELETE /api/repairs/{ticket}/faults/{fault_id}`,
`app.faults.delete_fault`) -- revised after live testing surfaced the
real rule wanted: **any** fault (1st, 2nd, 3rd... priced or still
pending) can be removed at **any point before the ticket is collected**
(`COLLECTED_STATUSES`), and **never** once it has been -- past that
point the faults list is the settled record of what was actually done
and charged, not still-editable. Enforced both server-side
(`delete_fault` checks status, 400 if collected) and client-side
(`detail.js: wireFaultRemoveButton` checks the same list before even
trying, for an instant answer instead of a round trip that was always
going to fail). Still refuses to remove a ticket's last remaining fault,
regardless of status. Tested all combinations directly: In Progress +
priced fault (allowed), Collected + priced fault (blocked), the *other*
collected status `Not Agreed/Fixed - Collected` (also blocked, not just
the literal `'Collected'` string), not-collected + the first fault too
(allowed), and the last-fault guard (still blocked, any status).

Removing a fault only warns first if it actually carries money --
`price_pence > 0` shows a confirm dialog naming the fault and its
amount ("the total will drop by that amount"); a pending or £0 fault
deletes immediately with no dialog, since neither has ever affected the
total. This replaces the earlier, stricter design (price editing was
the only path once a fault had a real price) -- see the open issue
below, still unresolved, for the £0-vs-"never fixed" ambiguity this
doesn't solve on its own.

Also fixed a couple of smaller things found along the way:
- **Collection/intake receipts printable from any status.** Now gated
  both ways: intake only *before* `COLLECTED_STATUSES`, collection only
  *after*. Enforced server-side (`app/routes/printing.py`, 400 outside
  the right window) and client-side with an on-screen warning instead of
  a silently-disabled button, so nothing fails without explanation.
  Also fixed the Search "last collection receipt" card, which only ever
  matched the literal `'Collected'` string and silently missed
  `Not Agreed/Fixed - Collected` tickets.
- **The reason picker in Add Fault** (Customer agreed on price / Device
  cannot work / Other) never highlighted green when clicked -- the JS
  was correctly toggling a `.current` class, there just wasn't a
  matching CSS rule for it (`.status-row button.current` existed,
  `.reason-row button.current` didn't). Added it.
- **Warning banner tuned**: stays up 11s by default (was 4s, too quick
  to read), but clears immediately the moment the next action succeeds
  (`renderRepair()`/`renderSale()` hide it on entry) -- so it doesn't
  linger once you've actually acted on it.
- **Trimmed the "teacher voice" hint text app-wide** -- every `.hint`
  line in Tools and the detail page cut down to the essential point
  (e.g. "Applies immediately. This is a display preference for this
  browser only -- it doesn't change anything for anyone else..." ->
  "This browser only -- not shared, not backed up with shop data.").
  Also removed two leftover internal "Phase 4" tags from the Tools menu
  that were never meant to be user-facing.

### Open issue, not yet resolved: a £0 fault looks "fixed for free," not "declined"
Found while testing: if a fault gets priced (say Battery, £40 --
"customer agreed on price") and the customer later says don't bother,
the only correction available today is setting its price to £0 (can't
delete an already-priced fault -- see above). That's honest in the
*money* -- total/balance recalculate correctly either way, and if it had
already been paid for, the ticket correctly shows Overpaid so there's a
refund/credit trail. But on a printed receipt, `Battery: £0.00` reads as
"we fixed your battery for free," when what actually happened is "we
never touched it." Nothing today distinguishes "genuinely no charge"
(e.g. a free diagnostic that WAS done) from "declined, not attempted" --
both are just `price_pence = 0`.

Three ways to fix this, roughly in order of how "correct" vs. how much
work each is:
1. **A real third state per fault** -- not pending, not priced, but
   "declined" (e.g. a `declined_at` column). Never counts toward the
   total (like pending), but doesn't trip the "pending item" flag
   either (it's resolved, just resolved as "no"). Prints as
   `Battery: Not fixed` on receipts instead of a price line. Most
   correct, but touches the faults schema, financials, receipts, Search
   display, and the detail-page UI -- the biggest of the three.
2. **Print the fault's existing `reason` text next to a £0 price** --
   e.g. `Battery: £0.00 (declined)`. No schema change, reuses the
   `reason` field that's already captured per fault -- just needs
   `receipts.py` to include it. Weaker: still literally says £0.00, and
   depends on staff typing a clear reason at the time.
3. **Pure convention, no code at all** -- rename the fault's description
   itself when zeroing it out (e.g. "Battery (declined, not fixed)").
   Works today, zero risk, but entirely manual discipline, nothing
   enforces or reminds anyone to do it.

Leaning toward option 1 as the real fix, with option 2 as a fast
stopgap if the full version isn't worth building right away. Needs a
decision before touching code.

### Test data
`Building/dropfix_test.db` was wiped clean and rebuilt with a small,
deliberately realistic set: 10 repairs + 10 sales (11 sale rows -- one
story is specifically about the duplicate-sale confirmation flow, which
legitimately produces two rows), each one a distinct real-world shop
story rather than randomly generated filler -- see the full-shop-
simulation round below for exactly what each one covers. Counts will
drift as it gets used for real testing/deleting from here on, same as
before.

### Full shop-counter simulation -- 394 automated checks, 1 (non-)finding
Ran a complete simulated day at the counter: 10 repair tickets and 10
sales, each following a real customer story end to end (multi-fault,
partial payments across both methods, pending-then-priced faults,
declined items removed, overpayment, a settled write-off with a genuine
leftover balance, edited details, delete+restore, apostrophes and long
free text, a "Not Agreed/Fixed - Collected" walkout with a diagnostic
fee) -- then layered on error-path testing (blank/negative/malformed
input at every entry point, actions against nonexistent or soft-deleted
tickets), a live currency switch mid-session, the Sign/Text print-style
toggle, CSV export, and the Reprint quick cards.

Every financial result was cross-checked against raw SQL run directly
against the database -- not just "does the app agree with itself," but
"does the app agree with the actual rows." Receipt content was verified
from the exact same `build_intake_receipt`/`build_collection_receipt`
code a real print uses, not just guessed at: confirmed the passcode
appears on the intake receipt and is genuinely absent from the
collection receipt, a £0 (declined-and-zeroed or genuinely free) fault
prints plainly as `Battery: £0.00` rather than vanishing or misleadingly
saying "Pending", and an overpaid ticket's collection receipt reads
`Balance: -£10.00`, never a false `£0.00`.

**Result: 394 checks, 0 real problems.** The one flagged item was a
false positive in the test harness itself (a helper that always asserts
success got reused in a spot where the correct, intended behaviour was
rejection -- confirmed by hand, the rejection was exactly right). Not
tested (no hardware/credentials in this environment): a real QZ
Tray-connected printer, and an actual Google Sheets push -- the code
paths for both were exercised (PDF rendering in Test mode; the sync
queue correctly enqueuing and de-duping), just not against real
hardware or a real Google account.

### Two more bugs found live, right after the simulation
The 394-check round above was thorough but automated -- these two only
surfaced once a real person looked at real filtered results and noticed
something read wrong:
- **Search's Collected filter missed half of "collected."** Same class
  of bug as the earlier `/api/reprint/last-collection` fix -- comparing
  status against the single literal string `'Collected'` instead of the
  full `COLLECTED_STATUSES` set. A `Not Agreed/Fixed - Collected` ticket
  (phone already handed back, just never repaired) showed up under "Not
  Collected" -- the exact opposite of reality. `app/search.py` now uses
  `r.status IN (...)` / `NOT IN (...)` against the same status list
  already used for print-gating and fault deletion, so a ticket can
  never be "collected" for one purpose and "not collected" for another.
  Verified against all 10 tickets both directions, plus the 3
  genuinely-not-collected statuses, live.
- **Sales column ignored repair-only filters instead of admitting they
  don't apply.** The "not applicable to sales" empty state only covered
  two of the Paid dropdown's four values (Not Paid / Unsettled) --
  Collected, Ready, and Paid=Paid all still silently showed every sale
  unfiltered, which reads as a false match next to a filter that has no
  meaning for a sale at all. `search.js` now shows the same "Not
  applicable" message whenever *any* of Collected/Ready/Paid is set to
  anything but Any, not just those two specific values.

### Filter semantics, current final state (repairs)
Superseded several times -- this version worked out scenario-by-
scenario against realistic repair situations (2026-08-18/19), not just
reasoned about in the abstract, and is now **implemented and live**
(`app.search.search_repairs`, `app.constants.READY_STATUSES`). See
"Search filter semantics: full scenario review" further down for how it
got here and how it was tested -- settled and not up for revisiting
without a new scenario that actually breaks it:

- **Collected** alone = status is `Collected` or `Not Agreed/Fixed -
  Collected` -- the phone has actually left the shop, whichever way the
  repair went.
- **Not Collected** alone = anything still physically in the shop:
  `In Progress`, `Ready`, or `Not Agreed/Fixed - In Shop`.
- **Ready** alone = "ready for the customer to come get it, fixed or
  not" -- status `Ready` OR `Not Agreed/Fixed - In Shop`. Both are just
  sitting in the shop waiting on the customer, regardless of outcome.
- **Not Ready** alone = `In Progress` only -- still actually being
  worked on. (`Not Agreed/Fixed - In Shop` used to live here; moved to
  Ready once "waiting on the customer" turned out to be the real
  question, not "did we fix it".)
- **Collected + Ready** = `Collected` only -- narrows down to just the
  properly-fixed-and-picked-up half of Collected.
- **Collected + Not Ready** = `Not Agreed/Fixed - Collected` only -- the
  declined-and-picked-up half. Together with the row above, these two
  cleanly split the whole Collected list in half, nothing left over and
  nothing counted twice.
- **Ready + Not Collected** = same as Ready alone (Ready is already a
  subset of Not Collected, so this doesn't narrow further).
- **Not Ready + Not Collected** = same as Not Ready alone, for the same
  reason.
- **Paid** = the currently-known total is fully covered by money paid,
  OR the ticket's marked Settled -- true regardless of Collected/Ready,
  before or after the phone leaves the shop.
- **Not Paid** = the exact complement of Paid.
- **Unsettled** = real balance still owed (> £0) AND not marked Settled
  -- independent of Paid/Not Paid; can be true alongside Not Paid on the
  same ticket (a genuinely untouched unpaid balance), never alongside
  Paid.
- The text search box and date range are two more conditions in the
  exact same AND chain as Collected/Ready/Paid -- never a separate,
  independent search. Typing a name/ticket/model/passcode while filters
  are active searches only within whatever those filters already
  narrowed to, not the whole table with the filters ignored. Already how
  `app.search.search_repairs` builds its SQL (`where` list joined with
  `AND`) -- confirmed correct, not a change.
- Paid/Not Paid/Unsettled never change meaning based on what Collected/
  Ready are set to, **including** the declined statuses -- a declined-
  in-shop or declined-collected ticket follows the exact same
  Paid/Not Paid/Unsettled rule as any other ticket. Whether the repair
  was accepted or rejected has no bearing on whether its money is paid;
  no exclusion, no special case. Confirmed against every combination
  above (In Progress, the Ready bucket including its declined member,
  both halves of Collected).
- Collected and Ready never apply to Sales (a sale has no status to be
  "collected" or "ready" for -- shows an explanatory empty state instead
  of silently ignoring them). Paid is the one exception: a sale IS
  always paid in full the moment it's created, so **Paid** correctly
  shows sales too (trivially true for every one of them) -- only **Not
  Paid** and **Unsettled** exclude Sales, since there's no honest
  meaning for an "unpaid sale."

### Refunds -- both repairs and sales
There was previously no way to record money handed back at all --
payments could only ever be positive, so an overpaid ticket (e.g. a
priced fault removed after the customer already paid for it) stayed
"Overpaid £X" forever with no way to show it was ever resolved.

- **Repairs** (`app.payments.add_refund`, `POST
  /api/repairs/{ticket}/refunds`): a refund is stored as a **negative
  row in the exact same `payments` table** a normal payment uses, not a
  separate ledger or a cosmetic flag. `SUM(amount_pence)` -- what
  total/paid/balance are already derived from (`app.financials`) --
  automatically nets it out, so correcting the real balance needed zero
  changes to the core money calculation, nothing new to ever drift from
  it. Distinguished from a normal payment purely by sign; presenters and
  receipts key off that (`is_refund` / `amount_pence < 0`) to label it
  "Refund (Cash)" instead of a plain, confusingly-negative payment line.
  One invariant enforced: net paid can never go negative -- can't hand
  back more than has genuinely been received in total. No cap beyond
  that -- same permissive philosophy as payments and settling elsewhere,
  a refund can push a ticket from overpaid back into genuinely owing
  money again if that's really what happened.
- **Sales** (`app.sales.add_sale_refund`, `POST
  /api/sales/{id}/refunds`): sales have no payments ledger to begin
  with (one price, paid once), so a refund accumulates into a new
  `refunded_pence` running-total column instead of its own row. Can
  never push `refunded_pence` above `price_pence` -- can't refund more
  than the sale was ever worth. `present_sale()` now also exposes
  `net_price_pence`/`net_price_display` (price minus refunded) alongside
  the original `price_pence`, which never changes -- same "never
  silently rewrite what was actually charged" principle as a repair's
  Total.
- Both UIs (detail.html/detail.js) add a "Refund" action next to the
  existing payment controls, with its own amount input -- confirmed the
  amount is genuinely typed in, not inferred or defaulted.
- Verified against the live 10-repair/10-sale dataset, cross-checked
  against raw SQL every time (not just re-trusting the API's own
  arithmetic): exact-boundary refunds (refunding precisely what's left,
  down to the penny), a refund on a ticket that was never overpaid at
  all (just handing back part of a genuine payment), refunding more
  than was ever paid/sold for (correctly rejected both for repairs and
  sales), zero/negative amounts, an invalid payment method, and the
  receipt content itself (`Refund (Card): -£10.00` on a repair's
  collection receipt; `Refunded: £X` / `Net paid: £Y` on a sale's).
- **One asymmetry worth knowing about**: a repair's refund can be
  corrected after the fact (it's just another row -- add a compensating
  payment if one was entered wrong). A sale's can't -- since it's a
  running total, not a ledger, there's no way to walk back a mistaken
  sale refund short of a direct database edit. Not fixed yet; flagging
  it rather than silently leaving it undiscovered.
- The refund amount box now **pre-fills a sensible starting suggestion**
  instead of opening blank: a repair's box fills with the current
  overpaid amount when there is one (nothing when balance isn't
  negative -- no obvious number to suggest for a plain deposit
  cancellation), a sale's box fills with everything still refundable
  (`net_price_pence`). Still just a starting point, not locked -- the
  till operator can always type something else for a partial refund.

### Suggestions extended from Home to the detail page
Previously only 6 fields on Home had type-ahead suggestions (Name,
Phone, Model, Other-fault-description, Sale Name, Sale-Other-item). The
exact same underlying data gets typed again later in a ticket's life --
correcting a detail via Edit, or adding a second fault -- so the same
suggestion engine (`app/suggestions.py`, `app/static/suggest.js`) now
also covers:
- Repair Edit -> Name / Phone / Model (reuses `/api/suggest/names` /
  `/phones` / `/models` unchanged -- same field, different screen)
- Sale Edit -> Name / Custom item (reuses `/api/suggest/names` /
  `/sale-custom-items` unchanged)
- Add Fault -> Description (reuses `/api/suggest/fault-descriptions`
  unchanged -- the free-text description box when adding a fault to an
  existing ticket draws on the exact same `faults.description` data
  Home's "Other fault" box already suggests from)
- Add Fault -> "Other reason" custom text (**new**: `suggest_fault_reasons()`
  / `GET /api/suggest/fault-reasons`, a straight copy of
  `suggest_fault_descriptions`'s pattern aimed at `faults.reason`
  instead, excluding the fixed `FAULT_REASON_CHOICES` the same way)

Every suggestion source queries exactly one column (or the same column
across repairs+sales, for name) -- never a shared or fuzzy search across
everything, so a name box can never surface a phone number and so on.
Confirmed against the live dataset: names/phones/models/custom items all
return real matching past entries scoped to their own field, and the
fixed dropdown values (e.g. "Screen", "Customer agreed on price") are
correctly excluded from the two "Other"-text suggestion sources so they
only ever suggest genuinely custom past entries.

Deliberately left out, per an earlier discussion of the tradeoffs:
repair Note (free-flowing prose, not really a "repeat small set of
values" field), Passcode (suggesting a past PIN makes no sense), Serial/
IMEI (the whole point is uniqueness), every money field, and all the
singleton config fields (Shop Details, Google Sheet/Drive IDs) where
there's only ever one current value, never a growing history to draw
suggestions from.

### Dead code found and removed
A repo-wide sweep (every CSS class cross-checked against real usage,
every Python and JS function checked for at least one real call site
beyond its own definition) found exactly two genuine hits:
- **Three unused passcode CSS variants** (`.passcode-chip`,
  `.passcode-underline` + its icon, `.passcode-green`) -- kept around
  earlier as "easy fallback" alternatives to the one actually in use
  (`.passcode-match-name`), but nothing ever referenced them. Removed.
- **`refreshRepair()`** in `detail.js` -- a leftover helper that did the
  same `currentRepair = await api.get(...); renderRepair();` pattern
  every actual write handler now does inline, but nothing called this
  particular one. Removed.

Everything else the sweep initially flagged was a false positive with a
clear reason: the 5 `status-*` CSS classes are built dynamically
(`"status-" + slug`, not literal text a grep can match), and the ~50
`api_*` Python functions "only used once" are FastAPI route handlers --
invoked by the framework via `@router.get/post(...)`, never called
directly in Python source, so a naive call-count check will always flag
every single route in the app. Confirmed each of those really is wired
to a live endpoint before ruling them out, rather than trusting the
naive count.

### Add Payment redesigned: method-first, auto-prefilled, hands-free split
The old form was a free amount box (tap the Balance figure above to
fill it in -- an extra, easy-to-miss step) plus a Cash/Card toggle. Two
problems: nothing filled in automatically unless you knew to tap the
right thing first, and there was no way to record a genuine Cash+Card
split without two separate trips through the form.

Redesigned around a **method-first dropdown** (Card / Cash / Cash +
Card, defaulting to Card since it's most payments -- no "Choose..."
placeholder, the single amount box is already showing and prefilled the
instant the form opens, no dropdown interaction required for the most
common case at all) instead of a toggle pair, because picking "Cash +
Card" needs to change the form's actual shape -- one amount box vs. two
-- which a
mode-selector expresses more naturally than a third equal-looking pill
would:
- **Card or Cash**: one amount box appears, already pre-filled with the
  current balance owed (nothing if balance isn't positive -- no
  sensible number to suggest for a £0 or overpaid ticket). Still a
  normal editable field -- backspace and retype if the real amount is
  different. Single-method payment is now: open, pick a method, tap
  Save -- zero typing in the common case.
- **Cash + Card**: two boxes side by side, **deliberately never
  auto-filled**. Auto-computing the second amount from the first was
  the obvious "smart" move and deliberately rejected -- it risks
  silently recording a number nobody actually typed or checked, in a
  permanent financial ledger. Instead each box shows a live, purely
  informational hint next to its label ("Cash (remaining: £20.00)"),
  recalculated on every keystroke in either box -- so there's no mental
  arithmetic, but every number that actually lands in the payments
  table was consciously typed by a person.
- New atomic endpoint (`POST /api/repairs/{ticket}/payments/split`,
  `app.payments.add_split_payment`) records both rows in one
  transaction -- either both land or neither does, so a split can never
  end up half-recorded from a dropped connection between two separate
  calls. A blank side is simply skipped, not an error, so choosing
  "Cash + Card" but only filling one in still works exactly like a
  plain single-method payment.
- Found and fixed a real latent bug while building the hint text:
  `formatPenceLike()` (`util.js`) had the same `£-5.00` sign-ordering
  issue `format_pence()` was fixed for earlier, just never triggered
  before now because its only prior caller (`renderPriceLine`) never
  passed it a negative sample. The split hints do (an overpaid ticket's
  `balance_display` can be negative), so it's fixed to strip a leading
  `-` before extracting the symbol and apply the sign independently,
  matching the backend's rule exactly.
- Verified against the live server: an exact split (40 cash + 20 card
  on a £60 balance) lands as two correctly-labelled rows and zeroes the
  balance; a one-sided split records a single row; both fields blank,
  a negative amount, and a nonexistent ticket are all rejected with a
  400; the hint math is correct including the negative-remaining case.
- Sales were deliberately left untouched -- a sale has no payments
  ledger at all (one price, one method, recorded once), so there's
  nothing to "add a payment" to. Giving sales the same capability would
  mean building them their own payments ledger from scratch, a much
  bigger change than what this was.
- The old "+ Add payment" button/position stays exactly where it is at
  the bottom of the Payments section for now, per instruction -- only
  the form's own behaviour changed. This interaction pattern (dropdown-
  driven mode + live hints, no auto-fill on ambiguous splits) is
  intended to be reused elsewhere later.

### Search filter audit (Collected/Ready/Paid interaction)

Asked to check whether the three Search status filters were genuinely
combining with AND rather than fighting each other, after a screenshot
showed Collected="Collected" + Ready="Not Ready" returning literally
every ticket. Two separate things were true at once here, both
confirmed rather than assumed:

- **The AND-combination logic itself is correct.** Verified by creating
  one throwaway ticket per status (In Progress, Ready, Collected, Not
  Agreed-In Shop, Not Agreed-Collected) and hitting `/api/search/repairs`
  with every combination -- each ticket appeared/disappeared exactly as
  its status dictated, including 3-way combos with `paid`.
- **`status` is a single field, not independent flags.** "Ready" means
  "current status is literally `Ready`" -- a snapshot, not "was this
  ever fixed". Once a ticket moves to `Collected`, it has left the
  `Ready` bucket for good (a row can only hold one status value at a
  time), so **every** Collected ticket is automatically also "Not
  Ready" -- that combination isn't narrower than Collected alone, it's
  redundant with it. The only combination of these two that's a true
  contradiction (and correctly always returns empty) is Collected=yes
  AND Ready=yes. On top of that, this shop's live dataset has every one
  of its 10 tickets already fully Collected and paid -- so many filter
  combinations legitimately return "all 10" or "none", which reads as
  "the filters aren't doing anything" but is mathematically exact given
  the data.
- Found one real, separate bug while tracing this: in `search.js`, both
  `loadRepairsPage()` and `loadSalesPage()` check `if (state.loading)
  return;` **before** the block that resets state for a new filter
  selection -- so if a second filter change fires while the first
  request is still in flight, it gets silently dropped (no reset, no
  new request sent). The text search box is debounced against this; the
  three dropdowns aren't. Reported, **not yet fixed** -- **scheduled to
  be resolved 2026-08-18.**

### Add Payment near Status: tried, reverted, replaced by a confirm prompt

First attempt was a second "+ Add payment" button + form duplicated
directly under the Status row. Explicitly reverted per instruction --
removed the extra DOM block from `detail.html` and undid the
`wireAddPaymentWidget(suffix)` refactor in `detail.js` back to its
original single inline form, so there is exactly one Add Payment
widget again, at the bottom, unchanged.

Replaced with a different mechanism: clicking **Collected** or **Not
Agreed/Fixed - Collected** in the Status row (any change into either of
those two, from a different status) now shows a confirm popup --
"Add a payment now? So it's ready before you print the collection
receipt." -- via the app's existing `showModal()` component (same one
used for the Delete-ticket confirmation). Either answer applies the
status change:
- **Yes**: status changes, then the page scrolls to the existing
  bottom Add Payment button and clicks it programmatically -- opens the
  form already prefilled (same Card default, same owed-amount prefill
  as always), so "yes" really does go "straight to" adding the payment
  with no extra hunting.
- **No**: status changes, nothing else happens.

New `applyStatus(status, openPayment)` function factors out the actual
status POST + re-render (previously inline in the status button's click
handler) so both the plain-status and confirm-then-status paths share
one code path. Verified: the status endpoint itself is unchanged and
still confirmed working via direct API call; the modal was rendered
through the app's real `showModal()` with the exact title/message/
buttons used in code, screenshotted, and reads cleanly.

This is a first cut -- flagged by the user as something that may get
small refinements later (wording, maybe which statuses trigger it),
not necessarily the final version.

**Deferred idea, not built:** gate printing the collection receipt
behind at least one payment having been made. Explicitly on hold until
it's clear how that rule should treat `Not Agreed/Fixed - Collected`
tickets (a phone handed back with the repair declined may legitimately
have nothing paid at all) -- needs that worked out before it can be
built without blocking a legitimate zero-payment collection.

### Search filter semantics: full scenario review (2026-08-18)

The Collected/Ready/Paid confusion from the audit above turned out to
need a proper scenario-by-scenario walkthrough with the user, not just
an explanation of the current code -- went through every realistic
repair situation one at a time, out loud, before writing any code.
Full agreed result is folded into the "Filter semantics, current final
state" table above.

The two open questions from that walkthrough are now resolved
(2026-08-19): **Paid means paid, full stop -- it has nothing to do with
whether the repair was accepted or declined.** A declined-in-shop
ticket with its diagnostic fee fully paid shows under Ready + Paid same
as any other paid ticket; an unpaid one shows under Ready + Not Paid /
Ready + Unsettled as a reminder, same as any other unpaid ticket. No
exclusion, no special case for declined tickets anywhere in the money
filters -- this is actually simpler than the exclusion idea that was on
the table, and consistent with how Paid/Not Paid/Unsettled already work
everywhere else.

The whole filter rework is now fully locked in with nothing left open,
and **implemented** (2026-08-19): `app.constants.READY_STATUSES` added
alongside the existing `COLLECTED_STATUSES`, and
`app.search.search_repairs`'s old separate Collected/Ready WHERE
clauses replaced with one combined lookup that maps each of the 9
(collected, ready) combinations to its exact status set -- Paid/Not
Paid/Unsettled untouched, since they were already independent of status.

Verified live against disposable test tickets (one per status, cleaned
up after):
- All 9 Collected x Ready combinations matched their exact expected
  status set, including both special-cased cells (Collected+Ready ->
  Collected only, Collected+Not Ready -> Not Agreed/Fixed - Collected
  only).
- Paid/Not Paid/Unsettled layered correctly on top of every bucket,
  including the exact declined-in-shop-with-a-paid-fee case that
  started the whole discussion (showed up under Ready + Paid, alongside
  a normal fixed-and-paid-ahead ticket).
- A ticket moving from unpaid to Settled correctly jumped from Not
  Paid/Unsettled into Paid.
- Text search combined correctly with an active filter (narrowed within
  it, including narrowing to zero when the two disagreed) -- confirms
  the AND-chain note above wasn't just already-true in theory, it holds
  with the new status logic too.
- Cross-checked one combination directly against raw SQL as ground
  truth (Collected + Ready) -- matched the API exactly.

User then manually clicked through all 11 labelled test tickets in the
real UI (2026-08-19) -- confirmed everything matched, deleted the test
tickets themselves afterward. Flagged one lingering feeling that
something's still off specifically around **Not Ready**, without being
able to pin down exactly what at the time. Three candidate explanations
were written up; revisited 2026-08-20 and resolved -- **it's option 3
from that list: the behavior is correct, nothing to change.** The
actual friction was just unfamiliarity with Ready/Not Ready meaning two
different things depending on whether Collected is also selected, not a
bug. Mental model to hold onto: **before the phone leaves, Ready/Not
Ready answers "where is it" (still being worked on vs waiting for the
customer); once Collected is picked, it flips to answer "did we
actually fix it" instead.** Same two words, different question, exactly
at the moment of collection -- which tracks, since "where is it" stops
being a real question the second it's picked up.

The whole filter rework is now fully closed, no open items left.

### Tools > Shop Website (2026-08-20)

New Tools tile. Originally positioned between Appearance and Backup &
Restore, then moved (same day, tile only -- route/page untouched) to sit
between Shop Details and Printer instead, per a follow-up request since
it made more sense there. Links to `/tools/website` (`tools-website.html`, route added in
`app/routes/pages.py`), which just embeds the user's own public Google
Form (`?embedded=true`, Google's own iframe-embed convention) in a
`.form-embed` box (new class in `style.css`) -- the same form that
already feeds a Google Sheet, which the user's separately-hosted
one-page shop site (GitHub Pages, own project, not part of DropFix)
already reads from on its own. DropFix does nothing here but load the
form; no API calls, no credentials, no new backend code -- confirmed
nothing else needed since the user already has the Sheet-to-site read
side working correctly on their end.

Verified live: the route serves correctly, and a full-page screenshot
confirms the actual Google Form (Company Name / WhatsApp Number / Email
/ Google Maps review link, exactly as the user built it) renders inside
the iframe, not just a blank box.

### Discussion, not built yet: gating Collected on payment (2026-08-20)

Started from the user noticing that clicking "Yes" on the "Add a
payment now?" popup (see "Add Payment near Status" above) changes the
status to Collected **immediately** -- it only opens the payment form
as a convenience afterward, it never actually waits for a payment to be
saved. That's exactly how it was built, not a bug, but the user wants
it to genuinely gate on payment instead. Talked through several angles
before pausing to continue later. Nothing below is built -- pure
discussion, to be picked up again on request.

**Two real, separate gaps found while discussing this, worth fixing
regardless of how the gate design lands:**
- A ticket with a still-**pending** fault (no price set) can be marked
  Collected and have its collection receipt printed today -- nothing
  currently checks for pending faults, only that the status is right
  (`app/routes/printing.py`). The receipt would print `Total: Pending`
  / `Balance: Pending`, which is clearly wrong for a receipt meant to
  represent a finished, paid job.
- Confirmed `build_collection_receipt` (`app/receipts.py`) never fakes
  a £0 balance -- it always prints the real balance, "settled" or not.
  So skipping payment on a ticket that still has a real priced,
  unpaid balance will print that balance plainly on the receipt. This
  turned out to be a feature, not a problem, once traced through --
  see the agreed design below.

**Clarified: a fault priced at £0 for genuine free/goodwill extra work
(customer's original quote covered it, shop just didn't charge more)
is already completely correct as-is** -- not the same thing as the
already-documented open issue further up ("a £0 fault looks 'fixed for
free,' not 'declined'"), which is specifically about a fault that was
priced then dropped to £0 because it was never actually done. Worth
keeping those two £0 cases distinct going forward -- one is honest, one
is misleading, same number on the receipt either way.

**Design discussed so far (Not Agreed/Fixed - Collected side is
settled; Collected side still open, one point unconfirmed):**
- **Not Agreed/Fixed - Collected**: gate on **balance = £0**, not "any
  payment." If balance is already £0 when this status is clicked, go
  straight through, no popup at all. If there's a real balance (e.g. a
  fault was priced and agreed, then the customer backed out before
  paying), pop up first: zero it out or collect it before this can go
  through. Confirmed by the user with a concrete scenario (£70 screen
  agreed, customer later declined, balance still sitting there).
  Zeroing out that balance to satisfy this gate is the same action that
  triggers the £0-fault-labelling open issue above -- the two are
  connected and probably want fixing in the same pass.
- **Collected**: Claude's suggestion, **not yet confirmed** by the
  user -- same £0-balance bar, but for an independent reason specific
  to this status (Collected is the shop's actual revenue-completion
  moment; a single token payment wouldn't protect against the real risk
  of a mostly-unpaid phone walking out the door the way a fully-cleared
  balance would). The user's original instinct was "at least one
  payment, any amount" -- that's still on the table, not ruled out.
- **"No" on either status**: stays exactly as it works today -- skips
  the gate entirely, sets the status immediately, no balance check.
  This is the deliberate override for legitimate no-payment-needed
  cases (warranty job, trusted regular, pay-later arrangement). Confirmed
  safe because the receipt never hides a real balance regardless (see
  above) -- clicking No on an unpaid job prints an honestly unpaid
  receipt, not a falsely-clean one.
- **Pending faults**: likely needs its own block alongside whatever the
  payment gate ends up being, on both statuses -- not yet scoped out in
  detail.

**Still open when this was paused:** whether Collected's bar is "£0
balance" (Claude's suggestion) or "at least one payment, any amount"
(the user's original idea) -- and how the pending-fault block should
actually work (block the status change itself, or just block printing,
same question raised earlier for the payment gate in general).

### Planned for the packaging phase (2026-09-09), not built yet

Two things the user wants once this stops being a raw dev-mode Python
project and becomes real packaged software:

1. **Start with Windows** -- a toggle to auto-launch on login.
2. **Run in the background, used through a normal Chrome tab** -- this
   part isn't new work, it's already how DropFix works today (FastAPI
   server + browser UI); packaging just needs to preserve that, not
   replace it with something else (e.g. not a native GUI window).

Confirmed feasible and discussed at a high level, nothing built:
- Bundle the app into a real `.exe` (PyInstaller or similar) instead of
  "activate venv, run a uvicorn command" -- adds meaningful size (tens
  of MB, since Python itself gets bundled in), otherwise straightforward.
- Run windowless, with a small **system tray icon** (start/stop/open in
  browser/quit) as the only visible control surface -- same pattern as
  Docker Desktop, Plex, etc. Needs a small tray library (e.g. `pystray`)
  added to the build.
- "Start with Windows" becomes a registry Run-key entry or Startup-folder
  shortcut once it's a real `.exe`, toggleable from the tray icon or a
  settings screen.
- Worth deciding later, not now: auto-open a browser tab every time it
  starts, vs. stay silent and let the tray icon's "Open" action be how
  it's reached.
- Same firewall risk already hit once running the raw dev server over
  WiFi (an existing Windows Firewall allow-rule for Python pointed at a
  different Python install than this project's venv, so it didn't
  actually cover this app -- adding a rule needed admin rights this
  session didn't have) -- a freshly packaged, unsigned `.exe` will
  likely trigger the same kind of first-run Windows Firewall prompt the
  first time it listens on a port.

This intentionally sits on hold until the packaging phase actually
starts -- do not build any of it before then without being asked.

**Confirmed (2026-09-09):** the tray icon's menu should explicitly
include an **"Open in browser"** action -- the deliberate way to reach
the UI while the server runs unattended in the background, not an
afterthought. Still on hold with everything else above.

**Update workflow, discussed 2026-09-09 -- also a decision to make when
packaging actually starts, not decided yet:** day-to-day changes stay
exactly as they are now -- live dev-mode editing + WiFi testing, no
packaging involved. Packaging is only for turning a tested state into
something that runs unattended without a terminal open, done
occasionally, not per change. Real choice worth deciding deliberately
when the time comes: PyInstaller can build a single `.exe`
(simplest to install, but any change means rebuilding and replacing the
whole thing) or a folder containing the `.exe` plus its files
separately (slightly less tidy, but since most of DropFix's changes so
far have been the HTML/CSS/JS frontend rather than the Python backend,
a folder build likely lets a pure frontend fix be swapped in by
replacing just those files, no rebuild needed). Leaning toward the
folder approach given that history, not yet committed to it. Also worth
expecting going in: Windows Defender/antivirus commonly flags a freshly
built, unsigned PyInstaller `.exe` as suspicious on first run -- not a
sign anything's actually wrong, just a real practical step to work
through (an exclusion, or eventually code-signing) when it happens.

### Shop Website form link is now an editable setting, not hardcoded

The Google Form embedded by Tools > Shop Website was hardcoded directly
into `tools-website.html`'s iframe `src` when that page was first
built. Moved to a real setting: new `website_form_url` column on
`shop_settings` (migration in `app/database.py`, defaulting existing
rows to the form already in use, so nothing broke on upgrade), wired
through `update_shop_settings`/`get_shop_settings`
(`app/shop_settings.py`) and the `/api/tools/shop-settings` route same
as every other shop detail. Editable from **Tools > Shop Details** --
the existing form there maps any input by `name` to a settings field
automatically, so this only needed one new `<input
name="website_form_url">`, no JS changes on that page.

Tools > Shop Website itself now fetches this at load time
(`tools-website.js`, new file) and builds the iframe's `src` from it,
appending Google's `embedded=true` convention via the URL API rather
than string concatenation -- handles a saved link that already carries
its own query params (e.g. a plain "share" link with `?usp=sharing`)
without producing a broken double-`?` URL. Blank is a valid, supported
state (not yet configured) -- shows a plain message linking to Shop
Details instead of an empty iframe.

Verified live: migration correctly defaulted the existing shop's row to
the form already in use; a save round-trip through the real API
persisted a new value and a blank value correctly; confirmed the
`embedded=true`-merging logic against a URL that already had a query
param (`?usp=sharing&embedded=true`, not broken); confirmed the exact
constructed embed URL returns 200 from Google directly; confirmed via
the rendered DOM (not just a screenshot -- cross-origin Google Forms
content was inconsistent to actually capture in a headless screenshot
once loading depends on an API fetch completing first, a timing
artifact of the test method, not the feature) that the iframe's `src`
and visibility were set correctly after a real page load.

### Confirmed: printing works without the physical printer connected (2026-09-09)

User asked whether printing could be checked without the shop's HOP-E58
(58mm, 130mm/s, ESC/POS) actually connected. Yes -- this is exactly what
Test mode is for. Proved it live rather than just asserting it: created
a throwaway ticket, hit the real intake-print endpoint, and it returned
a PDF link instead of touching QZ Tray or a printer at all -- every
print button (repair, sale, voucher, reprint) goes through this same
`deliverReceipt()` path (`app/static/printing.js`), so this isn't
specific to one receipt type. Downloaded and read the actual PDF back
-- genuine, correctly formatted receipt content, not a stub. HOP-E58's
58mm/ESC/POS spec is a good match for what this app already targets;
actually printing to it needed QZ Tray running, Live mode, and the
printer picked once in Tools > Printer -- the one part that couldn't be
verified without the physical device present.

### WiFi access re-confirmed, firewall rule finally added (2026-09-09)

Same "reachable from another device on the same WiFi" need as earlier
sessions, this time specifically to test from the actual shop computer
(the one with the printer attached) rather than this dev machine.
Re-verified the server binds correctly and responds on its LAN IP. The
shop computer still couldn't reach it -- same root cause flagged
earlier and never actually fixed: no firewall rule exists for this
app's venv `python.exe` specifically (the one pre-existing "Python" rule
points at a different Python install entirely). This time the user ran,
successfully, as Administrator:
```powershell
New-NetFirewallRule -DisplayName "DropFix (port 8000)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```
Confirmed present and correctly scoped (inbound, TCP/8000, Allow, any
profile) from this session too. This rule now exists on this machine
going forward -- if WiFi access ever breaks again, check whether this
specific rule is still there before assuming it's a new problem.

### Bug found and fixed: Live mode's QZ Tray check could hang the page (2026-09-09)

User switched to Live mode to test the shop's HOP-E58 printer and
reported the page "refreshing and never loading" -- turned out to not
be a reload loop at all (checked, none exist anywhere in the frontend).
Real cause: `checkQzTrayIfLive()` (`app/static/printing.js`) auto-tries
connecting to QZ Tray on every page load, but only in Live mode -- Test
mode skips it entirely, which is exactly why this never showed up
before switching. It's meant to be a non-blocking background check (a
banner shows if it fails), but `qz.websocket.connect()` can retry
internally for a long time before finally giving up when QZ Tray isn't
actually reachable from that device -- which is presumably the case on
whichever device this was seen on, since picking a printer in Tools was
still the very next pending step (see
[[dropfix-live-printer-test]]/[[dropfix-app-overview]]).

Fixed with a `withTimeout()` wrapper -- the auto-check now gives up
after 4 seconds and shows the "Printer service not running" banner
promptly instead of waiting out however long QZ Tray's own retry logic
takes. Scoped to the background check only, not the actual print-time
`connectQz()` call (an active print attempt should still wait properly
for a real, possibly-slower connection rather than fail early).

Verified: the timeout logic itself correctly gives up on a
deliberately-never-resolving promise after the set duration (isolated
Node test); the normal working case (QZ Tray genuinely running, this
machine) still connects cleanly well inside the 4s window with no
regression -- page loads in under a second, banner correctly does not
appear.

### QZ Tray signed connections -- the "Untrusted website" popup wasn't sticking (2026-09-09)

Live-mode testing surfaced a second QZ Tray issue: its own "Action
Required -- Untrusted website" trust prompt kept reappearing every
session even with "Remember this decision" checked. Root cause: DropFix
was connecting to QZ Tray completely anonymously (no certificate/signing
ever configured), and an anonymous connection gives QZ Tray no stable
identity to actually remember between sessions.

User obtained a certificate + private key pair (QZ Industries' standard
demo-cert format) and asked for this to be wired up properly. Built:

- `app/qz_signing.py` -- reads the two credential files and signs a
  given message (RSA, PKCS1v15 padding, SHA-512) using the `cryptography`
  library (added as a direct dependency to `requirements.txt` -- it was
  already present transitively via the Google libraries, now used
  directly).
- `app/routes/qz.py` -- `GET /api/qz/certificate` (returns the public
  certificate) and `POST /api/qz/sign` (signs whatever string QZ Tray
  asks to have signed). Neither route touches a database connection.
  The private key is read fresh per signing call, never cached in
  memory or sent to the browser -- only the resulting signature is.
- `app/config.py` -- `get_qz_certificate_path()`/`get_qz_private_key_path()`,
  same relative-path-beside-the-app pattern as the existing Google
  service-account key.
- `app/static/printing.js` -- new `configureQzSecurity()`, called once
  before the first `qz.websocket.connect()`: sets the signature
  algorithm to SHA512 (must match `qz_signing.SIGNATURE_HASH` exactly)
  and wires `qz.security.setCertificatePromise`/`setSignaturePromise` to
  the two new routes.

Both credential files were originally downloaded to the wrong machine
and handed over as local files -- moved into `Building/` itself
(`dropfix_qz_certificate.txt`, `dropfix_qz_private_key.pem`, alongside
`dropfix_google_key.json`) rather than left in the parent folder, so
they travel with the app the same way everything else here does.
**Nothing needs manually copying to the shop computer for this to
work** -- signing happens entirely server-side; the shop computer's
browser only ever talks to `/api/qz/certificate` and `/api/qz/sign`
over the network, the same way it reaches every other route. One
expected one-time step: QZ Tray on the shop computer will very likely
show its trust prompt once more (the identity it sees changes from
anonymous to a real certificate), but should then actually remember it
permanently, which was the whole point.

Verified: `qz_signing_configured()`/`get_certificate_text()`/
`sign_message()` tested directly against the real files; the produced
signature independently verified as cryptographically valid against the
certificate's own public key (and a tampered message correctly fails
verification, confirming the check itself is meaningful, not just
"produces output"); both new routes tested live over real HTTP and
return correctly; confirmed the updated `printing.js` is being served.
Not yet verified: the actual browser-side QZ Tray handshake on the shop
computer, since that needs someone physically there to click through
it.

### Bug found and fixed: stale QZ Tray connection could be silently reused (2026-09-09)

Surfaced by a screenshot of QZ Tray's own "Connection Idle Timeout"
notification appearing repeatedly on the shop computer. That
notification itself is normal QZ Tray behaviour (it closes idle
connections on its own, and DropFix opens a fresh one on every single
page load -- not one persisting connection across the whole app despite
this file's own top-of-file comment claiming otherwise, which was only
ever true within a single page's lifetime) -- but tracing it found a
real bug in `connectQz()`: it only checked
`qz.websocket.isActive()` the *first* time it was called on a page, then
cached that result in `qzConnectPromise` for every later call regardless
of whether the connection was still actually alive. If QZ Tray closed an
idle connection partway through a page's lifetime (e.g. the counter sits
on one page for a while between customers), the next print attempt on
that same page would have kept reusing the dead cached promise instead
of reconnecting -- a silent failure waiting to happen, not yet actually
hit as far as we know.

Fixed: `connectQz()` now re-checks `qz.websocket.isActive()` on every
call, not just when nothing's been cached yet -- reconnects
transparently whenever the cached connection has actually died.
Verified no regression: page still connects cleanly with QZ Tray
genuinely running, in the same test used to verify the earlier hang fix.

### Live printer testing round -- wrapped up at 90% (2026-09-09)

User's own assessment: this round of live/QZ Tray/printer work is "90%
done." Switched the app back to **Test mode** (`dropfix_settings.json`
-> `{"mode": "test"}`, back on `dropfix_test.db`) and stopped the dev
server. `dropfix.db` (the Live-mode database) still exists with its
seeded shop settings from this round, untouched, just not the active
database right now. Stated plan: a few more small changes, then move
into the packaging phase (see "Planned for the packaging phase" and
"Update workflow" above). Everything built this round -- QZ signing,
the two bug fixes, the firewall rule, the printer-without-hardware
confirmation -- stays in place; nothing here needs redoing when this
picks back up, only picking up from wherever the next small change
turns out to be.

## What I could verify myself vs. what needs your Google account

I do not have a Google Cloud service account in this environment, so:

**Fully tested by me** (ran real requests, checked real results):
- Every fail-safe path with no key configured -- clear error messages,
  never a crash, confirmed by watching the background loop run a full
  cycle with 2 items queued and correctly leave them queued.
- Key upload validation: garbage rejected, a JSON missing required
  fields rejected with a specific list, a well-formed-but-fake key
  accepted as a *file* but correctly flagged `valid: false` once
  google-auth itself checks it -- this actually caught a real gap (I'd
  only checked 3 required fields; google-auth needs a 4th, `token_uri`,
  which I added after seeing the real error).
- CSV export -- byte-level confirmed the £ symbol is correct UTF-8, not
  just a terminal rendering issue.
- **Restore from `.db`**: fully real end-to-end -- built an actual SQLite
  file, uploaded it, confirmed the live database was replaced with its
  content and the previous one was kept as a timestamped backup.
- All PDF receipts regenerated and visually inspected again after every
  change in this round -- still correct.

**Written correctly to the documented API, not run against the real
thing** (needs your service-account key + a shared Sheet + a shared
Drive folder to verify): pushing an actual row to a real Google Sheet,
uploading an actual file to a real Drive folder, reading an actual Sheet
for Import from Sheet.

## React + Vite + Tailwind migration (started 2026-09-09, in progress)

User asked for the whole frontend converted from vanilla HTML/CSS/JS to
React + Vite + Tailwind CSS. Explicitly confirmed as a full rewrite done
**incrementally, one screen at a time** -- not a same-day, all-at-once
conversion -- given the size (~38 files) and the direct conflict with
the near-complete packaging plan (a build step now needed before every
release; see "Update workflow" above). The old `frontend/` (vanilla) and
`backend/` (FastAPI) are both **completely untouched and still the live
app** -- this is being built in a brand new `frontend-react/` folder
alongside them, so there is zero risk to the working app while this is
in progress. Nothing gets switched over until the whole migration is
done and confirmed.

**Foundation built and verified so far:**
- Scaffolded with `npm create vite@latest -- --template react`,
  Tailwind CSS v4 (`@tailwindcss/vite` plugin, CSS-based config, no
  `tailwind.config.js` needed), `react-router-dom`.
- `vite.config.js` proxies `/api` and `/receipts` to the real FastAPI
  backend on `:8000` in dev -- every fetch call in the app uses a plain
  relative path (`/api/repairs`, etc.) and works identically in dev
  (proxied) and in the eventual production build (same origin, once
  `backend/main.py` serves this build's output instead of `frontend/`).
- **Every colour token copied verbatim** from the old `style.css`
  (lines 1-231, the full light/dark/8-accent-colour system) into
  `frontend-react/src/index.css` -- not re-derived or approximated, so
  there is zero risk of a subtly-wrong colour anywhere. Mapped into real
  Tailwind utilities (`bg-bg`, `text-text`, `bg-card`, `border-border`,
  `bg-ok-bg text-ok`, etc.) via Tailwind v4's `@theme inline` CSS
  feature, so components use ordinary Tailwind classes and still get
  the exact original theme-reactive colours.
- Theme (Light/Dark/System) + Accent colour: same `data-theme`/
  `data-accent` attributes on `<html>`, same `localStorage` keys
  (`dropfix-theme`, `dropfix-accent`) -- a browser that already used the
  old app keeps its saved preference. Flash-of-wrong-theme prevention
  ported as an inline `<script>` in `index.html`'s `<head>` (same trick
  as the old `theme.js`/`accent.js`, just relocated since Vite's
  `index.html` supports this identically).
- `src/context/ShopContext.jsx` -- replaces `common.js`'s DOM-querying
  approach with real React state: fetches mode/shop name/currency
  symbol once, provides them to the whole app. `<CurrencySymbol />`
  component is the drop-in replacement for every old `<span
  class="currency-symbol">`.
- `src/components/Layout.jsx` -- the shared topbar/nav/mode-banner
  shell, one real component instead of markup repeated in every old
  `.html` file, using React Router's `<Outlet/>` for "whichever page is
  current" and `useLocation()` for the same current-page nav
  highlighting the old `common.js` did by hand.
- First page migrated: **About** (`src/pages/About.jsx`) -- chosen
  deliberately as the simplest screen (no forms, no complex API state)
  to prove the foundation before tackling anything harder.

**Verified, not just assumed working:** real screenshots (headless
Chrome) of the migrated About page in both light and dark mode, pulling
genuinely live data through the Vite proxy from the real running
backend (shop name, mode banner) -- not mocked. Dark mode specifically
checked (temporarily forced via the bootstrap script, screenshotted,
then reverted) since colour-system regressions are exactly the kind of
thing that's easy to get subtly wrong in a rewrite -- confirmed
pixel-faithful to the original in both themes.

**Not started yet:** every other screen -- Home (3 forms: repair
intake, sale, paste & print), Search (live filtering, two independently
scrolling columns), Detail (the full repair/payment/refund/split-
payment/fault system), and all 7 Tools sub-pages. Also not yet done:
wiring `backend/main.py` to serve the eventual `frontend-react` build
output instead of `frontend/`, and QZ Tray/print integration in React.
None of this is a "these will definitely work" list -- it's what's left
to actually build and verify, one screen at a time, same rigor as the
foundation above.

## Project structure

**Restructured 2026-09-09** into physically separate top-level
`backend/` and `frontend/` folders (previously `app/` for everything,
with the frontend nested inside it as `app/static/`) -- a deliberate
split so the two are unambiguous at a glance, not just a naming
preference. This changed the Python package name (`app` -> `backend`,
so every internal import updated too, e.g. `from app.config import
...` -> `from backend.config import ...`) and the run command below,
but **not** any URL the browser uses -- static files still serve at
the `/static/...` prefix, now pointed at the `frontend/` folder instead
of `app/static/`, so no HTML/JS file needed a single edit.

```
Building/
  backend/
    config.py, constants.py, money.py, database.py, ticket_numbers.py
    financials.py, faults.py, payments.py, repairs.py, sales.py, search.py
    deleted.py, shop_settings.py, presenters.py, text_formatting.py
    suggestions.py              # type-ahead: name/phone/model/fault/item, from real data
    receipts.py, escpos.py, pdf_receipt.py, printing.py
    qz_signing.py                 # QZ Tray certificate + signing (see "QZ Tray signed connections")
    cloud_settings.py       # Sheet/Drive IDs, last backup time
    sync_queue.py            # local queue of "this needs pushing to a Sheet"
    google_auth.py            # shared service-account credential loading
    google_key.py              # upload/delete/status for the key file
    sheets_sync.py               # push repair/sale rows to Sheets
    drive_backup.py                # health check + upload to Drive
    restore.py                      # import from .db upload / from Sheet
    background_tasks.py              # the two async loops + startup catch-up
    main.py                           # FastAPI app, lifespan, routers
    routes/
      pages.py, meta.py, repairs.py, sales.py, search.py
      reprint.py     # /api/reprint/* only now -- the /reprint PAGE is gone, see below
      suggest.py       # /api/suggest/* (names, phones, models, fault text, sale items)
      tools.py            # shop settings, printer, recently-deleted routes
      printing.py           # print/reprint/paste-print/test-print routes
      qz.py                   # /api/qz/certificate, /api/qz/sign
      cloud.py                # Phase 4: key, settings, backup, restore, export
  frontend/
    index.html, search.html, about.html, detail.html
    tools.html                 # the Tools MENU
    tools-shop.html/js, tools-printer.html/js, tools-deleted.html/js
    tools-backup.html/js, tools-google.html/js
    tools-website.html/js        # the shop's public-site Google Form, link set in Shop Details
    tools-appearance.html/js    # Light/Dark/System + accent colour
    api.js, util.js, common.js, printing.js
    theme.js, accent.js          # early <head> scripts, set data-theme/data-accent before paint
    suggest.js                     # generic attachSuggestions(inputEl, endpoint)
    repair-box.js, sale-box.js, paste-box.js, home.js
    detail.js, search.js, reprint.js  # reprint.js: the 3 quick-reprint cards, now loaded by search.html
    style.css                 # the design system (colour tokens, theme/accent blocks)
    manifest.json, sw.js, pwa.js, icon.svg   # sw.js on disk but NOT registered during active dev, see pwa.js
  requirements.txt
  dropfix_settings.json, dropfix_test.db, dropfix.db   # dropfix_test.db created on first run
  dropfix_google_key.json                   # you place this (Tools > Google Connection can also create it)
  dropfix_qz_certificate.txt, dropfix_qz_private_key.pem   # QZ Tray signing -- private key never leaves this machine
  test_receipts/                              # Test-mode PDFs land here
```

Note: there is no `/reprint` page/route any more (removed once its 3
quick-reprint cards moved to the top of `/search`) -- `reprint.py` and
`reprint.js` still exist and are still live, just serving `/api/reprint/*`
and the Search page respectively, not a standalone page.

## How to run it

You need Python 3.10+ (3.12 confirmed working) and internet access once
(qz-tray.js loads from a CDN, same as the original tool). From the
`Building` folder:

```powershell
py -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python -m uvicorn backend.main:app --reload
```

Open **http://127.0.0.1:8000**. (Note the module path is `backend.main:app`,
not `app.main:app` -- that changed with the 2026-09-09 restructure above.)

## How to test the Phase 4 round

**Design** -- just look around. Home's three boxes and Search's three
quick-reprint boxes should have their buttons sitting at the same height
across all three, regardless of text length above them.

**Tools menu** -- click Tools; you should land on a 6-tile menu, not a
long form. Each tile should open its own page with a "← Tools" link back.

**Google Connection** (`/tools/google`, no real Google account needed to
test the safety behaviour):
1. Status should read "Google connection key not found" with the
   goal/search-term/site guidance visible.
2. Try uploading a random non-JSON file -- rejected with a clear message.
3. Try uploading `{"hello": "world"}` as a `.json` file -- rejected,
   listing exactly which fields are missing.
4. Set some Sheet/Drive IDs and save -- reload the page, confirm they
   stuck.
5. If you do have a real service-account key: upload it, confirm the
   status line shows "Connected as <the service account's email>" --
   that's the address to go share your Sheets and Drive folder with.

**Backup & Restore** (`/tools/backup`):
6. Click "Backup now" with no key configured -- clear error, not a crash.
7. Try "Restore from a .db file" with any small SQLite file that has a
   `repairs` table -- confirm it replaces the database and a timestamped
   backup of the old one appears next to it in the folder.
8. Export repairs.csv / sales.csv and open them in a spreadsheet app.

**Everything else** -- repeat the Phase 1-3 checklists (create tickets,
print, search, edit, delete/restore); all of that was re-verified after
this round's changes and nothing broke.

**Restart check**: stop the server, start it again -- your data, Shop
Details, printer choice, and cloud settings should all still be there.

## How to test the post-launch refinement round

**Theme + accent colour** (`/tools/appearance`): try all 3 themes and all
8 accent colours. The two should be fully independent -- changing one
must never move the other's highlighted button. Reload the page after
picking a non-default combo (e.g. Dark + Blue) and confirm both stuck.
Click into a ticket via Search's Back button (not the nav link) after
changing theme on another tab, to check the bfcache fix still holds.

**Currency** (`/tools/shop-details`): pick a non-GBP currency, save, then
check the new symbol shows on Search results, a ticket's Total/Paid/
Balance, Home's "Price (£)" labels, and a reprinted receipt -- all four
should match. Switch "How it prints on receipts" to Text and reprint the
same ticket: the receipt should now show the plain code (e.g. "USD
45.00") while the screen still shows the sign.

**Search** (`/search`): confirm the 3 quick-reprint cards work, a
repair's passcode shows in the list and in its own detail page header,
and `/reprint` itself now 404s (it's gone, on purpose).

**Suggestions**: type 2+ letters into Home's Name, Phone, Model, or "Other
(describe)" fault box, and Sale's Name or custom item box -- a dropdown
of past matches should appear under the field. Type a brand-new name,
save the ticket, then start typing it again elsewhere -- it should now
be suggestible immediately (no restart).

**Status list**: a ticket's Status row should show exactly 5 buttons, and
"Not Agreed/Fixed - Collected" / "Not Agreed/Fixed - In Shop" should be
the only two "not agreed/fixed" options (not 3).

**Paid/Unsettled filter**: on a repair with a real balance owing, click
"Mark settled" -- it should now show under Search's Paid filter, keep
showing under Not Paid too, and drop out of Unsettled. Unmark it and it
should move back. A fully-paid (£0 balance) ticket should never appear
under Unsettled, settled or not.

**Fault editing** (a ticket's detail page): add a fault and leave its
price blank -- it should show an inline amount box + "Set price" +
"Remove" right on that row. Set a price: the row should switch to
showing the amount + small "Edit" and "Remove" buttons, and Search's
Repairs list should update out of the "£X · pending item" state. Click
Edit on an already-priced fault, change the amount, Save -- it should
update immediately with no separate ticket-level Edit step needed.
Click Remove on a fault with a real price (not collected yet): should
show a confirm dialog naming the fault and its amount. Remove a pending
or £0 fault: should delete immediately, no dialog. Mark the ticket
Collected, then try Remove on any fault: should be refused with an
on-screen warning, both faults still there afterward.

To reset, delete `dropfix_test.db`, `dropfix_test.before-restore-*.db`,
`dropfix_google_key.json`, and the `test_receipts` folder.
