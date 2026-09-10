"""FastAPI entry point.

Wires the static files, page routes, and API routers together, and
starts the two background loops (Sheet-sync queue drain, Drive backup
schedule) for the app's lifetime. See README.md for the full data-flow
map and what's built so far.

Frontend:
  - Production / same-origin: serve frontend-react/dist (after `npm run build`)
  - Dev: run Vite on :5173 (proxies /api + /receipts here on :8000)

Run from repo root or backend/:
  python3 main.py
  python3 -m backend.main
"""
from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Allow `python3 main.py` (from backend/) and `python3 backend/main.py`
# (from repo root) — both need the repo root on sys.path for `backend.*`.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.services.phones import phone_images_dir
from backend.cloud.background_tasks import backup_schedule_loop, run_startup_catch_up, sync_queue_loop
from backend.core.config import (
    VITE_DEV_ORIGINS,
    get_base_dir,
    get_frontend_react_dist,
)
from backend.core.database import get_connection, init_db
from backend.services.deleted import purge_expired
from backend.routes import tools
from backend.routes import cloud
from backend.routes import meta
from backend.routes import phones
from backend.routes import printing
from backend.routes import qz
from backend.routes import repairs
from backend.routes import reprint
from backend.routes import sales
from backend.routes import search
from backend.routes import shop
from backend.routes import suggest
from backend.routes import track

RECEIPTS_DIR = get_base_dir() / "test_receipts"
PHONE_IMAGES_DIR = phone_images_dir()
REACT_DIST = get_frontend_react_dist()

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
PHONE_IMAGES_DIR.mkdir(exist_ok=True)


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

# Lets frontend-react (`npm run dev` on :5173) call this API directly if
# needed; normal Vite proxy uses same-origin relative /api paths instead.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(VITE_DEV_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/receipts", StaticFiles(directory=RECEIPTS_DIR), name="receipts")
app.mount("/phone-images", StaticFiles(directory=PHONE_IMAGES_DIR), name="phone-images")

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
# Customer QR pages — must register before the React SPA catch-all.
app.include_router(track.router)
app.include_router(shop.router)
app.include_router(phones.router)

# Serve the React SPA when frontend-react/dist exists (after `npm run build`).
# During `npm run dev`, Vite on :5173 is the UI; this process is API-only.
if REACT_DIST.joinpath("index.html").is_file():
    assets_dir = REACT_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="react-assets")

    @app.get("/{full_path:path}")
    async def react_spa(full_path: str):
        """Serve built files from dist/, else index.html for client routes."""
        if full_path:
            candidate = REACT_DIST / full_path
            # Block path escape; only files under dist/
            try:
                candidate.resolve().relative_to(REACT_DIST.resolve())
            except ValueError:
                return FileResponse(REACT_DIST / "index.html")
            if candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(REACT_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8001"))
    reload = os.environ.get("RELOAD", "1").strip().lower() not in ("0", "false", "no")

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=reload,
    )
