"""Free arXiv search via the public Atom API."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote_plus

import httpx

from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

_API = ("http://export.arxiv.org/api/query"
        "?search_query={q}&start=0&max_results={n}&sortBy=submittedDate&sortOrder=descending")


async def search(q: str, max_results: int = 10) -> dict[str, Any]:
    try:
        import feedparser  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "feedparser not installed", "results": []}

    url = _API.format(q=quote_plus(q), n=int(max_results))
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            feed = feedparser.parse(r.text)
    except Exception as exc:  # noqa: BLE001
        log.warning("arXiv fetch failed: %s", exc)
        return {"ok": False, "error": str(exc), "results": []}

    out: list[dict[str, Any]] = []
    for e in feed.entries:
        authors = [a.get("name", "") for a in (e.get("authors") or [])]
        # arXiv IDs end up like http://arxiv.org/abs/2410.06615v2
        arx_id = (e.get("id", "").rsplit("/", 1)[-1] or "")
        out.append({
            "title": e.get("title", "").strip().replace("\n", " "),
            "authors": authors,
            "abstract": e.get("summary", "").strip().replace("\n", " ")[:1200],
            "url": e.get("id", ""),
            "arxiv_id": arx_id,
            "published": e.get("published", ""),
            "primary_category": (e.get("arxiv_primary_category", {}) or {}).get("term"),
        })

    return {"ok": True, "query": q, "results": out, "count": len(out), "source": "arxiv"}


register(JarvisTool(
    name="arxiv_search",
    category="knowledge",
    description="Search arXiv for academic papers. Returns titles, authors, abstracts.",
    handler=search,
    schema={"type": "object",
            "properties": {"q": {"type": "string"}, "max_results": {"type": "integer"}},
            "required": ["q"]},
    requires_audit=False,
    voice_phrases=("ARIA, find papers on diffusion models",),
))
