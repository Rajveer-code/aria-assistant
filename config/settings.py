"""Central configuration. NO hardcoded values elsewhere in the codebase.

Reads from environment with sensible defaults. Override via .env (loaded by FastAPI startup).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# ---- Apply persisted overrides BEFORE any _env() call -------------------
# Keys in overrides.json are mapped to env vars by adding ARIA_ prefix and
# uppercasing — e.g., {"default_city": "Pune"} → ARIA_DEFAULT_CITY=Pune
_FIELD_TO_ENV = {
    "ollama_url":            "OLLAMA_URL",
    "llm_primary":           "ARIA_LLM_PRIMARY",
    "llm_copilot_path":      "ARIA_LLM_COPILOT_PATH",
    "embedding_model":       "ARIA_EMBEDDING_MODEL",
    "reranker_model":        "ARIA_RERANKER_MODEL",
    "hhem_model":            "ARIA_HHEM_MODEL",
    "qdrant_path":           "QDRANT_PATH",
    "whisper_model":         "ARIA_WHISPER_MODEL",
    "whisper_device":        "ARIA_WHISPER_DEVICE",
    "piper_voice":           "ARIA_PIPER_VOICE",
    "wake_phrase":           "ARIA_WAKE_PHRASE",
    "papers_dir":            "ARIA_PAPERS_DIR",
    "default_city":          "ARIA_DEFAULT_CITY",
    "weather_units":         "ARIA_WEATHER_UNITS",
    "clipboard_enabled":     "ARIA_CLIPBOARD_ENABLED",
    "clipboard_poll_ms":     "ARIA_CLIPBOARD_POLL_MS",
    "clipboard_history_max": "ARIA_CLIPBOARD_HISTORY_MAX",
    "memory_path":           "ARIA_MEMORY_PATH",
    "rss_feeds_path":        "ARIA_RSS_FEEDS_PATH",
    "flashcards_db":         "ARIA_FLASHCARDS_DB",
    "notifications_db":      "ARIA_NOTIFICATIONS_DB",
    "llava_model":           "ARIA_LLAVA_MODEL",
    "rss_poll_interval_s":   "ARIA_RSS_POLL_INTERVAL_S",
    "audit_db_path":         "ARIA_AUDIT_DB",
}


def _apply_overrides() -> None:
    """Load data/overrides.json and inject values into os.environ (if not already set)."""
    candidates = [
        Path(os.environ.get("ARIA_OVERRIDES_PATH", "")),
        PROJECT_ROOT / "data" / "overrides.json",
    ]
    for p in candidates:
        if not p or not str(p) or not p.exists():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            for key, val in (data or {}).items():
                env_key = _FIELD_TO_ENV.get(key)
                if env_key and env_key not in os.environ:
                    os.environ[env_key] = str(val)
        except Exception:
            pass  # silent — overrides are best-effort
        break


_apply_overrides()


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

    # ---- Jarvis features ----
    default_city: str           = _env("ARIA_DEFAULT_CITY", "Jabalpur")
    weather_units: str          = _env("ARIA_WEATHER_UNITS", "metric")
    clipboard_enabled: bool     = _env("ARIA_CLIPBOARD_ENABLED", "false").lower() == "true"
    clipboard_poll_ms: int      = _env_int("ARIA_CLIPBOARD_POLL_MS", 1500)
    clipboard_history_max: int  = _env_int("ARIA_CLIPBOARD_HISTORY_MAX", 50)
    memory_path: str            = _env("ARIA_MEMORY_PATH", str(PROJECT_ROOT / "data" / "memory.json"))
    overrides_path: str         = _env("ARIA_OVERRIDES_PATH", str(PROJECT_ROOT / "data" / "overrides.json"))
    rss_feeds_path: str         = _env("ARIA_RSS_FEEDS_PATH", str(PROJECT_ROOT / "data" / "rss.json"))
    flashcards_db: str          = _env("ARIA_FLASHCARDS_DB", str(PROJECT_ROOT / "data" / "flashcards.sqlite"))
    notifications_db: str       = _env("ARIA_NOTIFICATIONS_DB", str(PROJECT_ROOT / "data" / "notifications.sqlite"))
    obsidian_vaults: tuple[str, ...] = tuple(
        v for v in _env("ARIA_OBSIDIAN_VAULTS", "").split(";") if v.strip()
    )
    github_repo_allowlist: tuple[str, ...] = tuple(
        v.strip() for v in _env("ARIA_GH_ALLOWLIST", "Rajveer-code/aria-audit;Rajveer-code/aria-assistant").split(";")
        if v.strip()
    )
    llava_model: str            = _env("ARIA_LLAVA_MODEL", "llava:7b")
    notification_queue_size: int = _env_int("ARIA_NOTIFICATION_QUEUE_SIZE", 200)
    rss_poll_interval_s: int    = _env_int("ARIA_RSS_POLL_INTERVAL_S", 900)


settings = Settings()
