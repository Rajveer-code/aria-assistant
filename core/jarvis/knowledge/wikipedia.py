"""Free Wikipedia summary via the REST API."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx

from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
_SEARCH  = "https://en.wikipedia.org/w/api.php?action=opensearch&search={q}&limit=5&format=json"
_UA = "ARIA-Assistant/0.2 (personal research; contact rajveerpall04@gmail.com)"


async def summary(q: str) -> dict[str, Any]:
    headers = {"User-Agent": _UA}
    async with httpx.AsyncClient(timeout=8.0, headers=headers, follow_redirects=True) as client:
        # 1. Try the title directly
        try:
            r = await client.get(_SUMMARY.format(title=quote(q.replace(" ", "_"))))
            if r.status_code == 200:
                d = r.json()
                if d.get("type") == "standard":
                    return _shape(d)
        except Exception as exc:  # noqa: BLE001
            log.debug("wiki direct title failed: %s", exc)

        # 2. Fall back to opensearch → pick first
        try:
            r = await client.get(_SEARCH.format(q=quote(q)))
            r.raise_for_status()
            data = r.json()
            titles = data[1] if isinstance(data, list) and len(data) > 1 else []
            if not titles:
                return {"ok": False, "error": "no results", "query": q}
            r2 = await client.get(_SUMMARY.format(title=quote(titles[0].replace(" ", "_"))))
            r2.raise_for_status()
            return _shape(r2.json())
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "query": q}


def _shape(d: dict) -> dict[str, Any]:
    return {
        "ok": True,
        "title": d.get("title"),
        "description": d.get("description"),
        "extract": d.get("extract"),
        "thumbnail": (d.get("thumbnail") or {}).get("source"),
        "url": (d.get("content_urls") or {}).get("desktop", {}).get("page"),
        "source": "wikipedia",
    }


register(JarvisTool(
    name="wikipedia",
    category="knowledge",
    description="Look up a topic on Wikipedia. Returns title, short description, and extract.",
    handler=summary,
    schema={"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]},
    requires_audit=False,
    voice_phrases=("ARIA, what is X on Wikipedia",),
))
