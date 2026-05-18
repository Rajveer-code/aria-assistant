"""Flashcards with SM-2 spaced repetition.

Cards live in a SQLite DB at `settings.flashcards_db`. Generation calls the
primary LLM and audit-instruments the output (faithfulness check ensures
the cards are grounded in the source text).
"""

from __future__ import annotations

import json
import logging
import math
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

from config.settings import settings
from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source_kind  TEXT NOT NULL,        -- 'paper' | 'text' | 'topic'
    source_id    TEXT NOT NULL,
    question     TEXT NOT NULL,
    answer       TEXT NOT NULL,
    interval_d   REAL NOT NULL DEFAULT 0.0,
    ease         REAL NOT NULL DEFAULT 2.5,
    reps         INTEGER NOT NULL DEFAULT 0,
    due_ts       REAL NOT NULL,
    created_ts   REAL NOT NULL,
    audit_json   TEXT
);
CREATE INDEX IF NOT EXISTS cards_due_idx ON cards(due_ts);
"""


def _db() -> sqlite3.Connection:
    p = Path(settings.flashcards_db).expanduser().resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p)
    conn.executescript(_SCHEMA)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

_GEN_PROMPT = (
    "Generate exactly {n} flashcards from the following source. "
    "Each card must be a clear question and a concise factual answer. "
    "Output ONLY a JSON array, like:\n"
    '[{"q": "...", "a": "..."}]\n\nSource:\n{src}'
)


async def generate(source_kind: str, source_id: str, n_cards: int = 10) -> dict[str, Any]:
    if source_kind not in ("paper", "text", "topic"):
        return {"ok": False, "error": "source_kind must be paper|text|topic"}

    # Resolve source text
    if source_kind == "text":
        source_text = source_id[:6000]
    elif source_kind == "topic":
        source_text = f"Generate flashcards about the topic: {source_id}"
    else:  # paper
        path = Path(settings.papers_dir) / source_id
        if not path.exists():
            return {"ok": False, "error": f"Paper not found: {path}"}
        try:
            import pymupdf  # noqa: PLC0415
            doc = pymupdf.open(str(path))
            source_text = "\n".join(p.get_text() for p in doc)[:6000]
            doc.close()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"PDF read failed: {exc}"}

    prompt = _GEN_PROMPT.format(n=int(n_cards), src=source_text)

    try:
        from api.main import _get_llm, _audit  # noqa: PLC0415
        llm = _get_llm()
        result = llm.generate(prompt)
        raw = result.text
        envelope = _audit(prompt, raw, result.model, lambda p: llm.generate(p).text)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"LLM failed: {exc}"}

    # Parse JSON; strip code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    try:
        cards = json.loads(cleaned)
        if not isinstance(cards, list):
            raise ValueError("not a list")
    except Exception:
        return {"ok": False, "error": "LLM did not return valid JSON",
                "raw": raw[:500], "audit_envelope": envelope}

    now = time.time()
    # SM-2 initial interval: first review due after 1 day (not immediately)
    first_due = now + 86_400
    inserted_ids: list[int] = []
    with _db() as conn:
        for c in cards[:int(n_cards)]:
            q = (c.get("q") or c.get("question") or "").strip()
            a = (c.get("a") or c.get("answer") or "").strip()
            if not q or not a:
                continue
            cur = conn.execute(
                "INSERT INTO cards(source_kind,source_id,question,answer,due_ts,created_ts,audit_json) "
                "VALUES (?,?,?,?,?,?,?)",
                (source_kind, source_id, q, a, first_due, now, json.dumps(envelope or {})),
            )
            inserted_ids.append(cur.lastrowid)
        conn.commit()

    return {
        "ok": True,
        "source": {"kind": source_kind, "id": source_id},
        "inserted_ids": inserted_ids,
        "count": len(inserted_ids),
        "audit_envelope": envelope,
    }


# ---------------------------------------------------------------------------
# Review (SM-2)
# ---------------------------------------------------------------------------

def due_cards(limit: int = 50) -> list[dict[str, Any]]:
    now = time.time()
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, source_kind, source_id, question, answer, interval_d, ease, reps, due_ts "
            "FROM cards WHERE due_ts <= ? ORDER BY due_ts ASC LIMIT ?",
            (now, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def review(card_id: int, quality: int) -> dict[str, Any]:
    quality = max(0, min(5, int(quality)))
    now = time.time()
    with _db() as conn:
        row = conn.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
        if not row:
            return {"ok": False, "error": f"Card {card_id} not found"}

        ease = float(row["ease"])
        interval_d = float(row["interval_d"])
        reps = int(row["reps"])

        # SM-2 algorithm (Piotr Wozniak)
        if quality < 3:
            reps = 0
            interval_d = 1.0  # restart with 1 day
        else:
            if reps == 0:
                interval_d = 1.0
            elif reps == 1:
                interval_d = 6.0
            else:
                interval_d = interval_d * ease
            reps += 1
            ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
            ease = max(1.3, ease)

        due_ts = now + interval_d * 86_400
        conn.execute(
            "UPDATE cards SET interval_d=?, ease=?, reps=?, due_ts=? WHERE id=?",
            (interval_d, ease, reps, due_ts, card_id),
        )
        conn.commit()

    return {
        "ok": True,
        "card_id": card_id,
        "quality": quality,
        "interval_d": round(interval_d, 2),
        "ease": round(ease, 2),
        "reps": reps,
        "next_due_ts": due_ts,
    }


register(JarvisTool(
    name="study_generate",
    category="power",
    description=("Generate flashcards from a paper, free text, or topic. "
                 "Stored in SQLite with SM-2 spaced repetition."),
    handler=generate,
    schema={"type": "object",
            "properties": {"source_kind": {"type": "string"},
                           "source_id": {"type": "string"},
                           "n_cards": {"type": "integer"}},
            "required": ["source_kind", "source_id"]},
    requires_audit=True,
    voice_phrases=("ARIA, make flashcards from the CPFE paper",),
))
