"""RSS reader with background poll loop.

Feeds are stored as JSON at `settings.rss_feeds_path`. Items are not
persisted — every fetch is live (cheap because feedparser is in-process and
we cap at 20 feeds × 1 poll / 15 min).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

import httpx

from config.settings import settings
from core.jarvis import notifications as nfn
from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

_MAX_FEEDS = 20
_LAST_SEEN: dict[int, set[str]] = {}   # feed_id → set of seen entry guid/links


# ---------------------------------------------------------------------------
# JSON store
# ---------------------------------------------------------------------------

def _path() -> Path:
    return Path(settings.rss_feeds_path).expanduser().resolve()


def _load() -> list[dict[str, Any]]:
    p = _path()
    if not p.exists():
        return _seed_defaults()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as exc:  # noqa: BLE001
        log.warning("RSS feeds file unreadable (%s) — using defaults", exc)
        return _seed_defaults()


def _seed_defaults() -> list[dict[str, Any]]:
    return [
        {"id": 1, "url": "https://export.arxiv.org/rss/cs.LG", "label": "arXiv cs.LG"},
        {"id": 2, "url": "https://hnrss.org/frontpage",       "label": "Hacker News"},
    ]


def _save(feeds: list[dict[str, Any]]) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(feeds, indent=2), encoding="utf-8")
    tmp.replace(p)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_feeds() -> list[dict[str, Any]]:
    return _load()


def add_feed(url: str, label: str | None = None) -> dict[str, Any]:
    feeds = _load()
    if len(feeds) >= _MAX_FEEDS:
        return {"ok": False, "error": f"Too many feeds (max {_MAX_FEEDS})"}
    next_id = max((f["id"] for f in feeds), default=0) + 1
    new = {"id": next_id, "url": url, "label": label or url}
    feeds.append(new)
    _save(feeds)
    return {"ok": True, "feed": new}


def remove_feed(feed_id: int) -> bool:
    feeds = _load()
    new = [f for f in feeds if f["id"] != feed_id]
    if len(new) == len(feeds):
        return False
    _save(new)
    _LAST_SEEN.pop(feed_id, None)
    return True


async def items(feed_id: int | None = None, limit: int = 30) -> dict[str, Any]:
    try:
        import feedparser  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "feedparser not installed", "items": []}

    feeds = _load()
    if feed_id is not None:
        feeds = [f for f in feeds if f["id"] == feed_id]

    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for f in feeds:
            try:
                r = await client.get(f["url"])
                r.raise_for_status()
                parsed = feedparser.parse(r.text)
            except Exception as exc:  # noqa: BLE001
                log.debug("RSS fetch failed for %s: %s", f["url"], exc)
                continue
            for e in parsed.entries[:limit]:
                out.append({
                    "feed_id": f["id"], "feed_label": f["label"],
                    "title": (e.get("title") or "")[:200],
                    "link": e.get("link"),
                    "published": e.get("published") or e.get("updated"),
                    "summary": (e.get("summary") or "")[:400],
                })
    out.sort(key=lambda x: x.get("published") or "", reverse=True)
    return {"ok": True, "items": out[:limit], "count": min(len(out), limit)}


# ---------------------------------------------------------------------------
# Background poller
# ---------------------------------------------------------------------------

async def poll_loop() -> None:
    interval = max(60, settings.rss_poll_interval_s)
    log.info("RSS poller: interval=%ds", interval)
    try:
        import feedparser  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        log.warning("RSS poller: feedparser not installed — disabled")
        return

    while True:
        try:
            feeds = _load()
            async with httpx.AsyncClient(timeout=10.0) as client:
                for f in feeds:
                    try:
                        r = await client.get(f["url"])
                        if r.status_code != 200:
                            continue
                        parsed = feedparser.parse(r.text)
                    except Exception:  # noqa: BLE001
                        continue
                    seen = _LAST_SEEN.setdefault(f["id"], set())
                    new_count = 0
                    for e in parsed.entries[:10]:
                        gid = e.get("id") or e.get("link") or e.get("title")
                        if not gid or gid in seen:
                            continue
                        seen.add(gid)
                        new_count += 1
                        # First poll seeds the set silently
                        if len(seen) > 10:
                            await nfn.publish(
                                kind="rss", title=f"{f['label']}: new",
                                body=(e.get("title") or "")[:200],
                                severity="info",
                                meta={"feed_id": f["id"], "link": e.get("link")},
                            )
                    if new_count:
                        log.debug("RSS %s: %d new items", f["label"], new_count)
        except asyncio.CancelledError:
            log.info("RSS poller cancelled")
            return
        except Exception as exc:  # noqa: BLE001
            log.warning("RSS poll iteration failed: %s", exc)

        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return


register(JarvisTool(
    name="rss_items",
    category="knowledge",
    description="Fetch latest items from configured RSS feeds.",
    handler=lambda feed_id=None, limit=30: items(feed_id, limit),
    schema={"type": "object",
            "properties": {"feed_id": {"type": "integer"}, "limit": {"type": "integer"}}},
    requires_audit=False,
    voice_phrases=("ARIA, what's new on arXiv",),
))
