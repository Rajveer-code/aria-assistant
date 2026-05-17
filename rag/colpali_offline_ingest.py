"""One-shot ColQwen2 / ColPali visual ingest. SUBPROCESS-ONLY; never live.

Run via: `python -m rag.colpali_offline_ingest --pdf rag/papers/*.pdf`

Spawns a fresh Python process so ColQwen2's vision encoder (~1.4 GB VRAM) is
guaranteed to be released before the assistant resumes. Embeddings persist to
the Qdrant `aria_visual` collection.

Phase 3 implementation.
"""

from __future__ import annotations


def main() -> int:
    raise SystemExit("Phase 3 stub: spawn subprocess that imports colpali_engine, indexes PDFs, exits.")


if __name__ == "__main__":
    main()
