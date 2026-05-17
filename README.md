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
