"""The two loops that run for the app's whole lifetime once started
(spec section 10): draining the Sheet-sync queue every 30 seconds, and
firing the Drive backup at 11:00/19:00.

Every iteration of both loops is wrapped in a broad try/except. This is
the one place in the app where that's the right call, not a shortcut:
these loops have nothing else watching them, so an exception that isn't
caught here doesn't crash the app -- it just silently kills the loop
forever, and backups/sync quietly stop until the next restart with no
visible symptom at the counter. For a tool meant to run unattended for
years, that silent failure mode is worse than swallowing an unexpected
error and trying again next cycle.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from backend import sync_queue
from backend.cloud_settings import get_cloud_settings
from backend.database import get_connection
from backend.drive_backup import BACKUP_TIMES, BackupError, catch_up_backup_if_needed, run_backup_now
from backend.sheets_sync import SheetsError, get_client, push_repair_row, push_sale_row

logger = logging.getLogger("dropfix.background")

_SYNC_DRAIN_INTERVAL_SECONDS = 30


def run_startup_catch_up() -> None:
    """Synchronous, called once directly from app startup (spec: "catch
    up on the next startup past the mark") -- deliberately not part of
    the async loop below, since this must happen before the app finishes
    starting, not on some later timer tick.
    """
    conn = get_connection()
    try:
        result = catch_up_backup_if_needed(conn)
        if result:
            logger.info("Startup backup catch-up: %s", result)
    except Exception:
        logger.exception("Startup backup catch-up failed unexpectedly")
    finally:
        conn.close()


async def sync_queue_loop() -> None:
    while True:
        await asyncio.sleep(_SYNC_DRAIN_INTERVAL_SECONDS)
        try:
            _drain_sync_queue_once()
        except Exception:
            logger.exception("Sync queue drain failed unexpectedly")


def _drain_sync_queue_once() -> None:
    conn = get_connection()
    try:
        pending = sync_queue.list_pending(conn)
        if not pending:
            return
        settings = get_cloud_settings(conn)
        try:
            client = get_client()
        except SheetsError:
            return  # not configured / can't connect -- stays queued, retried next cycle

        for item in pending:
            try:
                if item["entity_type"] == "repair":
                    if not settings["repairs_sheet_id"]:
                        continue
                    push_repair_row(conn, client, settings["repairs_sheet_id"], item["entity_id"])
                else:
                    if not settings["sales_sheet_id"]:
                        continue
                    push_sale_row(conn, client, settings["sales_sheet_id"], int(item["entity_id"]))
                sync_queue.remove(conn, item["id"])
            except SheetsError:
                continue  # leave this one queued and move on -- one bad row shouldn't block the rest
    finally:
        conn.close()


def _seconds_until_next_backup_mark() -> float:
    now = datetime.now()
    candidates = []
    for days_ahead in (0, 1):
        day = now + timedelta(days=days_ahead)
        for mark_time in BACKUP_TIMES:
            candidate = day.replace(hour=mark_time.hour, minute=mark_time.minute, second=0, microsecond=0)
            if candidate > now:
                candidates.append(candidate)
    return (min(candidates) - now).total_seconds()


async def backup_schedule_loop() -> None:
    """Covers the case where the app stays running continuously through
    a backup mark (the startup catch-up above only covers "the PC was
    off at 11:00/19:00 and just turned on").
    """
    while True:
        try:
            await asyncio.sleep(_seconds_until_next_backup_mark())
            conn = get_connection()
            try:
                run_backup_now(conn)
            except BackupError as exc:
                logger.warning("Scheduled backup failed, will retry at the next mark: %s", exc)
            finally:
                conn.close()
        except Exception:
            logger.exception("Backup schedule loop failed unexpectedly")
