"""Obsidian-style vault ingest into the existing Qdrant RAG store.

A "vault" is just a directory of Markdown files. Each .md file becomes
chunks via the same BGE-M3 pipeline used for PDFs (`rag.ingest`).

Per-vault Qdrant collection naming: `aria_notes_<vault_slug>` so users can
delete one vault without touching paper embeddings.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from config.settings import settings
from core.jarvis import memory
from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

_VAULT_KEY = "indexed_vaults"   # memory.json key


def _slug(p: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_-]+", "_", str(p)).strip("_").lower()
    return s[:40] or "vault"


def list_vaults() -> dict[str, Any]:
    vaults = memory.get(_VAULT_KEY, [])
    if not isinstance(vaults, list):
        vaults = []
    return {"vaults": vaults, "count": len(vaults)}


async def index_vault(vault_path: str) -> dict[str, Any]:
    p = Path(vault_path).expanduser().resolve()
    if not p.exists() or not p.is_dir():
        return {"ok": False, "error": f"Vault directory not found: {p}"}

    md_files = list(p.rglob("*.md"))
    if not md_files:
        return {"ok": False, "error": "No .md files found in vault."}

    try:
        from rag.ingest import embed_chunks_bge_m3  # noqa: PLC0415
        from rag.qdrant_store import ensure_collections, get_client, upsert_chunk  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"rag stack unavailable: {exc}"}

    slug = _slug(str(p))
    total_chunks = 0
    failed: list[str] = []

    # Ingest each .md file as plain text — split into overlapping chunks
    chunk_size = 1024
    overlap = 128

    client = get_client()
    ensure_collections(client)

    for md in md_files:
        try:
            text = md.read_text(encoding="utf-8", errors="replace")
            if not text.strip():
                continue

            # Build overlapping character chunks
            chunks: list[dict] = []
            stem = md.stem
            i = 0
            idx = 0
            while i < len(text):
                end = min(i + chunk_size, len(text))
                chunk_text = text[i:end].strip()
                if chunk_text:
                    chunks.append({
                        "chunk_id": f"notes_{slug}_{stem}_{idx:04d}",
                        "text": chunk_text,
                        "source": md.name,
                        "page": 0,
                        "char_start": i,
                    })
                    idx += 1
                i += chunk_size - overlap

            if not chunks:
                continue

            texts = [c["text"] for c in chunks]
            dense_vectors, sparse_dicts = embed_chunks_bge_m3(texts)

            for chunk, dvec, svec in zip(chunks, dense_vectors, sparse_dicts):
                upsert_chunk(
                    client=client,
                    chunk_id=chunk["chunk_id"],
                    dense_vector=dvec.tolist(),
                    sparse_vector=svec,
                    payload={
                        "text": chunk["text"],
                        "source": chunk["source"],
                        "page": chunk["page"],
                        "char_start": chunk["char_start"],
                    },
                )
                total_chunks += 1

        except Exception as exc:  # noqa: BLE001
            failed.append(f"{md.name}: {exc}")

    # Persist record in memory
    vaults = memory.get(_VAULT_KEY, [])
    if not isinstance(vaults, list):
        vaults = []
    vaults = [v for v in vaults if v.get("slug") != slug]
    vaults.append({
        "slug": slug,
        "path": str(p),
        "files": len(md_files),
        "chunks": total_chunks,
    })
    memory.patch(_VAULT_KEY, vaults)

    return {
        "ok": True,
        "vault": str(p),
        "slug": slug,
        "files_indexed": len(md_files) - len(failed),
        "files_failed": len(failed),
        "chunks_added": total_chunks,
        "errors": failed[:10],
    }


register(JarvisTool(
    name="index_vault",
    category="power",
    description="Index a directory of Markdown notes (Obsidian-style vault) into the RAG store.",
    handler=index_vault,
    schema={"type": "object", "properties": {"vault_path": {"type": "string"}},
            "required": ["vault_path"]},
    requires_audit=False,
    voice_phrases=("ARIA, index my Obsidian vault at ...",),
))
