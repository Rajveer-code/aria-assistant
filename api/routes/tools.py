"""All ARIA tool endpoints under /tools/*.

Routes here are thin — they validate, dispatch into `core.jarvis.<feature>`,
and (if the tool produces LLM output) wrap the result in `_audit()`.

Tools are populated by `core.aria.bootstrap()` at app startup. Each handler
imports its heavy deps lazily (defer-import pattern).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from config.settings import settings
from core.jarvis import notifications as nfn
from core.jarvis.registry import REGISTRY, get as get_tool, list_tools

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tools", tags=["tools"])


# ---------------------------------------------------------------------------
# Pydantic request schemas
# ---------------------------------------------------------------------------

class TimerCreate(BaseModel):
    label: str = Field(default="timer", max_length=64)
    seconds: int = Field(ge=1, le=86_400)


class MemoryPatch(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: Any


class ClipboardSummarizeReq(BaseModel):
    text: Optional[str] = None
    """If omitted, the most recent clipboard item is summarized."""


class YouTubeReq(BaseModel):
    url: str
    max_chars: int = Field(default=4000, ge=500, le=20_000)


class RssFeedReq(BaseModel):
    url: str
    label: Optional[str] = None


class RunCodeReq(BaseModel):
    code: str
    timeout_s: int = Field(default=8, ge=1, le=60)


class LauncherReq(BaseModel):
    target: str
    kind: str = Field(default="app", pattern="^(app|file|url)$")


class ScreenshotReq(BaseModel):
    region: Optional[list[int]] = None   # [left, top, width, height]
    query: Optional[str] = None


class GithubReq(BaseModel):
    action: str = Field(pattern="^(status|pr_list|pr_view|issue_list|issue_view|workflow_runs)$")
    repo: str
    args: Optional[dict] = None


class NotesIndexReq(BaseModel):
    vault_path: str


class StudyGenReq(BaseModel):
    source_kind: str = Field(pattern="^(paper|text|topic)$")
    source_id: str
    n_cards: int = Field(default=10, ge=1, le=50)


class StudyReviewReq(BaseModel):
    card_id: int
    quality: int = Field(ge=0, le=5)


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------

@router.get("/")
def list_all_tools() -> dict:
    """Return registry snapshot for debugging + voice tool discovery."""
    return {
        "tools": [
            {
                "name": t.name,
                "category": t.category,
                "description": t.description,
                "requires_audit": t.requires_audit,
                "voice_phrases": list(t.voice_phrases),
            }
            for t in list_tools()
        ],
        "count": len(REGISTRY),
    }


# ---------------------------------------------------------------------------
# Notifications (replay history)
# ---------------------------------------------------------------------------

@router.get("/notifications/recent")
def notifications_recent(n: int = Query(20, ge=1, le=200)) -> dict:
    items = nfn.recent(n=n)
    return {"notifications": items, "count": len(items)}


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

@router.get("/weather")
async def weather(city: Optional[str] = None) -> dict:
    from core.jarvis.utilities import weather as w  # noqa: PLC0415
    return await w.fetch(city or settings.default_city)


@router.get("/system")
def system_stats() -> dict:
    from core.jarvis.utilities import system_stats as s  # noqa: PLC0415
    return s.snapshot()


@router.post("/timer")
async def timer_create(req: TimerCreate) -> dict:
    from core.jarvis.utilities import timer as t  # noqa: PLC0415
    return await t.create(req.label, req.seconds)


@router.get("/timer")
def timer_list() -> dict:
    from core.jarvis.utilities import timer as t  # noqa: PLC0415
    return {"timers": t.list_active(), "count": len(t.list_active())}


@router.delete("/timer/{timer_id}")
def timer_cancel(timer_id: int) -> dict:
    from core.jarvis.utilities import timer as t  # noqa: PLC0415
    ok = t.cancel(timer_id)
    if not ok:
        raise HTTPException(404, f"No active timer with id {timer_id}")
    return {"cancelled": timer_id}


@router.get("/clipboard/history")
def clipboard_history() -> dict:
    from core.jarvis.utilities import clipboard as c  # noqa: PLC0415
    items = c.history()
    return {"items": items, "count": len(items), "enabled": settings.clipboard_enabled}


@router.post("/clipboard/summarize")
async def clipboard_summarize(req: ClipboardSummarizeReq) -> dict:
    from core.jarvis.utilities import clipboard as c  # noqa: PLC0415
    text = req.text or c.last_text()
    if not text:
        raise HTTPException(400, "Clipboard is empty — nothing to summarize.")
    return await c.summarize(text)


@router.get("/memory")
def memory_get() -> dict:
    from core.jarvis import memory as m  # noqa: PLC0415
    return {"memory": m.get_all()}


@router.put("/memory")
def memory_replace(data: dict) -> dict:
    from core.jarvis import memory as m  # noqa: PLC0415
    return {"memory": m.replace(data)}


@router.patch("/memory")
def memory_patch(req: MemoryPatch) -> dict:
    from core.jarvis import memory as m  # noqa: PLC0415
    return {"memory": m.patch(req.key, req.value)}


# ---------------------------------------------------------------------------
# Knowledge
# ---------------------------------------------------------------------------

@router.get("/search/web")
async def search_web(q: str = Query(min_length=1, max_length=300)) -> dict:
    from core.jarvis.knowledge import web_search as ws  # noqa: PLC0415
    return await ws.search(q)


@router.get("/search/arxiv")
async def search_arxiv(
    q: str = Query(min_length=1, max_length=300),
    max: int = Query(10, ge=1, le=50),
) -> dict:
    from core.jarvis.knowledge import arxiv as ax  # noqa: PLC0415
    return await ax.search(q, max_results=max)


@router.get("/search/wikipedia")
async def search_wikipedia(q: str = Query(min_length=1, max_length=300)) -> dict:
    from core.jarvis.knowledge import wikipedia as wk  # noqa: PLC0415
    return await wk.summary(q)


@router.post("/youtube/summarize")
async def youtube_summarize(req: YouTubeReq) -> dict:
    from core.jarvis.knowledge import youtube as yt  # noqa: PLC0415
    return await yt.summarize(req.url, max_chars=req.max_chars)


@router.get("/rss/feeds")
def rss_feeds_list() -> dict:
    from core.jarvis.knowledge import rss  # noqa: PLC0415
    return {"feeds": rss.list_feeds()}


@router.post("/rss/feeds")
def rss_feeds_add(req: RssFeedReq) -> dict:
    from core.jarvis.knowledge import rss  # noqa: PLC0415
    return rss.add_feed(req.url, req.label)


@router.delete("/rss/feeds/{feed_id}")
def rss_feeds_delete(feed_id: int) -> dict:
    from core.jarvis.knowledge import rss  # noqa: PLC0415
    ok = rss.remove_feed(feed_id)
    if not ok:
        raise HTTPException(404, f"No feed with id {feed_id}")
    return {"removed": feed_id}


@router.get("/rss/items")
async def rss_items(feed: Optional[int] = None, limit: int = Query(30, ge=1, le=200)) -> dict:
    from core.jarvis.knowledge import rss  # noqa: PLC0415
    return await rss.items(feed_id=feed, limit=limit)


@router.post("/run_code")
def run_code(req: RunCodeReq) -> dict:
    from core.jarvis.knowledge import code_runner as cr  # noqa: PLC0415
    return cr.run(req.code, timeout_s=req.timeout_s)


# ---------------------------------------------------------------------------
# Power
# ---------------------------------------------------------------------------

@router.post("/launcher/open")
def launcher_open(req: LauncherReq) -> dict:
    from core.jarvis.power import launcher as ln  # noqa: PLC0415
    return ln.open_target(req.target, req.kind)


@router.post("/vision/screenshot")
async def vision_screenshot(req: ScreenshotReq) -> dict:
    from core.jarvis.power import vision as v  # noqa: PLC0415
    return await v.capture_and_query(region=req.region, query=req.query)


@router.get("/github")
def github_list() -> dict:
    from core.jarvis.power import github as gh  # noqa: PLC0415
    return gh.allowed_repos()


@router.post("/github")
def github_action(req: GithubReq) -> dict:
    from core.jarvis.power import github as gh  # noqa: PLC0415
    return gh.run_action(req.action, req.repo, req.args or {})


@router.get("/notes")
def notes_list() -> dict:
    from core.jarvis.power import notes as nt  # noqa: PLC0415
    return nt.list_vaults()


@router.post("/notes/index")
async def notes_index(req: NotesIndexReq) -> dict:
    from core.jarvis.power import notes as nt  # noqa: PLC0415
    return await nt.index_vault(req.vault_path)


@router.post("/study/generate")
async def study_generate(req: StudyGenReq) -> dict:
    from core.jarvis.power import study as st  # noqa: PLC0415
    return await st.generate(req.source_kind, req.source_id, n_cards=req.n_cards)


@router.get("/study/due")
def study_due() -> dict:
    from core.jarvis.power import study as st  # noqa: PLC0415
    return {"cards": st.due_cards()}


@router.post("/study/review")
def study_review(req: StudyReviewReq) -> dict:
    from core.jarvis.power import study as st  # noqa: PLC0415
    return st.review(req.card_id, req.quality)
