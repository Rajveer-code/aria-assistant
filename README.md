<div align="center">

<h1>ARIA Assistant</h1>

<p><em>A local-first research assistant that audits its own answers.</em></p>

[![Python](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Powered by](https://img.shields.io/badge/LLM-Qwen3%208B%20Q4__K__M-orange?style=flat-square)](https://ollama.com)
[![Audit](https://img.shields.io/badge/fairness%20audit-5--axis%20CPFE-blueviolet?style=flat-square)](https://github.com/Rajveer-code/aria-audit)

</div>

---

> **This repo is a personal-utility frontend.** The publishable research contribution lives in
> [aria-audit](https://github.com/Rajveer-code/aria-audit) — the runtime five-axis fairness audit
> harness. Every response in the dashboard is instrumented with a live `AuditEnvelope`.

---

## What it does

```
You speak → ARIA listens → retrieves from your papers → answers → audits itself
               │                                              │
          faster-whisper                              AuditEnvelope
          distil-large-v3                         (5-axis CPFE scores)
                                                   shown live in dashboard
```

Every single response is scored on five axes **before it reaches you.** If equity drops below threshold, the response is flagged — not silently shown.

---

## Features

| Category | What's included |
|---|---|
| 🧠 **LLM** | Qwen3 8B Q4\_K\_M via Ollama · Phi-4-mini co-pilot on CPU |
| 🎤 **Voice** | Wake word detection (openWakeWord) · faster-whisper STT · Piper TTS |
| 📚 **RAG** | Hybrid dense + sparse (BGE-M3 + BM25) · RRF fusion · BGE-reranker · Contextual Retrieval |
| 🔍 **Visual RAG** | ColQwen2 offline figure/table indexing for paper PDFs |
| 📬 **Email** | Gmail OAuth2 — read, summarize, draft replies |
| 📅 **Calendar** | Google Calendar OAuth2 — view and create events |
| 📊 **Audit dashboard** | Live 5-axis radar · per-axis sparklines · drift detection · baseline comparison |
| 💾 **Local-only** | Zero cloud calls for LLM/STT/TTS/embeddings — Ollama + local models |

---

## Dashboard pages

| Page | What you see |
|---|---|
| **01 · Audit Engine** | Live pentagon radar · per-axis scores · drift bar · Granite Guardian comparison |
| **02 · Conversation** | Chat with citation popups · live audit envelope sidebar · persisted history |
| **03 · Inbox** | Gmail threads · auto-summarized with ARIA · OAuth setup guide |
| **04 · Calendar** | Today's events from Google Calendar · week-view grid |
| **05 · Evaluation** | Full audit history from SQLite · sparkline trends · CSV export |
| **06 · Papers** | RAG corpus · BGE-M3 chunk counts · PDF upload + real-time indexing |
| **07 · Daily** | Weather · system stats · timers · clipboard · persistent memory |
| **08 · Knowledge** | Web · arXiv · Wikipedia · YouTube summarizer · RSS · Python runner |
| **09 · Power** | App launcher · screenshot+LLaVA · GitHub · Obsidian RAG · flashcards (SM-2) |
| **10 · Settings** | Effective config + persisted overrides · per-key edit · restart hints |

## Jarvis tool layer

ARIA is voice-driven and tool-routed. Every feature below is both a clickable card and a voice phrase:

| Voice phrase | Tool | Notes |
|---|---|---|
| *"ARIA, weather in Pune"* | `weather` | wttr.in, no API key |
| *"ARIA, system stats"* | `system_stats` | psutil + pynvml live |
| *"ARIA, set a 25 minute pomodoro"* | `timer` | toast + native notification on expiry |
| *"ARIA, summarize my clipboard"* | `clipboard_summarize` | opt-in via Settings → Jarvis |
| *"ARIA, remember my favourite city is Pune"* | `memory.patch` | JSON sidecar, persists across restart |
| *"ARIA, search the web for X"* | `web_search` | DuckDuckGo HTML scrape |
| *"ARIA, find papers on X"* | `arxiv_search` | Free Atom API |
| *"ARIA, look up X on Wikipedia"* | `wikipedia` | REST summary endpoint |
| *"ARIA, summarize this YouTube video"* | `youtube_summarize` | transcript → LLM, audit-instrumented |
| *"ARIA, what is new on arXiv today"* | `rss_items` | Background poller, notifications on new items |
| *(REPL card)* | `run_code` | Subprocess Python, 8-second timeout |
| *"ARIA, open VS Code"* | `open_app` | Allowlisted app/file/URL launcher |
| *"ARIA, what is on my screen"* | `screenshot_vision` | `mss` + Ollama `llava:7b` |
| *"ARIA, list PRs on aria-audit"* | `github` | Read-only `gh` CLI, repo allowlist |
| *(Power → Obsidian)* | `index_vault` | Indexes a Markdown vault into existing Qdrant |
| *"ARIA, make flashcards from CPFE paper"* | `study_generate` | SM-2 spaced repetition, audit-instrumented |

**Trigger model:** every voice query is matched against `core/jarvis/voice_router.py` patterns first. On match, the tool runs (sub-second for most). On miss, falls through to standard LLM chat with full audit envelope.

**Notifications:** unified `/ws/wake` channel pushes `{type:'wake'|'notification'}` events. The header bell badge shows unread count; bottom-right toast stack auto-dismisses after 6 s; native OS notifications fire via `plyer`.

---

## Hardware requirements

Tested on **Windows 11 · RTX 4060 8 GB · 16 GB RAM**.

| Model | VRAM | Load strategy |
|---|---|---|
| Qwen3 8B Q4\_K\_M | ~5.6 GB | Always resident |
| BGE-M3 (batch=8) | ~1.1 GB | Load → embed → unload |
| HHEM 2.1 DeBERTa | ~0.9 GB | Load → score → unload |
| faster-whisper distil-large-v3 | ~1.5 GB | Load → transcribe → unload |
| Phi-4-mini 3.8B Q4 | 0 GB (CPU) | CPU only |
| ColQwen2 | ~3.5 GB | **Offline ingest only** — never live |

**GPUManager** enforces mutual exclusion: Qwen3 8B is always-resident; at most one aux model co-resident at a time. Peak ceiling: **7.1 GB** on an 8 GB card.

---

## Setup

### Prerequisites

```bash
# 1. Ollama (https://ollama.com)
ollama pull qwen3:8b-q4_K_M

# 2. Qdrant (https://qdrant.tech/documentation/quick-start/)
docker run -p 6333:6333 qdrant/qdrant

# 3. aria-audit (the audit library)
pip install aria-audit
# or from source:
git clone https://github.com/Rajveer-code/aria-audit
pip install -e aria-audit
```

### Install & start

```bash
git clone https://github.com/Rajveer-code/aria-assistant
cd aria-assistant

# Backend
pip install -r requirements.txt
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # dev server on http://localhost:5173
# or: npm run build  # production build → dist/
```

Or use the PowerShell launcher:

```powershell
.\start.ps1
```

### Gmail + Calendar (optional)

1. [Create a Google Cloud project](https://console.cloud.google.com/) → Enable Gmail API + Google Calendar API
2. Download `credentials.json` → place in `integrations/credentials.json`
3. First run will open a browser OAuth flow; token saved to `integrations/token.json`

If you skip this step, the Inbox and Calendar pages show demo data.

---

## Ingest your papers

```bash
# Drop PDFs in rag/papers/
cp my_paper.pdf rag/papers/

# Ingest (BGE-M3 dense + BM25 sparse, Contextual Retrieval blurbs via Phi-4-mini)
python -m rag.ingest

# One-time ColPali figure indexing (GPU — run once, then exit)
python rag/colpali_offline_ingest.py
```

Or upload directly from the Papers page in the dashboard.

---

## Architecture

```
┌──────── Browser (React + Vite) ─────────────────────────────┐
│  AuditEngine  ·  PageChat  ·  PageEmail  ·  PageCalendar    │
│  PageEval     ·  PagePapers                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST + SSE + WebSocket
┌──────── FastAPI (api/main.py) ──────────────────────────────┐
│  /query/stream  SSE token stream + audit envelope           │
│  /voice         WAV upload → transcribe + query             │
│  /rag/*         papers list + PDF upload + ingest           │
│  /integrations/* Gmail + Calendar (503 if unconfigured)     │
│  /ws/wake       WebSocket push for wake-word events         │
└─────┬──────────┬──────────┬──────────┬──────────────────────┘
      │          │          │          │
   Ollama    aria_audit   Qdrant   Google APIs
  (Qwen3)   (5-axis)    (RAG DB)  (Gmail/Cal)
```

---

## Security disclaimer

`smolagents` `LocalPythonExecutor` provides **best-effort mitigations only** and is not a security boundary. ARIA Assistant executes LLM-generated Python tool-calls in the same process. It is designed for **single-user, personal use on your own hardware with your own prompts only.** Do not expose the tool interface to remote inputs.

---

## Relation to aria-audit

```
aria-assistant  ──imports──►  aria-audit
(personal tool)               (research artifact)

The assistant demos the audit in a real usage context.
The audit package is independently pip-installable and citable.
This repo makes no research claims beyond "it works as a demo."
```

---

## License

MIT · **Rajveer Singh Pall** · `rajveerpall04@gmail.com`

Research package: [Rajveer-code/aria-audit](https://github.com/Rajveer-code/aria-audit) · HF dataset: [rajveerpall/aria-audit-bench](https://huggingface.co/datasets/rajveerpall/aria-audit-bench)
