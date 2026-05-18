<div align="center">

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=13&pause=1000&color=7C3AED&center=true&vCenter=true&width=600&lines=Local-first+personal+AI+assistant;Answers+every+question+with+a+fairness+audit;Voice-driven+%C2%B7+RAG-powered+%C2%B7+Zero+cloud+LLM+calls" alt="Typing SVG" />

# ARIA Assistant

**A personal AI that answers, retrieves, audits — all on your own hardware.**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

[![Ollama](https://img.shields.io/badge/LLM-Qwen3%208B%20Q4__K__M-f97316?style=for-the-badge)](https://ollama.com)
[![Audit](https://img.shields.io/badge/Audit-5--Axis%20CPFE-7c3aed?style=for-the-badge)](https://github.com/Rajveer-code/aria-audit)
[![RAG](https://img.shields.io/badge/RAG-BGE--M3%20%2B%20BM25-0ea5e9?style=for-the-badge)](https://github.com/FlagAI-Open/FlagEmbedding)

<br/>

> **Built as the live demo for [`aria-audit`](https://github.com/Rajveer-code/aria-audit)** —
> a runtime five-axis fairness audit harness for locally-deployed LLMs.
> Every single response ARIA gives is scored on Calibration · Faithfulness · Consistency · Equity · Attribution
> **before it reaches you.**

<br/>

</div>

---

## ✦ What makes ARIA different

Most local AI setups are a chat box on top of Ollama. ARIA goes further on two axes:

**1 · It audits itself.** Every response generates a live `AuditEnvelope` — a structured fairness score across five dimensions. If equity drops below threshold, the response is flagged. Not silently shown.

**2 · It acts like a personal assistant.** 16 voice-triggered tools let you search the web, summarize YouTube videos, track timers, query arXiv, vision-analyze your screen, generate flashcards, and more — all from a single voice command, all for free.

```
  You speak
      │
      ▼
  faster-whisper (STT)
      │
      ▼
  Voice Router ──── tool matched? ──────► execute tool ──► Piper TTS ──► you hear it
      │                                                         │
      │ no match                                       audit if LLM used
      ▼
  smolagents CodeAgent
      │
      ▼
  Qwen3 8B (Ollama) ──► RAG retrieval (BGE-M3 + BM25) ──► answer
      │
      ▼
  AuditEnvelope (5-axis CPFE scores) ──► dashboard radar ──► you see it
```

---

## ✦ Feature overview

<table>
<tr>
<td width="50%">

### 🧠 Intelligence
| | |
|---|---|
| **LLM** | Qwen3 8B Q4\_K\_M via Ollama |
| **Co-pilot** | Phi-4-mini 3.8B on CPU |
| **RAG** | BGE-M3 dense + BM25 sparse + RRF fusion |
| **Reranker** | BGE-reranker + Contextual Retrieval |
| **Vision** | ColQwen2 offline figure indexing |
| **Screen AI** | LLaVA 7B via Ollama on demand |

### 🎤 Voice
| | |
|---|---|
| **Wake word** | openWakeWord (custom phrase) |
| **STT** | faster-whisper distil-large-v3 |
| **TTS** | Piper (local, no API key) |
| **VAD** | Silero VAD |

</td>
<td width="50%">

### 📡 Integrations
| | |
|---|---|
| **Email** | Gmail OAuth2 — read, summarize, draft |
| **Calendar** | Google Calendar — view + create |
| **GitHub** | Read-only `gh` CLI (PR / issue list) |
| **RSS** | Background feed poller |
| **Web** | DuckDuckGo + arXiv + Wikipedia + YouTube |

### ⚖️ Audit
| | |
|---|---|
| **Framework** | `aria-audit` (separate pip package) |
| **Axes** | Calibration · Faithfulness · Consistency · Equity · Attribution |
| **Drift** | Page-Hinkley CUSUM streaming |
| **Storage** | SQLite per-response log |

</td>
</tr>
</table>

---

## ✦ 10-page dashboard

```
┌─────────────────── WORKSPACE ────────────────────┐
│  01  Audit Engine     Live 5-axis radar · drift bar · baseline comparison
│  02  Conversation     RAG chat · citation popups · persisted history
│  03  Inbox            Gmail threads · ARIA-summarized · OAuth guide
│  04  Calendar         Google Calendar events · week view
├─────────────────── RESEARCH ─────────────────────┤
│  05  Evaluation       Full audit history · sparklines · CSV export
│  06  Papers           Corpus manager · BGE-M3 chunks · PDF upload
├─────────────────── TOOLS ────────────────────────┤
│  07  Daily            Weather · live stats · timers · clipboard · memory
│  08  Knowledge        Web · arXiv · Wikipedia · YouTube · RSS · REPL
│  09  Power            Launcher · screen vision · GitHub · Obsidian · flashcards
├─────────────────── SYSTEM ───────────────────────┤
│  10  Settings         Effective config · per-key overrides · restart hints
└──────────────────────────────────────────────────┘
```

---

## ✦ 16 voice-triggered tools

Speak to ARIA → tool runs → spoken response back. Every tool is also a clickable card in the dashboard.

| # | Say this | What happens |
|---|---|---|
| 1 | *"ARIA, weather in Pune"* | wttr.in forecast, no API key needed |
| 2 | *"ARIA, system stats"* | Live CPU / GPU / RAM / disk via psutil + pynvml |
| 3 | *"ARIA, set a 25-minute pomodoro"* | Countdown timer → toast + native OS notification |
| 4 | *"ARIA, summarize my clipboard"* | Clipboard → LLM summary → audit envelope |
| 5 | *"ARIA, remember my city is Pune"* | Key-value persisted to `~/.aria/memory.json` |
| 6 | *"ARIA, search the web for X"* | DuckDuckGo HTML scrape, no API key |
| 7 | *"ARIA, find papers on X"* | arXiv Atom API — title + abstract cards |
| 8 | *"ARIA, look up X on Wikipedia"* | Wikipedia REST summary endpoint |
| 9 | *"ARIA, summarize this YouTube video"* | Transcript → LLM summary → audit-instrumented |
| 10 | *"ARIA, what's new in my RSS feeds"* | Background-polled feed items |
| 11 | *(REPL card)* | Python code runner via `subprocess`, 8 s timeout |
| 12 | *"ARIA, open VS Code"* | Allowlisted app / file / URL launcher |
| 13 | *"ARIA, what's on my screen"* | `mss` screenshot → LLaVA 7B → description |
| 14 | *"ARIA, list PRs on aria-audit"* | Read-only `gh` CLI, repo allowlist enforced |
| 15 | *(Power → Add vault)* | Markdown vault → Qdrant RAG collection |
| 16 | *"ARIA, make flashcards from the CPFE paper"* | SM-2 spaced repetition · audit-instrumented |

> **How routing works:** voice transcript hits `core/jarvis/voice_router.py` pattern matching first. Sub-second for matched tools. On no match, falls through to the full LLM + RAG pipeline with audit envelope.

---

## ✦ Hardware

Tested on **Windows 11 · RTX 4060 8 GB · 16 GB RAM**

| Model | Role | VRAM |
|---|---|---|
| Qwen3 8B Q4\_K\_M | Primary LLM — always resident | ~5.6 GB |
| BGE-M3 | Dense embeddings — load → embed → unload | ~1.1 GB |
| HHEM 2.1 DeBERTa-large | Faithfulness audit — load → score → unload | ~0.9 GB |
| faster-whisper distil-large-v3 | STT — load → transcribe → unload | ~1.5 GB |
| Phi-4-mini 3.8B Q4 | Context blurb generation — CPU only | 0 GB |
| ColQwen2 | Figure indexing — **offline ingest only** | ~3.5 GB |
| LLaVA 7B | Screen vision — on-demand via Ollama | ~5.0 GB |

**GPUManager** enforces mutual exclusion. Qwen3 8B is always-resident; at most one aux model co-resident at a time. **Peak ceiling ≤ 7.1 GB** on a standard 8 GB card.

---

## ✦ Setup

### Step 1 — Prerequisites

```bash
# Ollama  (https://ollama.com)
ollama pull qwen3:8b-q4_K_M
ollama pull llava:7b              # for screen vision (optional)

# Qdrant  (https://qdrant.tech)
docker run -p 6333:6333 qdrant/qdrant

# aria-audit  (the fairness audit library)
pip install aria-audit
# or from source:
git clone https://github.com/Rajveer-code/aria-audit && pip install -e aria-audit
```

### Step 2 — Install & run

```bash
git clone https://github.com/Rajveer-code/aria-assistant
cd aria-assistant

# Backend
pip install -r requirements.txt
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

Or use the one-shot launcher:

```powershell
.\start.ps1
```

### Step 3 — Ingest your papers

```bash
# Drop PDFs into rag/papers/
cp my_paper.pdf rag/papers/

# Ingest: BGE-M3 dense + BM25 sparse + Contextual Retrieval blurbs
python -m rag.ingest

# One-time figure indexing with ColQwen2 (GPU — run once, slow)
python rag/colpali_offline_ingest.py
```

Or drag-and-drop directly from the **Papers** page.

### Step 4 — Gmail & Calendar (optional)

1. [Google Cloud Console](https://console.cloud.google.com/) → enable Gmail API + Google Calendar API
2. Download `credentials.json` → place in `integrations/credentials.json`
3. First run opens an OAuth browser flow; token saved to `integrations/token.json`

If skipped, Inbox and Calendar pages show graceful 503 with setup instructions.

---

## ✦ Architecture

```
┌──────────────────── Browser  (React 18 + Vite) ────────────────────────┐
│  01·Audit  02·Chat  03·Inbox  04·Calendar  05·Eval   06·Papers          │
│  07·Daily  08·Knowledge       09·Power     10·Settings                  │
└───────────────────────────┬────────────────────────────────────────────┘
                            │  HTTP REST · SSE streaming · WebSocket
┌──────────────────── FastAPI backend ───────────────────────────────────┐
│  /query/stream   SSE token stream + live AuditEnvelope                 │
│  /voice          WAV upload → STT → route → respond → TTS              │
│  /rag/*          papers list · PDF upload · real-time ingest           │
│  /integrations/* Gmail + Calendar  (503 when not configured)           │
│  /tools/*        16 ARIA tools across Utilities / Knowledge / Power    │
│  /ws/wake        WebSocket push — wake events + toast notifications    │
└──────┬───────────┬───────────┬────────────┬────────────┬───────────────┘
       │           │           │            │            │
    Ollama     aria-audit   Qdrant     Google APIs   core/jarvis
   (Qwen3)    (5-axis)     (RAG DB)   (Gmail/Cal)   (tool registry)
```

---

## ✦ Security note

`smolagents` `LocalPythonExecutor` is **best-effort sandboxing, not a security boundary.** ARIA runs LLM-generated Python tool-calls in the same process. Designed for **single-user, personal use on your own machine with your own prompts.** Never expose the `/tools/*` endpoints to remote or untrusted inputs.

---

## ✦ Relation to aria-audit

```
aria-assistant  ──uses──►  aria-audit
(personal tool)            (research artifact, independently pip-installable)

ARIA assistant is the live demo environment for the audit harness.
It makes no independent research claims.
The citable contribution is in the aria-audit package.
```

---

<div align="center">

MIT License · **Rajveer Singh Pall** · `rajveerpall04@gmail.com`

[aria-audit research package](https://github.com/Rajveer-code/aria-audit) · [aria-audit-bench dataset](https://huggingface.co/datasets/rajveerpall/aria-audit-bench)

</div>
