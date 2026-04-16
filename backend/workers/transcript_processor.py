"""Celery task: chunk transcript text and index into Qdrant session_chunks.

Also exposes `chunk_text` + `_async_process` as plain helpers so the FastAPI
route can run them in-process when Celery isn't available (dev mode).
"""
import asyncio
import hashlib
import re

import structlog

log = structlog.get_logger()

CHUNK_SIZE = 400        # characters per chunk
CHUNK_OVERLAP = 80      # overlap between chunks


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks for better RAG retrieval."""
    # Clean whitespace
    text = re.sub(r'\s+', ' ', text.strip())
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        # Try to break at sentence boundary
        if end < len(text):
            for sep in ['. ', '! ', '? ', '\n']:
                pos = text.rfind(sep, start + overlap, end)
                if pos != -1:
                    end = pos + len(sep)
                    break
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = end - overlap
    return [c for c in chunks if len(c) > 20]  # Skip tiny fragments


try:
    from workers.celery_app import celery_app

    @celery_app.task(name="workers.transcript_processor.process_transcript", bind=True)
    def process_transcript(self, transcript_text: str, mentor_id: str, source: str = "session"):
        """Chunk transcript and add embeddings to session_chunks Qdrant collection."""
        asyncio.run(_async_process(transcript_text, mentor_id, source))
        return {"status": "done", "mentor_id": mentor_id}
except ModuleNotFoundError:
    # Dev mode without celery installed — the route will call _async_process directly
    celery_app = None  # type: ignore
    process_transcript = None  # type: ignore


async def _async_process(transcript_text: str, mentor_id: str, source: str):
    import os
    os.environ.setdefault("EMBEDDING_PROVIDER", "openai")

    from config import get_settings, get_embedding_service
    from services.vector_store import VectorStoreService

    settings = get_settings()
    embedding_svc = get_embedding_service(settings)
    vector_store = VectorStoreService(base_url=settings.QDRANT_URL)

    chunks = chunk_text(transcript_text)
    log.info("processing_transcript", chunks=len(chunks), mentor_id=mentor_id)

    for i, chunk in enumerate(chunks):
        vector = await embedding_svc.embed(chunk)
        # Use hash of chunk as stable vector ID
        chunk_id = int(hashlib.md5(chunk.encode()).hexdigest()[:16], 16) % (2**63)
        await vector_store.upsert(
            collection="session_chunks",
            vector_id=chunk_id,
            vector=vector,
            payload={
                "text": chunk,
                "mentor_id": mentor_id,
                "source": source,
                "chunk_index": i,
            },
        )

    log.info("transcript_indexed", chunks=len(chunks), mentor_id=mentor_id)
