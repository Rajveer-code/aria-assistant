"""Clipboard watcher + summarizer.

Off by default. When enabled in settings, a daemon thread polls the system
clipboard every `clipboard_poll_ms` and pushes a notification when a long /
URL-bearing / code-looking item arrives. History is kept in-memory only.
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Deque

from config.settings import settings
from core.jarvis import notifications as nfn
from core.jarvis.registry import ARIATool, register

log = logging.getLogger(__name__)

# --- State -----------------------------------------------------------------
_HISTORY: Deque[dict[str, Any]] = deque(maxlen=max(1, settings.clipboard_history_max))
_LOCK = threading.Lock()
_THREAD: threading.Thread | None = None
_STOP = threading.Event()
_LAST_TEXT: str = ""

# Patterns used to decide if a copy is "interesting"
_URL_RE = re.compile(r"https?://\S+")
_CODE_RE = re.compile(r"(def |class |function |const |let |#include|<.+?>)")
_SECRET_RE = re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*\S+")


def last_text() -> str:
    return _LAST_TEXT


def history() -> list[dict[str, Any]]:
    with _LOCK:
        return list(_HISTORY)


def _classify(text: str) -> str:
    if _URL_RE.search(text):
        return "url"
    if _CODE_RE.search(text):
        return "code"
    if len(text) > 280:
        return "long_text"
    return "text"


def _redact(text: str) -> str:
    """Replace anything that smells like a secret with placeholders."""
    return _SECRET_RE.sub(lambda m: m.group(1) + ": <redacted>", text)


def _watcher(loop: asyncio.AbstractEventLoop) -> None:
    try:
        import pyperclip  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        log.warning("pyperclip unavailable — clipboard watcher disabled (%s)", exc)
        return

    poll_s = max(0.2, settings.clipboard_poll_ms / 1000.0)
    last_seen = ""
    log.info("Clipboard watcher: polling every %.2fs", poll_s)
    while not _STOP.is_set():
        try:
            cur = pyperclip.paste() or ""
        except Exception as exc:  # noqa: BLE001
            log.debug("clipboard read failed: %s", exc)
            time.sleep(poll_s)
            continue

        if cur and cur != last_seen and len(cur.strip()) >= 4:
            last_seen = cur
            cleaned = _redact(cur)
            kind = _classify(cleaned)
            with _LOCK:
                _HISTORY.appendleft({
                    "text": cleaned[:5_000],
                    "kind": kind,
                    "ts": time.time(),
                    "length": len(cleaned),
                })
                globals()["_LAST_TEXT"] = cleaned

            # Only ping when the copy looks "interesting"
            if kind in ("url", "code") or len(cleaned) > 280:
                nfn.publish_threadsafe(
                    loop,
                    kind="clipboard",
                    title=f"Clipboard · {kind}",
                    body=cleaned[:120],
                    severity="info",
                    meta={"length": len(cleaned), "kind": kind},
                )

        time.sleep(poll_s)


def start_watcher(loop: asyncio.AbstractEventLoop) -> bool:
    """Idempotently start the watcher thread. Returns True if running."""
    global _THREAD
    if not settings.clipboard_enabled:
        return False
    if _THREAD and _THREAD.is_alive():
        return True
    _STOP.clear()
    _THREAD = threading.Thread(target=_watcher, args=(loop,),
                                daemon=True, name="clipboard-watcher")
    _THREAD.start()
    return True


def stop_watcher() -> None:
    _STOP.set()


async def summarize(text: str) -> dict[str, Any]:
    """Use the primary LLM to summarize a clipboard item. Returns audit envelope."""
    if not text:
        return {"ok": False, "error": "empty text"}

    prompt = (
        "Summarize the following clipboard content in 2 sentences. "
        "If it's code, name the language and one-line purpose. "
        "If it's a URL, identify what it appears to point to.\n\n"
        f"Content:\n{text[:4000]}"
    )

    # Lazy imports — avoid pulling LLM stack into the watcher thread
    try:
        from api.main import _get_llm, _audit  # noqa: PLC0415
        llm = _get_llm()
        result = llm.generate(prompt)
        summary = result.text
        envelope = _audit(prompt, summary, result.model, lambda p: llm.generate(p).text)
        return {"ok": True, "summary": summary, "audit_envelope": envelope}
    except Exception as exc:  # noqa: BLE001
        log.warning("Clipboard summarize failed: %s", exc)
        return {"ok": False, "error": str(exc)}


register(ARIATool(
    name="clipboard_summarize",
    category="utilities",
    description="Summarize the most recently copied clipboard item using the primary LLM.",
    handler=lambda text=None: asyncio.run(summarize(text or last_text())),
    schema={"type": "object", "properties": {"text": {"type": "string"}}},
    requires_audit=True,
    voice_phrases=("ARIA, summarize my clipboard",),
))
