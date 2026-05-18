"""Free web search via DuckDuckGo HTML (no API key, no rate auth)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote_plus

import httpx

from core.jarvis.registry import ARIATool, register

log = logging.getLogger(__name__)

_DDG_HTML = "https://duckduckgo.com/html/?q={q}"
_UA = "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0"


async def search(q: str, limit: int = 10) -> dict[str, Any]:
    """Scrape DDG Lite for top-N results. Returns title/url/snippet."""
    try:
        from selectolax.parser import HTMLParser  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "selectolax not installed", "results": []}

    try:
        async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": _UA},
                                      follow_redirects=True) as client:
            r = await client.post("https://duckduckgo.com/html/",
                                  data={"q": q})
            r.raise_for_status()
            html = r.text
    except Exception as exc:  # noqa: BLE001
        log.warning("DuckDuckGo fetch failed: %s", exc)
        return {"ok": False, "error": str(exc), "results": []}

    tree = HTMLParser(html)
    results: list[dict[str, str]] = []
    for node in tree.css("div.result"):
        a = node.css_first("a.result__a")
        snippet_node = node.css_first("a.result__snippet, div.result__snippet")
        if not a:
            continue
        title = (a.text() or "").strip()
        url = a.attributes.get("href", "")
        snippet = (snippet_node.text() if snippet_node else "").strip()
        if title and url:
            results.append({"title": title, "url": url, "snippet": snippet})
        if len(results) >= limit:
            break

    return {"ok": True, "query": q, "results": results, "count": len(results),
            "source": "duckduckgo"}


register(ARIATool(
    name="web_search",
    category="knowledge",
    description="Search the web via DuckDuckGo. Returns title/url/snippet for top results.",
    handler=lambda q, limit=10: search(q, limit),
    schema={"type": "object",
            "properties": {"q": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["q"]},
    requires_audit=False,
    voice_phrases=("ARIA, search the web for ...", "ARIA, look up ..."),
))
