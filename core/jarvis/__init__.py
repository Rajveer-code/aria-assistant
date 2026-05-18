"""Jarvis-style tool layer for ARIA Assistant.

Every Tier-1/2/3 feature is a `ARIATool` registered with the central
`REGISTRY`. Each tool has:
  - a unique name
  - a smolagents-compatible description (used for voice routing)
  - a handler callable with typed kwargs
  - an explicit `requires_audit` flag (LLM-mediated tools wrap output in _audit)

Submodules register their tools at import time. Use
`core.jarvis.bootstrap()` once at app startup to import every submodule
in the right order and populate REGISTRY.
"""

from __future__ import annotations

import importlib
import logging

log = logging.getLogger(__name__)

_BOOTSTRAPPED = False

# Order matters for log readability; functionally each is independent.
_SUBMODULES: tuple[str, ...] = (
    "core.jarvis.utilities.weather",
    "core.jarvis.utilities.system_stats",
    "core.jarvis.utilities.timer",
    "core.jarvis.utilities.clipboard",
    "core.jarvis.knowledge.web_search",
    "core.jarvis.knowledge.arxiv",
    "core.jarvis.knowledge.wikipedia",
    "core.jarvis.knowledge.youtube",
    "core.jarvis.knowledge.rss",
    "core.jarvis.knowledge.code_runner",
    "core.jarvis.power.launcher",
    "core.jarvis.power.vision",
    "core.jarvis.power.github",
    "core.jarvis.power.notes",
    "core.jarvis.power.study",
)


def bootstrap() -> int:
    """Import every Jarvis submodule once; return number of registered tools."""
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        from core.jarvis.registry import REGISTRY  # noqa: PLC0415
        return len(REGISTRY)

    loaded = 0
    failed = 0
    for mod in _SUBMODULES:
        try:
            importlib.import_module(mod)
            loaded += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            log.warning("Jarvis submodule %s failed to import: %s", mod, exc)

    from core.jarvis.registry import REGISTRY  # noqa: PLC0415
    log.info("Jarvis bootstrap: %d submodules loaded (%d failed), %d tools registered",
             loaded, failed, len(REGISTRY))
    _BOOTSTRAPPED = True
    return len(REGISTRY)
