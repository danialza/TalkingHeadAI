"""Qdrant vector store operations — search, upsert, delete."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Optional

import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue, UpdateResult,
)

log = structlog.get_logger()

APPROVED_QA_COLLECTION = "approved_qa"
SESSION_CHUNKS_COLLECTION = "session_chunks"


@dataclass
class SearchResult:
    id: str | int
    score: float
    payload: dict[str, Any]


class VectorStoreService:
    def __init__(self, base_url: str = "http://qdrant:6333"):
        self.client = AsyncQdrantClient(url=base_url)
        self.base_url = base_url

    async def ensure_collections(self, dim: int = 1536):
        """Create collections if they don't exist."""
        existing = {c.name for c in (await self.client.get_collections()).collections}

        if APPROVED_QA_COLLECTION not in existing:
            await self.client.create_collection(
                collection_name=APPROVED_QA_COLLECTION,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            )
            log.info("collection_created", name=APPROVED_QA_COLLECTION, dim=dim)

        if SESSION_CHUNKS_COLLECTION not in existing:
            await self.client.create_collection(
                collection_name=SESSION_CHUNKS_COLLECTION,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            )
            log.info("collection_created", name=SESSION_CHUNKS_COLLECTION, dim=dim)

    async def search(
        self,
        collection: str,
        query_vector: list[float],
        top_k: int = 5,
        filter_payload: Optional[dict] = None,
    ) -> list[SearchResult]:
        query_filter = None
        if filter_payload:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_payload.items()
            ]
            query_filter = Filter(must=conditions)

        results = await self.client.search(
            collection_name=collection,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter,
            with_payload=True,
        )
        return [SearchResult(id=r.id, score=r.score, payload=r.payload or {}) for r in results]

    async def upsert(
        self,
        collection: str,
        vector_id: str | int,
        vector: list[float],
        payload: dict,
    ) -> bool:
        await self.client.upsert(
            collection_name=collection,
            points=[PointStruct(id=vector_id, vector=vector, payload=payload)],
        )
        return True

    async def delete(self, collection: str, vector_id: str | int) -> bool:
        from qdrant_client.models import PointIdsList
        await self.client.delete(
            collection_name=collection,
            points_selector=PointIdsList(points=[vector_id]),
        )
        return True

    async def delete_by_filter(self, collection: str, filter_payload: dict) -> int:
        """Delete every point whose payload matches every key/value in
        ``filter_payload``. Returns count of points removed."""
        from qdrant_client.models import FilterSelector
        conditions = [
            FieldCondition(key=k, match=MatchValue(value=v))
            for k, v in filter_payload.items()
        ]
        flt = Filter(must=conditions)
        before = (await self.client.count(
            collection_name=collection, count_filter=flt, exact=True,
        )).count
        await self.client.delete(
            collection_name=collection,
            points_selector=FilterSelector(filter=flt),
        )
        return before

    async def delete_all(self, collection: str) -> int:
        """Wipe every point in a collection. Collection schema remains."""
        from qdrant_client.models import FilterSelector
        before = (await self.client.count(collection_name=collection, exact=True)).count
        if before == 0:
            return 0
        await self.client.delete(
            collection_name=collection,
            points_selector=FilterSelector(filter=Filter(must=[])),
        )
        return before

    async def scroll_all(
        self,
        collection: str,
        filter_payload: Optional[dict] = None,
        limit: int = 1000,
    ) -> list[dict]:
        """Return up to ``limit`` points (id + payload, NO vectors)."""
        query_filter = None
        if filter_payload:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_payload.items()
            ]
            query_filter = Filter(must=conditions)
        out: list[dict] = []
        offset = None
        remaining = limit
        while remaining > 0:
            page, offset = await self.client.scroll(
                collection_name=collection,
                scroll_filter=query_filter,
                with_payload=True,
                with_vectors=False,
                limit=min(256, remaining),
                offset=offset,
            )
            for p in page:
                out.append({"id": p.id, "payload": p.payload or {}})
            remaining -= len(page)
            if offset is None or not page:
                break
        return out

    async def count(self, collection: str) -> int:
        result = await self.client.count(collection_name=collection, exact=True)
        return result.count
