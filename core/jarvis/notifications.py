"""Unified notification system.

Replaces the wake-only WAKE_QUEUE in api/main.py with a richer pipeline:

  producer            broadcast              consumer
  --------            ---------              --------
  timer.done   →                       →  WS client (toast)
  clap.wake    →   NOTIFICATION_QUEUE  →  WS client (orb wake)
  rss.new      →                       →  native (plyer)
  audit.alarm  →                       →  history list (SQLite)
  ...

Every notification has a deterministic shape:
    {
      "id":       int,        # monotonic
      "type":     "notification"|"wake",
      "kind":     str,        # producer tag — "timer"|"audit"|"clipboard"|"rss"|"system"|"wake"
      "title":    str,
      "body":     str,
      "severity": "info"|"warn"|"alarm"|"wake",
      "ts":       float,      # unix seconds
      "meta":     dict        # producer-specific payload
    }

`type` is what the frontend WS handler switches on; `kind` is the producer.
"""

from __future__ import annotations

import asyncio
import itertools
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Iterable

from config.settings import settings

log = logging.getLogger(__name__)

# ---- Public state (initialised by api/main.py at startup) -----------------
NOTIFICATION_QUEUE: asyncio.Queue | None = None
_WS_CLIENTS: list[asyncio.Queue] = []
_ID_COUNTER = itertools.count(start=1)
_PERSIST_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Lifecycle helpers (called from api/main.py)
# ---------------------------------------------------------------------------

def init(queue_size: int | None = None) -> asyncio.Queue:
    """Construct the global queue. Idempotent."""
    global NOTIFICATION_QUEUE
    if NOTIFICATION_QUEUE is None:
        NOTIFICATION_QUEUE = asyncio.Queue(maxsize=queue_size or settings.notification_queue_size)
    _ensure_db()
    return NOTIFICATION_QUEUE


def register_client(q: asyncio.Queue) -> None:
    _WS_CLIENTS.append(q)


def unregister_client(q: asyncio.Queue) -> None:
    if q in _WS_CLIENTS:
        _WS_CLIENTS.remove(q)


def client_count() -> int:
    return len(_WS_CLIENTS)


# ---------------------------------------------------------------------------
# Publishing
# ---------------------------------------------------------------------------

def _build(kind: str, title: str, body: str,
           severity: str = "info", meta: dict | None = None,
           message_type: str = "notification") -> dict:
    return {
        "id": next(_ID_COUNTER),
        "type": message_type,
        "kind": kind,
        "title": title,
        "body": body,
        "severity": severity,
        "ts": time.time(),
        "meta": meta or {},
    }


async def publish(kind: str, title: str, body: str,
                  severity: str = "info", meta: dict | None = None,
                  message_type: str = "notification",
                  native: bool = False) -> dict:
    """Async publisher. Returns the built notification dict."""
    note = _build(kind, title, body, severity, meta, message_type)
    _persist(note)
    if NOTIFICATION_QUEUE is not None:
        try:
            NOTIFICATION_QUEUE.put_nowait(note)
        except asyncio.QueueFull:
            log.warning("Notification queue full — dropping: %s", title)
    if native:
        _native_notify(note)
    return note


def publish_threadsafe(loop: asyncio.AbstractEventLoop, **kwargs) -> dict:
    """Producer-thread → loop bridge. Use from non-async producers."""
    note = _build(
        kwargs.get("kind", "system"),
        kwargs.get("title", ""),
        kwargs.get("body", ""),
        kwargs.get("severity", "info"),
        kwargs.get("meta"),
        kwargs.get("message_type", "notification"),
    )
    _persist(note)
    if NOTIFICATION_QUEUE is not None:
        try:
            loop.call_soon_threadsafe(NOTIFICATION_QUEUE.put_nowait, note)
        except Exception as exc:  # noqa: BLE001
            log.warning("Threadsafe publish failed: %s", exc)
    if kwargs.get("native"):
        _native_notify(note)
    return note


# ---------------------------------------------------------------------------
# Broadcast task — fan-out from NOTIFICATION_QUEUE to every WS client queue
# ---------------------------------------------------------------------------

async def broadcast_loop() -> None:
    """Run forever; consume NOTIFICATION_QUEUE and copy into each WS client."""
    if NOTIFICATION_QUEUE is None:
        log.error("broadcast_loop started before init()")
        return
    log.info("Notification broadcaster: started")
    while True:
        try:
            note = await NOTIFICATION_QUEUE.get()
            for q in list(_WS_CLIENTS):
                try:
                    q.put_nowait(note)
                except Exception:  # noqa: BLE001
                    pass
        except asyncio.CancelledError:
            log.info("Notification broadcaster: cancelled")
            break
        except Exception as exc:  # noqa: BLE001
            log.warning("Notification broadcaster error: %s", exc)


# ---------------------------------------------------------------------------
# Native (plyer) — best-effort, never raises
# ---------------------------------------------------------------------------

def _native_notify(note: dict) -> None:
    try:
        from plyer import notification  # noqa: PLC0415
        notification.notify(
            title=note["title"][:64] or "ARIA",
            message=note["body"][:256] or "",
            app_name="ARIA Assistant",
            timeout=8,
        )
    except Exception as exc:  # noqa: BLE001
        log.debug("Native notification skipped (%s) — toast still fires", exc)


# ---------------------------------------------------------------------------
# SQLite persistence (last N notifications for replay on page reload)
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS notifications (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    kind      TEXT    NOT NULL,
    title     TEXT    NOT NULL,
    body      TEXT    NOT NULL,
    severity  TEXT    NOT NULL,
    ts        REAL    NOT NULL,
    meta_json TEXT
);
CREATE INDEX IF NOT EXISTS notifications_ts_idx ON notifications(ts DESC);
"""


def _db_path() -> Path:
    return Path(settings.notifications_db).expanduser().resolve()


def _ensure_db() -> None:
    p = _db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(p) as conn:
        conn.executescript(_SCHEMA)


def _persist(note: dict) -> None:
    import json as _json  # noqa: PLC0415
    try:
        with _PERSIST_LOCK, sqlite3.connect(_db_path()) as conn:
            conn.execute(
                "INSERT INTO notifications(kind,title,body,severity,ts,meta_json) VALUES (?,?,?,?,?,?)",
                (note["kind"], note["title"], note["body"], note["severity"], note["ts"],
                 _json.dumps(note.get("meta") or {})),
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("Notification persist failed: %s", exc)


def recent(n: int = 20, kinds: Iterable[str] | None = None) -> list[dict]:
    import json as _json  # noqa: PLC0415
    p = _db_path()
    if not p.exists():
        return []
    sql = "SELECT id,kind,title,body,severity,ts,meta_json FROM notifications "
    params: list[Any] = []
    if kinds:
        placeholders = ",".join("?" * len(list(kinds)))
        sql += f"WHERE kind IN ({placeholders}) "
        params.extend(list(kinds))
    sql += "ORDER BY ts DESC LIMIT ?"
    params.append(n)
    with sqlite3.connect(p) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    out: list[dict] = []
    for r in rows:
        out.append({
            "id":       r["id"],
            "kind":     r["kind"],
            "title":    r["title"],
            "body":     r["body"],
            "severity": r["severity"],
            "ts":       r["ts"],
            "meta":     _json.loads(r["meta_json"] or "{}"),
            "type":     "notification",
        })
    return out
