"""Ollama Qwen3 8B primary + Phi-4-mini CPU co-pilot.

Phase 3 wiring. Phase 0 stub keeps the interface stable so other modules
can import without crashing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from config.settings import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Generation:
    text: str
    tokens: int
    latency_ms: float
    model: str


class OllamaPrimary:
    def __init__(self, base_url: str | None = None, model: str | None = None) -> None:
        self.base_url = base_url or settings.ollama_url
        self.model = model or settings.llm_primary
        self.client = httpx.Client(base_url=self.base_url, timeout=120.0)

    def generate(self, prompt: str, max_tokens: int = 512, temperature: float = 0.2) -> Generation:
        import time
        t0 = time.perf_counter()
        r = self.client.post(
            "/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens, "temperature": temperature},
            },
        )
        r.raise_for_status()
        body = r.json()
        dt = (time.perf_counter() - t0) * 1000.0
        return Generation(
            text=body.get("response", ""),
            tokens=body.get("eval_count", 0),
            latency_ms=dt,
            model=self.model,
        )


class Phi4MiniCpuCopilot:
    """Phi-4-mini Q4 GGUF on CPU via llama-cpp-python. Background blurb / paraphrase / claim-extraction worker."""

    def __init__(self, model_path: str | None = None) -> None:
        self.model_path = model_path or settings.llm_copilot_path
        self._llm = None

    def _load(self) -> None:
        if self._llm is not None:
            return
        if not self.model_path:
            raise RuntimeError("ARIA_LLM_COPILOT_PATH not set; cannot load Phi-4-mini copilot.")
        from llama_cpp import Llama  # local import to keep CPU path optional
        self._llm = Llama(model_path=self.model_path, n_ctx=4096, n_threads=8, verbose=False)

    def generate(self, prompt: str, max_tokens: int = 256) -> str:
        self._load()
        assert self._llm is not None
        out = self._llm(prompt=prompt, max_tokens=max_tokens, temperature=0.2, stop=["</s>"])
        return out["choices"][0]["text"]
