"""FastAPI entry — ARIA Assistant backend.

Routes:
  GET  /health                         — Ollama + Qdrant + audit-db + VRAM
  GET  /                               — root
  POST /query                          — text → ARIA response + audit envelope
  POST /query/stream                   — SSE token stream + audit envelope
  POST /voice                          — WAV upload → transcribe + query
  POST /tts                            — text → WAV via Piper TTS
  GET  /audit/recent                   — last N AuditEnvelopes from SQLite
  GET  /eval/history                   — audit history for the Eval dashboard
  GET  /rag/papers                     — list PDFs in papers dir
  POST /rag/ingest                     — ingest server-side PDF paths
  POST /rag/upload                     — upload + ingest a PDF
  GET  /integrations/emails            — Gmail threads (503 if unconfigured)
  GET  /integrations/events            — Calendar events (503 if unconfigured)
  GET  /setup/google-oauth-instructions — OAuth2 setup guide
  WS   /ws/wake                        — push clap/hotword events to frontend
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
from fastapi import (
    FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from config.settings import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_llm: "OllamaPrimary | None" = None   # type: ignore[name-defined]
_gmail: object = None
_calendar: object = None

# Wake-event pipeline: producer thread → NOTIFICATION_QUEUE → broadcast task → per-client queues
# Notifications cover both wake events (type=wake) and toast/audit/timer events (type=notification).
# Legacy WAKE_QUEUE alias kept for any external importers.
from core.jarvis import notifications as _nfn  # noqa: E402, PLC0415
_ws_clients: list[asyncio.Queue] = _nfn._WS_CLIENTS  # alias for back-compat
_stop_clap = threading.Event()


def _get_llm():
    global _llm
    if _llm is None:
        from core.llm_engine import OllamaPrimary  # noqa: PLC0415
        _llm = OllamaPrimary()
    return _llm


def _get_gmail():
    global _gmail
    if _gmail is None:
        from integrations import google_auth  # noqa: PLC0415
        if not google_auth.credentials_configured():
            return None
        from integrations.gmail_handler import GmailHandler  # noqa: PLC0415
        try:
            _gmail = GmailHandler()
        except Exception as exc:
            log.warning("GmailHandler init failed: %s", exc)
    return _gmail


def _get_calendar():
    global _calendar
    if _calendar is None:
        from integrations import google_auth  # noqa: PLC0415
        if not google_auth.credentials_configured():
            return None
        from integrations.calendar_handler import CalendarHandler  # noqa: PLC0415
        try:
            _calendar = CalendarHandler()
        except Exception as exc:
            log.warning("CalendarHandler init failed: %s", exc)
    return _calendar


# ---------------------------------------------------------------------------
# Wake broadcast helpers
# ---------------------------------------------------------------------------

def _run_clap_detector(loop: asyncio.AbstractEventLoop) -> None:
    """Background thread: detect double-clap and publish a wake notification."""
    try:
        import sounddevice as sd   # noqa: PLC0415
        from core.wake_system import ClapDetector  # noqa: PLC0415

        detector = ClapDetector()

        def _cb(indata, frames, time_info, status):
            chunk = indata[:, 0] if indata.ndim > 1 else indata.flatten()
            if detector.process_chunk(chunk):
                _nfn.publish_threadsafe(
                    loop,
                    kind="wake", title="Wake", body="Double-clap detected",
                    severity="wake", message_type="wake",
                    meta={"source": "clap"},
                )

        with sd.InputStream(
            callback=_cb,
            channels=1,
            samplerate=16_000,
            blocksize=1_280,
            dtype="int16",
        ):
            log.info("ClapDetector: listening for double-clap")
            while not _stop_clap.is_set():
                sd.sleep(100)
    except ImportError:
        log.warning("ClapDetector: sounddevice not installed — clap wake disabled")
    except Exception as exc:
        log.warning("ClapDetector: failed to start: %s", exc)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("ARIA startup")

    # Initialise the unified notification queue + persistence DB
    _nfn.init()
    log.info("NotificationQueue ready (size=%d)", settings.notification_queue_size)

    # Bootstrap ARIA tool registry — imports every submodule once
    try:
        from core.jarvis import bootstrap as _aria_bootstrap  # noqa: PLC0415
        n_tools = _aria_bootstrap()
        log.info("ARIA tool registry: %d tools loaded", n_tools)
    except Exception as exc:  # noqa: BLE001
        log.warning("ARIA tool bootstrap failed: %s", exc)

    # Pre-warm LLM client (cheap — just creates httpx.Client)
    try:
        _get_llm()
        log.info("LLM client ready: %s", settings.llm_primary)
    except Exception as exc:
        log.warning("LLM pre-warm skipped (Ollama may be offline): %s", exc)

    # Broadcast task (unified queue → all WS clients)
    broadcast_task = asyncio.create_task(_nfn.broadcast_loop())

    # Clap detector thread
    loop = asyncio.get_event_loop()
    clap_thread = threading.Thread(
        target=_run_clap_detector, args=(loop,), daemon=True, name="clap-detector"
    )
    clap_thread.start()

    # Background RSS poller
    rss_task: asyncio.Task | None = None
    try:
        from core.jarvis.knowledge import rss as _rss  # noqa: PLC0415
        rss_task = asyncio.create_task(_rss.poll_loop())
    except Exception as exc:  # noqa: BLE001
        log.warning("RSS poller not started: %s", exc)

    # Clipboard watcher (opt-in via settings.clipboard_enabled)
    try:
        from core.jarvis.utilities import clipboard as _clip  # noqa: PLC0415
        if _clip.start_watcher(loop):
            log.info("Clipboard watcher: enabled")
    except Exception as exc:  # noqa: BLE001
        log.warning("Clipboard watcher not started: %s", exc)

    # Papers startup notice
    papers_dir = Path(settings.papers_dir)
    n_pdfs = len(list(papers_dir.glob("*.pdf"))) if papers_dir.exists() else 0
    log.info("Papers dir: %s  (%d PDFs found)", papers_dir, n_pdfs)

    yield

    log.info("ARIA shutdown")
    _stop_clap.set()
    broadcast_task.cancel()
    if rss_task:
        rss_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass
    if rss_task:
        try:
            await rss_task
        except asyncio.CancelledError:
            pass
    try:
        from core.jarvis.utilities import clipboard as _clip  # noqa: PLC0415
        _clip.stop_watcher()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------

app = FastAPI(title="ARIA Assistant", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Mount ARIA routers
# ---------------------------------------------------------------------------

try:
    from api.routes.tools import router as tools_router        # noqa: PLC0415
    from api.routes.settings import router as settings_router  # noqa: PLC0415
    app.include_router(tools_router)
    app.include_router(settings_router)
    log.info("ARIA routers mounted: /tools/* + /settings/*")
except Exception as exc:  # noqa: BLE001
    log.warning("ARIA router mount failed: %s", exc)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    prompt: str
    run_audit: bool = True
    run_equity: bool = False


class IngestRequest(BaseModel):
    paths: list[str]


class TTSRequest(BaseModel):
    text: str


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _audit_db_conn() -> sqlite3.Connection:
    db_path = Path(settings.audit_db_path)
    if not db_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Audit database not found. Run at least one query first.",
        )
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for col in (
        "retrieved_chunk_ids", "calibration_json", "faithfulness_json",
        "consistency_json", "equity_json", "attribution_json", "drift_json",
    ):
        raw = d.get(col)
        if raw:
            try:
                d[col] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def _audit(prompt: str, response: str, model: str, generate_fn) -> Optional[dict]:
    """Run aria_audit and return asdict envelope, or None on failure."""
    try:
        from aria_audit.orchestrator import audit as _do_audit   # noqa: PLC0415
        from aria_audit.storage.sqlite_logger import EnvelopeLogger  # noqa: PLC0415
        from dataclasses import asdict  # noqa: PLC0415

        Path(settings.audit_db_path).parent.mkdir(parents=True, exist_ok=True)
        db = EnvelopeLogger(settings.audit_db_path)
        env = _do_audit(
            prompt=prompt,
            response=response,
            model_name=model,
            generate_fn=generate_fn,
            db_logger=db,
        )
        db.close()
        return asdict(env)
    except Exception as exc:
        log.warning("Audit failed (non-fatal): %s", exc)
        return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root() -> dict:
    return {"message": "ARIA Assistant API. See /docs."}


@app.get("/health")
async def health() -> dict:
    """Full system health: Ollama, Qdrant, audit DB, paper count, VRAM."""
    # Ollama
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{settings.ollama_url}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        pass

    # Qdrant
    qdrant_ok = False
    try:
        from rag.qdrant_store import get_client  # noqa: PLC0415
        get_client().get_collections()
        qdrant_ok = True
    except Exception:
        pass

    # Audit DB
    audit_db_ok = Path(settings.audit_db_path).exists()

    # Papers
    pd = Path(settings.papers_dir)
    papers_indexed = len(list(pd.glob("*.pdf"))) if pd.exists() else 0

    # VRAM
    vram_used: Optional[float] = None
    vram_total: Optional[float] = None
    try:
        import torch  # noqa: PLC0415
        if torch.cuda.is_available():
            vram_used = round(torch.cuda.memory_allocated(0) / 1e9, 1)
            vram_total = round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1)
    except Exception:
        pass

    return {
        "status": "ok" if ollama_ok else "degraded",
        "ollama": ollama_ok,
        "model": settings.llm_primary,
        "qdrant": qdrant_ok,
        "audit_db": audit_db_ok,
        "papers_indexed": papers_indexed,
        "vram_used_gb": vram_used,
        "vram_total_gb": vram_total,
    }


# ------------------------------------------------------------------
# POST /query
# ------------------------------------------------------------------

@app.post("/query")
def query(req: QueryRequest) -> dict:
    """Synchronous text query + optional audit."""
    llm = _get_llm()
    t0 = time.perf_counter()
    try:
        gen = llm.generate(req.prompt)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama unavailable — run `ollama serve`: {exc}",
        ) from exc

    latency_ms = (time.perf_counter() - t0) * 1000.0
    envelope = None
    if req.run_audit:
        envelope = _audit(req.prompt, gen.text, gen.model,
                          lambda p: llm.generate(p).text)

    return {
        "response": gen.text,
        "audit_envelope": envelope,
        "sources": [],
        "latency_ms": round(latency_ms, 2),
    }


# ------------------------------------------------------------------
# POST /query/stream
# ------------------------------------------------------------------

@app.post("/query/stream")
async def query_stream(req: QueryRequest):
    """SSE token stream; final event carries audit envelope."""
    llm = _get_llm()

    async def _gen():
        tokens: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.ollama_url}/api/generate",
                    json={"model": settings.llm_primary, "prompt": req.prompt, "stream": True},
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        tok = data.get("response", "")
                        if tok:
                            tokens.append(tok)
                            yield f"data: {json.dumps({'token': tok})}\n\n"
                        if data.get("done"):
                            break
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            return

        # Run audit after full response collected
        envelope = None
        if req.run_audit and tokens:
            full = "".join(tokens)
            envelope = _audit(req.prompt, full, settings.llm_primary,
                              lambda p: llm.generate(p).text if llm else "")

        yield f"data: {json.dumps({'done': True, 'audit': envelope})}\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ------------------------------------------------------------------
# POST /voice
# ------------------------------------------------------------------

@app.post("/voice")
async def voice(file: UploadFile = File(...)) -> dict:
    """Transcribe uploaded audio, run /query, return response + transcript."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(audio_bytes)
        from core.voice_engine import VoiceEngine  # noqa: PLC0415
        transcript = VoiceEngine().transcribe(tmp)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Transcription failed: {exc}")
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass

    if not transcript:
        raise HTTPException(status_code=422, detail="Could not transcribe audio — is speech present?")

    # ── Voice tool routing — try intent dispatch before falling through to LLM
    try:
        from core.jarvis.voice_router import route as _route  # noqa: PLC0415
        routed = await _route(transcript)
    except Exception as exc:  # noqa: BLE001
        log.warning("Voice routing skipped: %s", exc)
        routed = None

    if routed and routed.get("matched"):
        return {
            "response":  routed["response"],
            "transcript": transcript,
            "intent":    routed["intent"],
            "audit_envelope": None,
            "sources":   [],
            "latency_ms": 0,
            "routed":    True,
        }

    # Fall through to standard LLM chat
    result = query(QueryRequest(prompt=transcript))
    result["transcript"] = transcript
    result["routed"] = False
    return result


