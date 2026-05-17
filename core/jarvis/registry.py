"""Central tool registry shared by REST API and voice routing.

Every Jarvis tool registers itself at module-import time via `register()`.
The same `REGISTRY` is consumed by:
  - `api/routes/tools.py` for REST dispatch (`dispatch(name, **kwargs)`)
  - voice routing (smolagents) — see `to_smolagents_descriptions()`

This module intentionally does NOT import smolagents at top level — that
keeps the test surface small. `to_smolagents_descriptions()` returns the
metadata; the voice layer wraps it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

log = logging.getLogger(__name__)


@dataclass
class JarvisTool:
    name: str
    """Unique tool identifier (snake_case)."""

    category: str  # 'utilities' | 'knowledge' | 'power'
    """Hub category for UI grouping."""

    description: str
    """One-line description used by smolagents for voice routing."""

    handler: Callable[..., Any]
    """Sync or async callable. Receives kwargs matching `schema`."""

    schema: dict = field(default_factory=dict)
    """JSON-schema-ish dict describing parameters (for OpenAPI + docs)."""

    requires_audit: bool = False
    """If True, the result should be wrapped in an aria_audit envelope by callers."""

    voice_phrases: tuple[str, ...] = ()
    """Example phrases shown in the UI ("Say: ARIA, weather in Pune")."""


REGISTRY: dict[str, JarvisTool] = {}


def register(tool: JarvisTool) -> JarvisTool:
    """Register a tool. Last-write-wins on duplicate name."""
    if tool.name in REGISTRY:
        log.debug("Jarvis tool %r already registered — overwriting", tool.name)
    REGISTRY[tool.name] = tool
    return tool


def get(name: str) -> JarvisTool | None:
    return REGISTRY.get(name)


def list_tools(category: str | None = None) -> list[JarvisTool]:
    if category is None:
        return list(REGISTRY.values())
    return [t for t in REGISTRY.values() if t.category == category]


def dispatch(name: str, **kwargs) -> Any:
    """Synchronous dispatch. Async handlers should be awaited by the caller."""
    tool = REGISTRY.get(name)
    if tool is None:
        raise KeyError(f"Unknown Jarvis tool: {name!r}")
    return tool.handler(**kwargs)


def to_smolagents_descriptions() -> list[dict]:
    """Lightweight metadata list — voice layer converts to smolagents Tool objects.

    Returns one dict per tool with `{name, description, schema, requires_audit}`.
    """
    return [
        {
            "name": t.name,
            "description": t.description,
            "schema": t.schema,
            "requires_audit": t.requires_audit,
        }
        for t in REGISTRY.values()
    ]
