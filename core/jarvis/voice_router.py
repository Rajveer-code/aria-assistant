"""Voice → Jarvis tool routing.

After STT, the transcript is matched against simple intent patterns. If a
pattern fires, the corresponding tool runs and a natural-language response
is composed for TTS. Otherwise we return `None` and the caller falls
through to standard LLM chat.

We deliberately keep this rule-based rather than smolagents-CodeAgent:
- it's predictable (no agent loop runaway)
- it adds zero LLM latency to "what's the weather"
- it composes cleanly with existing /query LLM fallback
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Awaitable, Callable, Optional

log = logging.getLogger(__name__)


# Each intent: (compiled regex, async handler that returns spoken-ready text)
_Intent = tuple[re.Pattern[str], Callable[[re.Match[str]], Awaitable[str]]]


# ---------------------------------------------------------------------------
# Intent handlers
# ---------------------------------------------------------------------------

async def _weather(m: re.Match[str]) -> str:
    from core.jarvis.utilities import weather as w  # noqa: PLC0415
    city = (m.group("city") or "").strip() or None
    data = await w.fetch(city) if city else await w.fetch(__import__("config.settings", fromlist=["settings"]).settings.default_city)
    if not data.get("ok"):
        return f"I couldn't reach the weather service. {data.get('error', '')}".strip()
    c = data["current"]
    return f"It's {c['temp_c']} degrees and {c['description']} in {data['city']}. Humidity {c['humidity']} percent."


async def _system(m: re.Match[str]) -> str:
    from core.jarvis.utilities import system_stats as s  # noqa: PLC0415
    d = s.snapshot()
    if not d.get("ok"):
        return "System stats are unavailable."
    parts = [f"CPU {d['cpu']['pct']:.0f} percent",
             f"RAM {d['ram']['pct']} percent of {d['ram']['total_gb']:.0f} gigabytes"]
    if d.get("gpu"):
        parts.append(f"GPU memory {d['gpu']['vram_used_gb']:.1f} of {d['gpu']['vram_total_gb']:.1f} gigabytes")
    return ". ".join(parts) + "."


async def _timer(m: re.Match[str]) -> str:
    from core.jarvis.utilities import timer as t  # noqa: PLC0415
    n = int(m.group("n"))
    unit = (m.group("unit") or "minute").lower()
    seconds = n * (60 if unit.startswith("min") else 1 if unit.startswith("sec") else 3600)
    label = (m.group("label") or "timer").strip()
    await t.create(label, seconds)
    return f"Started a {n} {unit} timer."


async def _arxiv(m: re.Match[str]) -> str:
    from core.jarvis.knowledge import arxiv as ax  # noqa: PLC0415
    q = m.group("q").strip()
    data = await ax.search(q, max_results=3)
    if not data.get("ok") or not data["results"]:
        return f"I couldn't find papers about {q}."
    titles = [r["title"] for r in data["results"]]
    return f"Top three arXiv results for {q}: " + "; ".join(titles[:3]) + "."


async def _wiki(m: re.Match[str]) -> str:
    from core.jarvis.knowledge import wikipedia as wk  # noqa: PLC0415
    q = m.group("q").strip()
    data = await wk.summary(q)
    if not data.get("ok"):
        return f"No Wikipedia entry for {q}."
    return data.get("extract", "")[:500]


async def _web(m: re.Match[str]) -> str:
    from core.jarvis.knowledge import web_search as ws  # noqa: PLC0415
    q = m.group("q").strip()
    data = await ws.search(q, limit=3)
    if not data.get("ok") or not data["results"]:
        return f"No web results for {q}."
    return "Top web results: " + "; ".join(r["title"] for r in data["results"][:3]) + "."


async def _open_app(m: re.Match[str]) -> str:
    from core.jarvis.power import launcher as ln  # noqa: PLC0415
    target = m.group("target").strip()
    r = ln.open_target(target, "app")
    return f"Opened {target}." if r.get("ok") else f"Could not open {target}: {r.get('error')}"


async def _remember(m: re.Match[str]) -> str:
    from core.jarvis import memory  # noqa: PLC0415
    key = (m.group("key") or "").strip().lower().replace(" ", "_")
    value = m.group("value").strip()
    if not key:
        key = "note_" + str(int(__import__("time").time()))
    memory.patch(key, value)
    return f"Got it. I'll remember that {key.replace('_', ' ')} is {value}."


# ---------------------------------------------------------------------------
# Pattern table — first match wins
# ---------------------------------------------------------------------------

# Helper to make a phrase optional: "(?:hey )?aria,?\s*"
_PREFIX = r"(?:hey\s+)?aria[,!?.\s]*"

_INTENTS: list[_Intent] = [
    # Timers
    (re.compile(rf"{_PREFIX}(?:set|start)\s+(?:a\s+)?(?P<n>\d+)\s*(?P<unit>second|seconds|minute|minutes|hour|hours)\s*(?:timer|pomodoro)?(?:\s+for\s+(?P<label>.+))?",
                re.I), _timer),
    (re.compile(rf"{_PREFIX}(?P<n>\d+)\s*(?P<unit>minute|minutes|hour|hours)\s*(?P<label>(?:pomodoro|break|focus|timer)?)",
                re.I), _timer),

    # Weather
    (re.compile(rf"{_PREFIX}(?:what(?:'s|s)?\s+(?:is\s+)?|tell\s+me|how(?:'s|s)?|show)?\s*(?:the\s+)?weather(?:\s+(?:in|at|for)\s+(?P<city>[A-Za-z][A-Za-z\s,]+))?",
                re.I), _weather),

    # System
    (re.compile(rf"{_PREFIX}(?:show|tell me|what(?:'s|s)?)?\s*(?:my\s+)?(?:system\s+)?(?:stats|cpu|ram|gpu|memory)",
                re.I), _system),

    # Memory
    (re.compile(rf"{_PREFIX}remember(?:\s+that)?\s+(?:my\s+)?(?P<key>[\w\s]{{1,40}})\s+(?:is|=)\s+(?P<value>.{{1,200}})",
                re.I), _remember),

    # arXiv
    (re.compile(rf"{_PREFIX}(?:find|search)\s+(?:papers?|arxiv)\s+(?:on|about|for)\s+(?P<q>.+)",
                re.I), _arxiv),

    # Wikipedia
    (re.compile(rf"{_PREFIX}(?:look\s+up|what\s+is)\s+(?P<q>.+?)\s+(?:on\s+wikipedia|in\s+wikipedia)",
                re.I), _wiki),

    # Web search
    (re.compile(rf"{_PREFIX}(?:search\s+(?:the\s+)?web\s+for|google|look\s+up)\s+(?P<q>.+)",
                re.I), _web),

    # Launcher
    (re.compile(rf"{_PREFIX}(?:open|launch|start)\s+(?P<target>.+)",
                re.I), _open_app),
]


async def route(transcript: str) -> Optional[dict[str, Any]]:
    """Try every intent in order. Returns a dict on match, else None.

    Returns:
        {"matched": True, "intent": str, "response": str, "text_input": str}
        or None (caller falls through to LLM chat).
    """
    if not transcript or len(transcript) < 2:
        return None
    text = transcript.strip()
    for pattern, handler in _INTENTS:
        m = pattern.search(text)
        if m:
            try:
                reply = await handler(m)
                return {
                    "matched": True,
                    "intent": handler.__name__.lstrip("_"),
                    "response": reply,
                    "text_input": text,
                }
            except Exception as exc:  # noqa: BLE001
                log.warning("Intent %s handler failed: %s", handler.__name__, exc)
                # Fall through to next pattern
                continue
    return None


def route_sync(transcript: str) -> Optional[dict[str, Any]]:
    """Blocking wrapper for non-async callers (CLI / smoke tests)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            return None  # called inside async — use route() directly
        return loop.run_until_complete(route(transcript))
    except RuntimeError:
        return asyncio.run(route(transcript))
