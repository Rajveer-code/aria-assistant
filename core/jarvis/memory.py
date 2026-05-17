"""Persistent JSON-sidecar memory for ARIA.

Simple key-value store backed by a single JSON file. Used for:
  - user identity (name, time zone, default city)
  - project context ("currently working on the equity axis")
  - long-running session facts the LLM should remember across restarts

Thread-safe via a coarse module-level lock — concurrent access is rare
in single-user mode.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

from config.settings import settings

log = logging.getLogger(__name__)

_LOCK = threading.Lock()
_CACHE: dict[str, Any] | None = None


def _path() -> Path:
    return Path(settings.memory_path).expanduser().resolve()


def _ensure_dir() -> None:
    _path().parent.mkdir(parents=True, exist_ok=True)


def _load() -> dict[str, Any]:
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    p = _path()
    if not p.exists():
        _CACHE = {}
        return _CACHE
    try:
        _CACHE = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(_CACHE, dict):
            log.warning("Memory file %s is not an object — resetting", p)
            _CACHE = {}
    except Exception as exc:  # noqa: BLE001
        log.warning("Memory file %s unreadable (%s) — starting empty", p, exc)
        _CACHE = {}
    return _CACHE


def _persist() -> None:
    _ensure_dir()
    p = _path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(_CACHE, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(p)


def get_all() -> dict[str, Any]:
    with _LOCK:
        return dict(_load())


def get(key: str, default: Any = None) -> Any:
    with _LOCK:
        return _load().get(key, default)


def patch(key: str, value: Any) -> dict[str, Any]:
    """Set one key. Returns the full updated dict."""
    with _LOCK:
        _load()[key] = value
        _persist()
        return dict(_CACHE or {})


def replace(data: dict[str, Any]) -> dict[str, Any]:
    """Replace the entire memory dict. Use sparingly."""
    global _CACHE
    if not isinstance(data, dict):
        raise TypeError("memory.replace() requires a dict")
    with _LOCK:
        _CACHE = dict(data)
        _persist()
        return dict(_CACHE)


def delete(key: str) -> bool:
    with _LOCK:
        m = _load()
        if key in m:
            del m[key]
            _persist()
            return True
        return False
