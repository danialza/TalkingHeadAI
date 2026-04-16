"""
Query routing — decides Case A (new question) vs Case B (known question).
Case B: best vector similarity >= SIMILARITY_THRESHOLD
Case A: below threshold — gather RAG context chunks
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from services.embedding.base import BaseEmbeddingService
    from services.vector_store import VectorStoreService
    from config import Settings

log = structlog.get_logger()


@dataclass
class QueryDecision:
    case: str                           # "A" or "B"
    confidence: float
    matched_qa_id: Optional[int] = None
    context_chunks: list[str] = field(default_factory=list)


class QueryRouter:
    def __init__(
        self,
        embedding: "BaseEmbeddingService",
        vector_store: "VectorStoreService",
        settings: "Settings",
    ):
        self.embedding = embedding
        self.vector_store = vector_store
        self.threshold = settings.SIMILARITY_THRESHOLD
        self.rag_top_k = settings.RAG_TOP_K

    async def route(self, query: str) -> QueryDecision:
        """Embed query and decide routing."""
        query_vector = await self.embedding.embed(query)

        # Search approved Q&A collection
        qa_results = await self.vector_store.search(
            collection="approved_qa",
            query_vector=query_vector,
            top_k=3,
        )

        best_score = qa_results[0].score if qa_results else 0.0
        log.info("search_scores", best=round(best_score, 4), threshold=self.threshold)

        if qa_results and best_score >= self.threshold:
            qa_id = qa_results[0].payload.get("qa_id")
            log.info("routing_case_b", qa_id=qa_id, score=round(best_score, 4))
            return QueryDecision(
                case="B",
                confidence=best_score,
                matched_qa_id=qa_id,
            )

        # Case A — gather RAG context.
        # Chunks are tagged with a metadata prefix like
        # "[src:session|title:Career Chat #1|score:0.712] {text}" — the prefix
        # is stripped before the text is fed to Claude (see rag_pipeline), but
        # is preserved in rag_context_used so the mentor dashboard can show
        # which transcript each chunk came from and how relevant it was.
        chunk_results = await self.vector_store.search(
            collection="session_chunks",
            query_vector=query_vector,
            top_k=self.rag_top_k,
        )
        context_chunks: list[str] = []
        for r in chunk_results:
            text = r.payload.get("text", "")
            title = r.payload.get("transcript_title") or r.payload.get("source") or "session transcript"
            # Sanitize title — no pipes or brackets, they break our parser
            safe_title = str(title).replace("|", "/").replace("[", "(").replace("]", ")")[:80]
            score = round(float(r.score or 0.0), 4)
            context_chunks.append(f"[src:session|title:{safe_title}|score:{score}] {text}")

        # Also include top approved QAs as context (even below threshold)
        for r in qa_results[:2]:
            q = r.payload.get("question", "")
            a = r.payload.get("answer", "")
            if q and a:
                score = round(float(r.score or 0.0), 4)
                context_chunks.append(f"[src:qa|score:{score}] Q: {q}\nA: {a}")

        log.info("routing_case_a", score=round(best_score, 4), context_chunks=len(context_chunks))
        return QueryDecision(
            case="A",
            confidence=best_score,
            context_chunks=context_chunks,
        )