# ------------------------------------------------------------------
# POST /tts
# ------------------------------------------------------------------

@app.post("/tts")
async def tts(req: TTSRequest):
    """Synthesise text with Piper TTS and return a WAV file."""
    safe = req.text.replace('"', "'").replace("\n", " ").replace("\r", " ")[:500].strip()
    if not safe:
        raise HTTPException(status_code=400, detail="Empty text.")

    fd, out = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        r = subprocess.run(
            ["piper", "--model", settings.piper_voice, "--output_file", out],
            input=safe,
            capture_output=True,
            text=True,
            timeout=20,
        )
        if r.returncode != 0:
            raise HTTPException(
                status_code=503,
                detail=f"Piper TTS failed (rc={r.returncode}): {r.stderr[:200]}",
            )
        if not os.path.exists(out) or os.path.getsize(out) == 0:
            raise HTTPException(status_code=503, detail="TTS produced no audio output.")
        return FileResponse(out, media_type="audio/wav",
                            headers={"Content-Disposition": "inline; filename=aria_tts.wav"})
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="piper not on PATH. Install: https://github.com/rhasspy/piper/releases",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=503, detail="TTS timed out.")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"TTS error: {exc}")


# ------------------------------------------------------------------
# GET /audit/recent
# ------------------------------------------------------------------

