"""Central configuration. NO hardcoded values elsewhere in the codebase.

Reads from environment with sensible defaults. Override via .env (loaded by FastAPI startup).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


def _env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, str(default)))


@dataclass(frozen=True)
class Settings:
    # Models
    ollama_url: str = _env("OLLAMA_URL", "http://localhost:11434")
    llm_primary: str = _env("ARIA_LLM_PRIMARY", "qwen3:8b-q4_K_M")
    llm_copilot_path: str = _env("ARIA_LLM_COPILOT_PATH", "")  # path to Phi-4-mini GGUF on disk
    embedding_model: str = _env("ARIA_EMBEDDING_MODEL", "BAAI/bge-m3")
    reranker_model: str = _env("ARIA_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
    hhem_model: str = _env("ARIA_HHEM_MODEL", "vectara/hallucination_evaluation_model")

    # RAG
    qdrant_path: str = _env("QDRANT_PATH", str(PROJECT_ROOT / "rag" / "qdrant_storage"))
    qdrant_collection_text: str = _env("QDRANT_COL_TEXT", "aria_text")
    qdrant_collection_visual: str = _env("QDRANT_COL_VISUAL", "aria_visual")
    rag_chunk_size: int = _env_int("ARIA_CHUNK_SIZE", 1024)
    rag_chunk_overlap: int = _env_int("ARIA_CHUNK_OVERLAP", 128)
    rag_top_k_retrieve: int = _env_int("ARIA_TOP_K_RETRIEVE", 50)
    rag_top_k_final: int = _env_int("ARIA_TOP_K_FINAL", 5)
    rag_rrf_k: int = _env_int("ARIA_RRF_K", 60)
    rag_embed_batch_size: int = _env_int("ARIA_EMBED_BATCH", 8)

    # Voice
    whisper_model: str = _env("ARIA_WHISPER_MODEL", "distil-large-v3")
    whisper_device: str = _env("ARIA_WHISPER_DEVICE", "cuda")
    piper_voice: str = _env("ARIA_PIPER_VOICE", "en_US-lessac-medium")

    # Wake
    wake_phrase: str = _env("ARIA_WAKE_PHRASE", "hey aria")
    wake_gesture_required: bool = _env("ARIA_WAKE_GESTURE", "false").lower() == "true"

    # Audit
    audit_db_path: str = _env("ARIA_AUDIT_DB", str(PROJECT_ROOT / "data" / "audit.sqlite"))
    audit_drift_lambda: float = _env_float("ARIA_DRIFT_LAMBDA", 0.05)
    audit_drift_delta: float = _env_float("ARIA_DRIFT_DELTA", 0.005)

    # Paths
    papers_dir: str = _env("ARIA_PAPERS_DIR", str(PROJECT_ROOT / "rag" / "papers"))

    # API
    api_host: str = _env("ARIA_API_HOST", "127.0.0.1")
    api_port: int = _env_int("ARIA_API_PORT", 8000)


settings = Settings()
