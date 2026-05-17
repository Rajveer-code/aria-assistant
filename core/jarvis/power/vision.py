"""Screenshot + LLaVA vision query via Ollama.

`region`: optional [left, top, width, height]. If omitted, full primary monitor.
LLaVA model name from settings.llava_model.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Any

import httpx

from config.settings import settings
from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)


def _capture_png(region: list[int] | None = None) -> bytes:
    try:
        import mss  # noqa: PLC0415
        from PIL import Image  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"mss/Pillow not installed: {exc}")

    with mss.mss() as sct:
        if region and len(region) == 4:
            left, top, width, height = region
            monitor = {"left": int(left), "top": int(top), "width": int(width), "height": int(height)}
        else:
            monitor = sct.monitors[1]   # primary
        raw = sct.grab(monitor)
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()


async def capture_and_query(region: list[int] | None = None,
                            query: str | None = None) -> dict[str, Any]:
    """Take a screenshot, send it to LLaVA via Ollama, return its description."""
    try:
        png = _capture_png(region)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}

    prompt = query or "Describe in detail what is shown on this screen."
    body = {
        "model": settings.llava_model,
        "prompt": prompt,
        "images": [base64.b64encode(png).decode()],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(f"{settings.ollama_url}/api/generate", json=body)
            r.raise_for_status()
            data = r.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("Ollama LLaVA call failed: %s", exc)
        return {"ok": False, "error": str(exc),
                "hint": f"Run `ollama pull {settings.llava_model}` first."}

    answer = data.get("response", "").strip()

    # Audit-instrument the call (text-only proxy: prompt + answer, no context)
    envelope = None
    try:
        from api.main import _get_llm, _audit  # noqa: PLC0415
        llm = _get_llm()
        envelope = _audit(prompt, answer, settings.llava_model,
                          lambda p: llm.generate(p).text)
    except Exception as exc:  # noqa: BLE001
        log.debug("Vision audit skipped: %s", exc)

    return {
        "ok": True,
        "model": settings.llava_model,
        "answer": answer,
        "image_size_bytes": len(png),
        "audit_envelope": envelope,
    }


register(JarvisTool(
    name="screenshot_vision",
    category="power",
    description=("Take a screenshot of the user's screen and ask LLaVA about it. "
                 "Optional `query` defaults to 'describe this screen'."),
    handler=capture_and_query,
    schema={"type": "object",
            "properties": {"region": {"type": "array", "items": {"type": "integer"}},
                           "query": {"type": "string"}}},
    requires_audit=True,
    voice_phrases=("ARIA, what's on my screen", "ARIA, describe this window"),
))
