"""Asyncio-backed timers with notification fire-off on expiry."""

from __future__ import annotations

import asyncio
import itertools
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from core.jarvis import notifications as nfn
from core.jarvis.registry import ARIATool, register

log = logging.getLogger(__name__)

_ID = itertools.count(start=1)


@dataclass
class _Timer:
    id: int
    label: str
    seconds: int
    started_at: float
    task: asyncio.Task | None = field(default=None, repr=False)

    @property
    def remaining(self) -> float:
        return max(0.0, (self.started_at + self.seconds) - time.time())

    @property
    def expires_at(self) -> float:
        return self.started_at + self.seconds


_ACTIVE: dict[int, _Timer] = {}


async def _runner(t: _Timer) -> None:
    try:
        await asyncio.sleep(t.seconds)
        await nfn.publish(
            kind="timer", title=f"Timer done — {t.label}",
            body=f"{t.seconds}s elapsed",
            severity="info", native=True,
            meta={"timer_id": t.id, "label": t.label, "seconds": t.seconds},
        )
    except asyncio.CancelledError:
        log.debug("Timer %d (%s) cancelled", t.id, t.label)
    finally:
        _ACTIVE.pop(t.id, None)


async def create(label: str, seconds: int) -> dict[str, Any]:
    tid = next(_ID)
    t = _Timer(id=tid, label=label or "timer", seconds=int(seconds), started_at=time.time())
    t.task = asyncio.create_task(_runner(t))
    _ACTIVE[tid] = t
    return {"id": tid, "label": t.label, "seconds": t.seconds, "expires_at": t.expires_at}


def list_active() -> list[dict[str, Any]]:
    return [
        {"id": t.id, "label": t.label, "seconds": t.seconds,
         "remaining": round(t.remaining, 1), "expires_at": t.expires_at}
        for t in sorted(_ACTIVE.values(), key=lambda x: x.expires_at)
    ]


def cancel(timer_id: int) -> bool:
    t = _ACTIVE.get(timer_id)
    if not t or not t.task:
        return False
    t.task.cancel()
    return True


def _sync_create_wrapper(label: str = "timer", seconds: int = 60) -> dict:
    """smolagents-friendly sync wrapper. Returns the active list."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(create(label, seconds), loop)
        else:
            loop.run_until_complete(create(label, seconds))
    except RuntimeError:
        # No running loop (called from non-async context outside FastAPI).
        asyncio.run(create(label, seconds))
    return {"ok": True, "label": label, "seconds": seconds}


register(ARIATool(
    name="timer",
    category="utilities",
    description=("Start a countdown timer. Args: label (string), seconds (int 1..86400). "
                 "Fires a desktop + toast notification when it expires."),
    handler=_sync_create_wrapper,
    schema={"type": "object",
            "properties": {"label": {"type": "string"}, "seconds": {"type": "integer"}},
            "required": ["seconds"]},
    requires_audit=False,
    voice_phrases=("ARIA, set a 25 minute pomodoro", "ARIA, 5 minute timer"),
))
