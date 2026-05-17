"""PDF ingestion — Contextual Retrieval pipeline.

Steps:
  1. PyMuPDF parse → page-aware overlapping chunks
  2. Phi-4-mini CPU generates 1-2 sentence context blurb per chunk
  3. BGE-M3 embeds (chunk_text + blurb) with dense+sparse
  4. Qdrant upsert

Reference:
  Anthropic, Sept 2024: https://www.anthropic.com/news/contextual-retrieval

Phase 3 implementation.
"""

from __future__ import annotations

import logging
import warnings
from pathlib import Path
from typing import Callable

import numpy as np

from config.settings import settings

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. PDF → Chunks
# ---------------------------------------------------------------------------

def chunk_pdf(
    path: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[dict]:
    """Parse a PDF with PyMuPDF and split into overlapping character-level chunks.

    Each returned dict has the shape::

        {
            "chunk_id":   str,   # e.g. "attention_is_all_you_need_002_0003"
            "text":       str,
            "source":     str,   # basename of the PDF
            "page":       int,   # 0-based page index
            "char_start": int,   # offset within the page text
        }

    Pages with no extractable text are silently skipped.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:  # pragma: no cover
        raise ImportError("PyMuPDF is required for PDF ingestion: pip install pymupdf") from exc

    chunk_size = chunk_size or settings.rag_chunk_size
    overlap = overlap or settings.rag_chunk_overlap

    path = str(path)
    stem = Path(path).stem
    chunks: list[dict] = []

    try:
        doc = fitz.open(path)
    except Exception as exc:
        warnings.warn(f"Failed to open PDF '{path}': {exc}", stacklevel=2)
        return chunks

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        if not text or not text.strip():
            continue

        # sliding window over the page text
        i = 0
        chunk_index = 0
        while i < len(text):
            end = min(i + chunk_size, len(text))
            chunk_text = text[i:end].strip()
            if chunk_text:
                chunk_id = f"{stem}_{page_num:03d}_{chunk_index:04d}"
                chunks.append(
                    {
                        "chunk_id": chunk_id,
                        "text": chunk_text,
                        "source": Path(path).name,
                        "page": page_num,
                        "char_start": i,
                    }
                )
                chunk_index += 1
            i += chunk_size - overlap  # advance by (chunk_size - overlap)

    doc.close()
    log.info("chunk_pdf: '%s' → %d chunks across %d pages", Path(path).name, len(chunks), len(doc))
    return chunks


# ---------------------------------------------------------------------------
# 2. Contextual blurb generation
# ---------------------------------------------------------------------------

def generate_context_blurb(
    chunk_text: str,
    doc_title: str,
    copilot_fn: Callable[[str], str],
) -> str:
    """Ask Phi-4-mini CPU to write a 1-2 sentence retrieval blurb for a chunk.

    Args:
        chunk_text:  The raw chunk text (first 500 chars are sent to keep tokens low).
        doc_title:   Title/filename of the source document.
        copilot_fn:  Callable that accepts a prompt string and returns a completion string.

    Returns:
        A blurb string, truncated to 200 characters.
    """
    prompt = (
        f"Here is a chunk from the paper '{doc_title}':\n\n"
        f"{chunk_text[:500]}\n\n"
        "In 1-2 sentences, briefly describe what this chunk covers to help with retrieval:\n"
    )
    try:
        blurb = copilot_fn(prompt)
        return str(blurb).strip()[:200]
    except Exception as exc:  # noqa: BLE001
        log.warning("Context blurb generation failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# 3. BGE-M3 encoding (dense + sparse)
# ---------------------------------------------------------------------------

def embed_chunks_bge_m3(
    texts: list[str],
    batch_size: int | None = None,
) -> tuple[list[np.ndarray], list[dict[int, float]]]:
    """Encode a list of texts with BGE-M3 in dense + sparse format.

    Uses the assistant's GPUManager to acquire/release the BGE_M3 slot so VRAM
    is reclaimed after embedding.

    Args:
        texts:      List of strings to embed.
        batch_size: Override the default from settings (default 8 — OOM-safe).

    Returns:
        A tuple ``(dense_vectors, sparse_dicts)`` where:
          - ``dense_vectors[i]`` is a numpy array of shape (1024,)
          - ``sparse_dicts[i]``  is {token_index: weight}
    """
    from core.gpu_manager import BGE_M3, get_manager

    batch_size = batch_size or settings.rag_embed_batch_size

    manager = get_manager()
    dense_vectors: list[np.ndarray] = []
    sparse_dicts: list[dict[int, float]] = []

    with manager.acquire(BGE_M3) as model:
        # model is a FlagModel / SentenceTransformer with encode_multi_formats
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            try:
                output = model.encode(
                    batch,
                    return_dense=True,
                    return_sparse=True,
                    return_colbert_vecs=False,
                    batch_size=batch_size,
                )
                # dense: list of np.ndarray shape (1024,)
                dense_batch = output.get("dense_vecs", [])
                # sparse: list of dicts {token_index: weight}  (BGE-M3 lexical weights)
                sparse_batch = output.get("lexical_weights", [])

                for dvec in dense_batch:
                    dense_vectors.append(np.asarray(dvec, dtype=np.float32))
                for svec in sparse_batch:
                    # svec may be {str_token: weight} — BGE-M3 uses token ids as ints already
                    # normalise to {int: float}
                    sparse_dicts.append(
                        {int(k): float(v) for k, v in svec.items()}
                    )
            except Exception as exc:  # noqa: BLE001
                log.error("embed_chunks_bge_m3 batch [%d:%d] failed: %s", start, start + batch_size, exc)
                # fill with zero vectors so indices stay aligned
                for _ in batch:
                    dense_vectors.append(np.zeros(1024, dtype=np.float32))
                    sparse_dicts.append({})

    return dense_vectors, sparse_dicts


# ---------------------------------------------------------------------------
# 4. Ingest a single PDF
# ---------------------------------------------------------------------------

def ingest_pdf(
    path: str,
    copilot_fn: Callable[[str], str] | None = None,
) -> int:
    """Run the full Contextual Retrieval ingestion pipeline on one PDF.

    Args:
        path:        Filesystem path to the PDF.
        copilot_fn:  Optional callable(prompt) → str (Phi-4-mini CPU).
                     If None, no blurb is prepended to chunk text.

    Returns:
        Number of chunks successfully ingested.
    """
    from rag.qdrant_store import ensure_collections, get_client, upsert_chunk

    doc_title = Path(path).stem.replace("_", " ")
    chunks = chunk_pdf(path)
    if not chunks:
        log.warning("ingest_pdf: no chunks produced from '%s'", path)
        return 0

    # Build combined texts (blurb + chunk_text)
    combined_texts: list[str] = []
    for chunk in chunks:
        if copilot_fn:
            blurb = generate_context_blurb(chunk["text"], doc_title, copilot_fn)
            combined = f"{blurb}\n\n{chunk['text']}" if blurb else chunk["text"]
        else:
            combined = chunk["text"]
        combined_texts.append(combined)

    # Embed all combined texts
    dense_vectors, sparse_dicts = embed_chunks_bge_m3(combined_texts)

    # Upsert to Qdrant
    client = get_client()
    ensure_collections(client)

    n_upserted = 0
    for chunk, dvec, svec in zip(chunks, dense_vectors, sparse_dicts):
        try:
            payload = {
                "text": chunk["text"],
                "source": chunk["source"],
                "page": chunk["page"],
                "char_start": chunk["char_start"],
            }
            upsert_chunk(
                client=client,
                chunk_id=chunk["chunk_id"],
                dense_vector=dvec.tolist(),
                sparse_vector=svec,
                payload=payload,
            )
            n_upserted += 1
        except Exception as exc:  # noqa: BLE001
            log.error("upsert failed for chunk '%s': %s", chunk["chunk_id"], exc)

    log.info("ingest_pdf: '%s' → %d chunks upserted", Path(path).name, n_upserted)
    return n_upserted


# ---------------------------------------------------------------------------
# 5. Ingest a directory of PDFs
# ---------------------------------------------------------------------------

def ingest_directory(
    dir_path: str,
    copilot_fn: Callable[[str], str] | None = None,
) -> dict[str, int]:
    """Ingest all PDFs in a directory.

    Args:
        dir_path:   Path to a directory containing *.pdf files.
        copilot_fn: Optional context-blurb generator (see ingest_pdf).

    Returns:
        Mapping of {filename: n_chunks_ingested}.
    """
    results: dict[str, int] = {}
    pdf_files = sorted(Path(dir_path).glob("*.pdf"))

    if not pdf_files:
        log.warning("ingest_directory: no PDFs found in '%s'", dir_path)
        return results

    for pdf_path in pdf_files:
        log.info("ingest_directory: processing '%s'", pdf_path.name)
        try:
            n = ingest_pdf(str(pdf_path), copilot_fn=copilot_fn)
        except Exception as exc:  # noqa: BLE001
            log.error("ingest_pdf failed for '%s': %s", pdf_path.name, exc)
            n = 0
        results[pdf_path.name] = n

    total = sum(results.values())
    log.info(
        "ingest_directory: finished — %d PDFs, %d total chunks",
        len(results),
        total,
    )
    return results
