# ARIA Assistant

A local-first conversational assistant on RTX 4060 8GB. Voice in / voice out,
RAG over the author's research papers, Gmail + Calendar utilities.

> **Research framing for this repo:** This is a usability frontend.
> The publishable research contribution lives in
> [aria-audit](https://github.com/Rajveer-code/aria-audit) — the runtime
> five-axis fairness audit. Every response shown in the dashboard is
> instrumented with an `AuditEnvelope` from that package.

## Stack

| Layer | Choice |
|-------|--------|
| LLM (primary) | Qwen3 8B Q4_K_M via Ollama (always-resident, ~5.6 GB VRAM) |
| LLM (co-pilot) | Phi-4-mini 3.8B Q4 — **CPU only** via `llama-cpp-python` |
| Embeddings | BGE-M3, batch_size=8, load-use-unload |
| Vector DB | Qdrant (local) |
| RAG | Hybrid dense + sparse + Anthropic Contextual Retrieval + BGE-reranker-v2-m3 |
| Visual RAG | ColQwen2 / ColPali — **offline-only batch ingest** |
| STT | faster-whisper + distil-large-v3 (loaded only during voice input) |
| TTS | Piper (interactive) + Kokoro-82M (long-form) |
| Wake | openWakeWord (Apache 2.0) + MediaPipe Hands (CPU) |
| Agent | smolagents CodeAgent — **NOT a security sandbox** (see disclaimer below) |
| Audit overlay | `aria-audit` package |

## Security disclaimer

smolagents' `LocalPythonExecutor` provides best-effort mitigations only and is
**not a security boundary**. ARIA Assistant runs Python tool-calls in the same
process as the user; it is intended only for personal, single-user use on the
author's own hardware with the author's own prompts. Do not expose its tool
interface to remote inputs.

## VRAM contract

`aria-audit.gpu_manager.GPUManager` enforces a strict mutual-exclusion:
- Qwen3 8B is always resident.
- At most **one** of {BGE-M3, HHEM 2.1, distil-large-v3} may be co-resident.
- ColPali runs only as a one-shot ingest subprocess; never live.

If a triple-load is attempted, the manager raises `VRAMExceeded`.

## Status

Phase 0 (scaffold). See `../aria-audit/` for the publication track.