@app.get("/audit/recent")
def audit_recent(n: int = Query(default=10, ge=1, le=200)) -> dict:
    conn = _audit_db_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_envelopes ORDER BY timestamp DESC LIMIT ?", (n,)
        ).fetchall()
        return {"envelopes": [_row_to_dict(r) for r in rows], "count": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")
    finally:
        conn.close()


# ------------------------------------------------------------------
# GET /eval/history
# ------------------------------------------------------------------

@app.get("/eval/history")
def eval_history(n: int = Query(default=100, ge=1, le=1000)) -> dict:
    """Audit run history for the Evaluation dashboard."""
    conn = _audit_db_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_envelopes ORDER BY timestamp DESC LIMIT ?", (n,)
        ).fetchall()
        return {"runs": [_row_to_dict(r) for r in rows], "count": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")
    finally:
        conn.close()


# ------------------------------------------------------------------
# GET /rag/papers
# ------------------------------------------------------------------

@app.get("/rag/papers")
def rag_papers() -> dict:
    pd = Path(settings.papers_dir)
    if not pd.exists():
        return {"papers": [], "papers_dir": str(pd)}
    papers = [
        {"filename": p.name, "size_kb": round(p.stat().st_size / 1024, 1), "ingested": True}
        for p in sorted(pd.iterdir()) if p.suffix.lower() == ".pdf"
    ]
    return {"papers": papers, "papers_dir": str(pd)}


# ------------------------------------------------------------------
# POST /rag/ingest
# ------------------------------------------------------------------

@app.post("/rag/ingest")
def rag_ingest(req: IngestRequest) -> dict:
    if not req.paths:
        raise HTTPException(status_code=400, detail="No paths provided.")
    try:
        from rag.ingest import ingest_pdf  # noqa: PLC0415
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"RAG ingest unavailable: {exc}")

    results: dict[str, int] = {}
    for path in req.paths:
        p = Path(path)
        try:
            results[p.name] = ingest_pdf(str(p)) if p.exists() else -1
        except Exception as exc:
            log.warning("ingest_pdf failed for %s: %s", path, exc)
            results[p.name] = -1
    return {"results": results}


