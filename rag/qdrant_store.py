"""Qdrant local persistence for ARIA-Assistant.

Two collections:
  aria_text   — dense BGE-M3 + sparse SPLADE vectors for text chunks
  aria_visual — dense ColPali embeddings for PDF figure pages
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from config.settings import settings

if TYPE_CHECKING:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import ScoredPoint

# BGE-M3 dense output dimensionality
VECTOR_SIZE = 1024

# ColQwen2 / ColPali full-page embedding dimensionality
VISUAL_VECTOR_SIZE = 1024


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

def get_client() -> "QdrantClient":
    """Return a QdrantClient backed by local on-disk storage."""
    from qdrant_client import QdrantClient
    return QdrantClient(path=settings.qdrant_path)


# ---------------------------------------------------------------------------
# Collection bootstrap
# ---------------------------------------------------------------------------

def ensure_collections(client: "QdrantClient") -> None:
    """Create aria_text and aria_visual collections if they do not exist.

    aria_text:
      - dense vector  (name="")          : cosine, 1024-dim (BGE-M3)
      - sparse vector (name="sparse")    : SPLADE / BGE-M3 sparse output

    aria_visual:
      - dense vector  (name="")          : cosine, 1024-dim (ColQwen2 page embedding)
    """
    from qdrant_client import models

    existing = {c.name for c in client.get_collections().collections}

    # ── text collection ──────────────────────────────────────────────────────
    text_col = settings.qdrant_collection_text
    if text_col not in existing:
        client.create_collection(
            collection_name=text_col,
            vectors_config=models.VectorParams(
                size=VECTOR_SIZE,
                distance=models.Distance.COSINE,
            ),
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(
                    index=models.SparseIndexParams(on_disk=False),
                ),
            },
        )

    # ── visual collection ────────────────────────────────────────────────────
    visual_col = settings.qdrant_collection_visual
    if visual_col not in existing:
        client.create_collection(
            collection_name=visual_col,
            vectors_config=models.VectorParams(
                size=VISUAL_VECTOR_SIZE,
                distance=models.Distance.COSINE,
            ),
        )


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------

def upsert_chunk(
    client: "QdrantClient",
    chunk_id: str,
    dense_vector: list[float],
    sparse_vector: dict[int, float],
    payload: dict,
) -> None:
    """Upsert a single text chunk into aria_text.

    Args:
        client:        Active QdrantClient.
        chunk_id:      Stable string ID (hashed to a UUID-compatible int).
        dense_vector:  1024-dim BGE-M3 dense embedding.
        sparse_vector: {token_index: weight} dict from BGE-M3 sparse head.
        payload:       Arbitrary metadata (text, source, page, …).
    """
    from qdrant_client import models

    # Qdrant point IDs must be unsigned 64-bit ints or UUID strings.
    # We use the raw string form which Qdrant accepts as a UUID-formatted string
    # when it looks like one; otherwise we hash to a stable int.
    point_id = _id_for(chunk_id)

    sparse_indices = list(sparse_vector.keys())
    sparse_values = list(sparse_vector.values())

    client.upsert(
        collection_name=settings.qdrant_collection_text,
        points=[
            models.PointStruct(
                id=point_id,
                vector={
                    "": dense_vector,  # unnamed dense vector
                    "sparse": models.SparseVector(
                        indices=sparse_indices,
                        values=sparse_values,
                    ),
                },
                payload={**payload, "_chunk_id": chunk_id},
            )
        ],
    )


def upsert_visual_page(
    client: "QdrantClient",
    page_id: str,
    dense_vector: list[float],
    payload: dict,
) -> None:
    """Upsert a single visual page embedding into aria_visual."""
    from qdrant_client import models

    point_id = _id_for(page_id)

    client.upsert(
        collection_name=settings.qdrant_collection_visual,
        points=[
            models.PointStruct(
                id=point_id,
                vector=dense_vector,
                payload={**payload, "_page_id": page_id},
            )
        ],
    )


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

def search_dense(
    client: "QdrantClient",
    query_vector: list[float],
    top_k: int = 50,
) -> "list[ScoredPoint]":
    """Cosine nearest-neighbour search on the dense BGE-M3 index."""
    return client.search(
        collection_name=settings.qdrant_collection_text,
        query_vector=query_vector,
        limit=top_k,
        with_payload=True,
    )


def search_sparse(
    client: "QdrantClient",
    query_sparse: dict[int, float],
    top_k: int = 50,
) -> "list[ScoredPoint]":
    """Sparse (SPLADE) search on the named 'sparse' vector index."""
    from qdrant_client import models

    return client.search(
        collection_name=settings.qdrant_collection_text,
        query_vector=models.NamedSparseVector(
            name="sparse",
            vector=models.SparseVector(
                indices=list(query_sparse.keys()),
                values=list(query_sparse.values()),
            ),
        ),
        limit=top_k,
        with_payload=True,
    )


def get_chunk(client: "QdrantClient", chunk_id: str) -> dict | None:
    """Fetch a single chunk payload by its string ID.  Returns None if absent."""
    point_id = _id_for(chunk_id)
    results = client.retrieve(
        collection_name=settings.qdrant_collection_text,
        ids=[point_id],
        with_payload=True,
    )
    if not results:
        return None
    return results[0].payload  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _id_for(string_id: str) -> int:
    """Convert an arbitrary string chunk ID to a stable unsigned 64-bit int."""
    import hashlib
    digest = hashlib.sha256(string_id.encode()).digest()
    # Take first 8 bytes as a big-endian unsigned integer, mask to 63 bits so
    # it fits in Qdrant's signed-64 storage without overflow.
    raw = int.from_bytes(digest[:8], "big")
    return raw & 0x7FFF_FFFF_FFFF_FFFF
