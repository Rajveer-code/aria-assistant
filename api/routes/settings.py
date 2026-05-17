"""Settings inspection + override (X3).

GET  /settings           → full Settings dataclass + override file status
PATCH /settings          → {key, value} — writes to overrides.json

Overrides are merged into env at next backend start; this is a soft restart
contract — the response advertises `requires_restart: true` when the changed
key affects model loading.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, fields
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config.settings import settings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


# Keys that need a backend restart to take effect (model loads).
_RESTART_KEYS = {
    "ollama_url", "llm_primary", "llm_copilot_path", "embedding_model",
    "reranker_model", "hhem_model", "whisper_model", "whisper_device",
    "qdrant_path", "audit_db_path", "memory_path", "notifications_db",
    "flashcards_db", "llava_model",
}

# Keys NEVER returned (paths to secrets, internal). None currently — placeholder.
_REDACTED_KEYS: set[str] = set()


class SettingPatch(BaseModel):
    key: str
    value: Any


def _overrides_path() -> Path:
    return Path(settings.overrides_path).expanduser().resolve()


def _read_overrides() -> dict[str, Any]:
    p = _overrides_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        log.warning("Overrides unreadable (%s) — treating as empty", exc)
        return {}


def _write_overrides(data: dict[str, Any]) -> None:
    p = _overrides_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(p)


def _valid_keys() -> set[str]:
    return {f.name for f in fields(settings)}


@router.get("")
def get_settings() -> dict:
    """Full settings snapshot + override status."""
    snap = asdict(settings)
    # Strip redacted, coerce tuples to lists for JSON serialisation
    for k in list(snap.keys()):
        if k in _REDACTED_KEYS:
            snap[k] = "<redacted>"
        elif isinstance(snap[k], tuple):
            snap[k] = list(snap[k])
    return {
        "settings": snap,
        "overrides": _read_overrides(),
        "overrides_path": str(_overrides_path()),
        "restart_keys": sorted(_RESTART_KEYS),
    }


@router.patch("")
def patch_setting(req: SettingPatch) -> dict:
    valid = _valid_keys()
    if req.key not in valid:
        raise HTTPException(400, f"Unknown setting key: {req.key!r}")
    overrides = _read_overrides()
    overrides[req.key] = req.value
    _write_overrides(overrides)
    return {
        "ok": True,
        "key": req.key,
        "value": req.value,
        "requires_restart": req.key in _RESTART_KEYS,
        "overrides": overrides,
    }


@router.delete("/{key}")
def reset_one(key: str) -> dict:
    overrides = _read_overrides()
    if key in overrides:
        del overrides[key]
        _write_overrides(overrides)
        return {"removed": key, "overrides": overrides}
    return {"removed": None, "overrides": overrides}


@router.delete("")
def reset_all() -> dict:
    _write_overrides({})
    return {"ok": True, "overrides": {}}