# ------------------------------------------------------------------
# POST /rag/upload  (browser file upload → ingest)
# ------------------------------------------------------------------

@app.post("/rag/upload")
async def rag_upload(file: UploadFile = File(...)) -> dict:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted.")
    pd = Path(settings.papers_dir)
    pd.mkdir(parents=True, exist_ok=True)
    dest = pd / file.filename
    dest.write_bytes(await file.read())
    chunks = 0
    try:
        from rag.ingest import ingest_pdf  # noqa: PLC0415
        chunks = ingest_pdf(str(dest))
    except Exception as exc:
        log.warning("rag_upload: ingest_pdf failed: %s", exc)
    return {"filename": file.filename, "chunks_added": chunks, "path": str(dest)}


# ------------------------------------------------------------------
# GET /integrations/emails
# ------------------------------------------------------------------

@app.get("/integrations/emails")
def integrations_emails(n: int = Query(default=8, ge=1, le=50)) -> dict:
    from integrations import google_auth  # noqa: PLC0415
    if not google_auth.credentials_configured():
        raise HTTPException(
            status_code=503,
            detail=f"Gmail not configured. Place credentials.json at: {google_auth.CREDENTIALS_PATH}",
        )
    handler = _get_gmail()
    if handler is None:
        raise HTTPException(status_code=503, detail="Gmail handler failed to initialise.")
    return {"threads": handler.list_threads(max_results=n), "count": n}


