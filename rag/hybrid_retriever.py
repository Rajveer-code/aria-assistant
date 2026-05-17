"""Hybrid BGE-M3 dense+sparse → RRF k=60 → BGE-reranker-v2-m3 top-k.

Ported from IndiaFinBench rag/ architecture (Recall@5 0.7847 baseline).
Adapted: nomic-embed → BGE-M3 (dense+sparse in one pass),
         Phi-4-mini CPU context blurbs added during ingest.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np

from config.settings import settings

if TYPE_CHECKING:
    from qdrant_client.http.models import ScoredPoint

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Retrieved:
    chunk_id: str
    text: str
    source: str
    score: float
    rank: int


# ---------------------------------------------------------------------------
# RRF helpers
# ---------------------------------------------------------------------------

def rrf_score(rank: int, k: int = 60) -> float:
    """Reciprocal rank fusion score for a single result at position *rank* (0-based)."""
    return 1.0 / (rank + k)


def reciprocal_rank_fusion(
    dense_results: "list[ScoredPoint]",
    sparse_results: "list[ScoredPoint]",
    k: int = 60,
) -> list[dict]:
    """Merge dense and sparse ranked lists with RRF.

    Args:
        dense_results:  Scored points from Qdrant dense search.
        sparse_results: Scored points from Qdrant sparse search.
        k:              RRF smoothing constant (default 60).

    Returns:
        List of dicts sorted by descending RRF score::

            {
                "chunk_id":  str,
                "text":      str,
                "source":    str,
                "page":      int,
                "rrf_score": float,
            }
    """
    scores: dict[str, float] = {}
    payloads: dict[str, dict] = {}

    def _process(results: "list[ScoredPoint]") -> None:
        for rank, point in enumerate(results):
            payload = point.payload or {}
            cid = payload.get("_chunk_id", str(point.id))
            scores[cid] = scores.get(cid, 0.0) + rrf_score(rank, k)
            if cid not in payloads:
                payloads[cid] = payload

    _process(dense_results)
    _process(sparse_results)

    merged = []
    for cid, total_score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
        p = payloads.get(cid, {})
        merged.append(
            {
                "chunk_id": cid,
                "text": p.get("text", ""),
                "source": p.get("source", ""),
                "page": p.get("page", -1),
                "rrf_score": total_score,
            }
        )

    return merged


# ---------------------------------------------------------------------------
# HybridRetriever
# ---------------------------------------------------------------------------

class HybridRetriever:
    """Full hybrid retrieve-then-rerank pipeline.

    Lifecycle:
      1. embed_query  → BGE-M3 dense + sparse query vectors
      2. search_dense + search_sparse (top-50 each) via Qdrant
      3. RRF fusion   → merged ranked list (top-100 after fusion)
      4. BGE-reranker-v2-m3 rescores top-10 of fused list
      5. Return top-k Retrieved objects
    """

    def __init__(self) -> None:
        from rag.qdrant_store import ensure_collections, get_client

        self._client = get_client()
        ensure_collections(self._client)

        # Lazy: reranker loaded on first call (small ~0.5 GB, not managed by GPUManager)
        self._reranker = None

    # ------------------------------------------------------------------
    # Embedding
    # ------------------------------------------------------------------

    def embed_query(self, query: str) -> tuple[np.ndarray, dict[int, float]]:
        """Encode *query* with BGE-M3 and return (dense_vec, sparse_dict).

        GPUManager is used to acquire the BGE_M3 slot; it is released immediately
        after encoding so VRAM is free for any subsequent operations.
        """
        from core.gpu_manager import BGE_M3, get_manager

        manager = get_manager()
        dense_vec: np.ndarray | None = None
        sparse_dict: dict[int, float] = {}

        with manager.acquire(BGE_M3) as model:
            try:
                output = model.encode(
                    [query],
                    return_dense=True,
                    return_sparse=True,
                    return_colbert_vecs=False,
                    batch_size=1,
                )
                dense_list = output.get("dense_vecs", [])
                sparse_list = output.get("lexical_weights", [])

                if dense_list:
                    dense_vec = np.asarray(dense_list[0], dtype=np.float32)
                if sparse_list:
                    sparse_dict = {int(k): float(v) for k, v in sparse_list[0].items()}
            except Exception as exc:  # noqa: BLE001
                log.error("embed_query failed: %s", exc)

        if dense_vec is None:
            dense_vec = np.zeros(1024, dtype=np.float32)

        return dense_vec, sparse_dict

    # ------------------------------------------------------------------
    # Reranker (lazy load, no GPUManager — model is small)
    # ------------------------------------------------------------------

    def _get_reranker(self):
        if self._reranker is None:
            try:
                from sentence_transformers import CrossEncoder

                log.info("Loading reranker: %s", settings.reranker_model)
                self._reranker = CrossEncoder(
                    settings.reranker_model,
                    max_length=512,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("Reranker load failed (%s) — skipping rerank step.", exc)
        return self._reranker

    def _rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        """Rerank *candidates* with BGE-reranker-v2-m3.

        Returns the list sorted by descending reranker score.  Falls back to
        the original RRF order if the reranker is unavailable.
        """
        reranker = self._get_reranker()
        if reranker is None or not candidates:
            return candidates

        pairs = [(query, c["text"]) for c in candidates]
        try:
            scores = reranker.predict(pairs, show_progress_bar=False)
        except Exception as exc:  # noqa: BLE001
            log.warning("Rerank predict failed: %s", exc)
            return candidates

        scored = sorted(
            zip(scores, candidates),
            key=lambda x: float(x[0]),
            reverse=True,
        )
        return [c for _, c in scored]

    # ------------------------------------------------------------------
    # Main retrieve method
    # ------------------------------------------------------------------

    def retrieve(self, query: str, k: int | None = None) -> list[Retrieved]:
        """End-to-end hybrid retrieval.

        Args:
            query: Natural-language query string.
            k:     Number of final results to return (default from settings).

        Returns:
            List of Retrieved objects, best-first.
        """
        from rag.qdrant_store import search_dense, search_sparse

        k = k if k is not None else settings.rag_top_k_final
        top_k_retrieve = settings.rag_top_k_retrieve
        rrf_k = settings.rag_rrf_k

        # ── 1. Embed query ─────────────────────────────────────────────────
        dense_vec, sparse_dict = self.embed_query(query)

        # ── 2. Dual search ─────────────────────────────────────────────────
        try:
            dense_results = search_dense(self._client, dense_vec.tolist(), top_k=top_k_retrieve)
        except Exception as exc:  # noqa: BLE001
            log.error("Dense search failed: %s", exc)
            dense_results = []

        try:
            sparse_results = (
                search_sparse(self._client, sparse_dict, top_k=top_k_retrieve)
                if sparse_dict
                else []
            )
        except Exception as exc:  # noqa: BLE001
            log.error("Sparse search failed: %s", exc)
            sparse_results = []

        if not dense_results and not sparse_results:
            log.warning("retrieve: both dense and sparse searches returned nothing.")
            return []

        # ── 3. RRF fusion ──────────────────────────────────────────────────
        fused = reciprocal_rank_fusion(dense_results, sparse_results, k=rrf_k)

        # ── 4. Rerank top-10 from fused list ───────────────────────────────
        rerank_pool = fused[:10]
        reranked = self._rerank(query, rerank_pool)

        # ── 5. Build Retrieved objects ─────────────────────────────────────
        output: list[Retrieved] = []
        for rank, item in enumerate(reranked[:k]):
            output.append(
                Retrieved(
                    chunk_id=item["chunk_id"],
                    text=item["text"],
                    source=item["source"],
                    score=item.get("rrf_score", 0.0),
                    rank=rank,
                )
            )

        return output
