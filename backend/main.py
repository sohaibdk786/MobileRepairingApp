"""FastAPI entry point.

Wires the static files, page routes, and API routers together, and
starts the two background loops (Sheet-sync queue drain, Drive backup
schedule) for the app's lifetime. See README.md for the full data-flow
map and what's built so far.
"""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.background_tasks import backup_schedule_loop, run_startup_catch_up, sync_queue_loop
from backend.config import get_base_dir
from backend.database import get_connection, init_db
from backend.deleted import purge_expired
from backend.routes import tools
from backend.routes import cloud
from backend.routes import meta
from backend.routes import pages
from backend.routes import printing
from backend.routes import qz
from backend.routes import repairs
from backend.routes import reprint
from backend.routes import sales
from backend.routes import search
from backend.routes import suggest

STATIC_DIR = Path(__file__).resolve().parent.parent / "frontend"
RECEIPTS_DIR = get_base_dir() / "test_receipts"

init_db()

# Recently Deleted auto-clears 3 calendar days after the deleted date,
# checked once here at startup (spec section 9) -- not on every request,
# since it's background housekeeping, not something the user triggers.
_startup_conn = get_connection()
try:
    purge_expired(_startup_conn)
finally:
    _startup_conn.close()

# Covers "the PC was off at 11:00/19:00, catch up on next startup" --
# must happen once at startup, not on the background loop's own timer.
run_startup_catch_up()

# Created up front (even in Live mode, which never writes into it) so the
# static mount below always has a real directory to point at -- Live mode
# generates no PDFs, but an empty, harmless folder is simpler than making
# this mount conditional on the current mode.
RECEIPTS_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    sync_task = asyncio.create_task(sync_queue_loop())
    backup_task = asyncio.create_task(backup_schedule_loop())
    try:
        yield
    finally:
        sync_task.cancel()
        backup_task.cancel()


app = FastAPI(title="DropFix", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/receipts", StaticFiles(directory=RECEIPTS_DIR), name="receipts")

app.include_router(pages.router)
app.include_router(meta.router)
app.include_router(repairs.router)
app.include_router(sales.router)
app.include_router(search.router)
app.include_router(suggest.router)
app.include_router(reprint.router)
app.include_router(tools.router)
app.include_router(printing.router)
app.include_router(cloud.router)
app.include_router(qz.router)