# ------------------------------------------------------------------
# GET /integrations/events
# ------------------------------------------------------------------

@app.get("/integrations/events")
def integrations_events(date: str = Query(default="today")) -> dict:
    from integrations import google_auth  # noqa: PLC0415
    if not google_auth.credentials_configured():
        raise HTTPException(
            status_code=503,
            detail=f"Calendar not configured. Place credentials.json at: {google_auth.CREDENTIALS_PATH}",
        )
    handler = _get_calendar()
    if handler is None:
        raise HTTPException(status_code=503, detail="Calendar handler failed to initialise.")
    events = handler.get_events(date=date)
    return {"events": events, "date": date, "count": len(events)}


# ------------------------------------------------------------------
# GET /setup/google-oauth-instructions
# ------------------------------------------------------------------

@app.get("/setup/google-oauth-instructions")
def google_oauth_instructions() -> dict:
    from integrations import google_auth  # noqa: PLC0415
    return {
        "step_1": "Go to https://console.cloud.google.com",
        "step_2": "Create project → Enable Gmail API + Calendar API",
        "step_3": "OAuth2 credentials → Desktop app type → Download JSON",
        "step_4": f"Save credentials.json to: {google_auth.CREDENTIALS_PATH}",
        "step_5": "Restart ARIA backend — browser will open for OAuth consent",
        "credentials_path": str(google_auth.CREDENTIALS_PATH),
        "status": "configured" if google_auth.credentials_configured() else "not_configured",
    }


# ------------------------------------------------------------------
# WS /ws/wake
# ------------------------------------------------------------------

@app.websocket("/ws/wake")
async def wake_ws(websocket: WebSocket):
    """Unified push channel: wake events + toast notifications.

    Frontend WS handler switches on `event.type`:
      - "wake"          → trigger voice orb
      - "notification"  → render toast + bump bell badge
      - "ping"          → keep-alive only
    """
    await websocket.accept()
    q: asyncio.Queue = asyncio.Queue()
    _nfn.register_client(q)
    log.info("WS client connected (%d total)", _nfn.client_count())
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=25.0)
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _nfn.unregister_client(q)
        log.info("WS client disconnected (%d remaining)", _nfn.client_count())


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn  # noqa: PLC0415
    uvicorn.run("api.main:app", host=settings.api_host, port=settings.api_port, reload=False)
