"""YouTube transcript → LLM summary. No API key needed.

Uses youtube-transcript-api to pull the auto-generated or human-provided
captions, truncates to `max_chars`, and runs the result through the primary
LLM (audit-instrumented).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

_VIDEO_ID = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([A-Za-z0-9_-]{11})")


def _extract_id(url: str) -> str | None:
    m = _VIDEO_ID.search(url)
    if m:
        return m.group(1)
    if len(url) == 11 and re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return url
    return None


async def summarize(url: str, max_chars: int = 4000) -> dict[str, Any]:
    vid = _extract_id(url)
    if not vid:
        return {"ok": False, "error": "Could not extract a valid YouTube video id from URL.",
                "url": url}

    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # noqa: PLC0415
        try:
            transcript_obj = YouTubeTranscriptApi.get_transcript(vid)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"No transcript: {exc}", "video_id": vid}
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "youtube-transcript-api not installed", "video_id": vid}

    transcript = " ".join(seg.get("text", "") for seg in transcript_obj)
    transcript = re.sub(r"\s+", " ", transcript).strip()
    truncated = transcript[:max_chars]

    prompt = (
        "Summarize the following YouTube video transcript in 5 concise bullet "
        "points. End with one sentence on the main takeaway.\n\nTranscript:\n"
        + truncated
    )

    try:
        from api.main import _get_llm, _audit  # noqa: PLC0415
        llm = _get_llm()
        result = llm.generate(prompt)
        summary_text = result.text
        envelope = _audit(prompt, summary_text, result.model, lambda p: llm.generate(p).text)
    except Exception as exc:  # noqa: BLE001
        log.warning("YouTube summarize LLM failed: %s", exc)
        return {"ok": False, "error": str(exc), "transcript_length": len(transcript)}

    return {
        "ok": True,
        "video_id": vid,
        "transcript_length": len(transcript),
        "truncated_to": len(truncated),
        "summary": summary_text,
        "audit_envelope": envelope,
        "source": "youtube",
    }


register(JarvisTool(
    name="youtube_summarize",
    category="knowledge",
    description="Fetch a YouTube transcript and summarize it with the primary LLM.",
    handler=summarize,
    schema={"type": "object",
            "properties": {"url": {"type": "string"}, "max_chars": {"type": "integer"}},
            "required": ["url"]},
    requires_audit=True,
    voice_phrases=("ARIA, summarize this YouTube video ...",),
))
