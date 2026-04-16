"""
The Brain — coordinates the full conversation flow:
1. Embed query
2. Route to Case A or Case B
3. Generate response (RAG or KB lookup)
4. TTS synthesis
5. Avatar generation (async)
6. Store conversation log
"""
from __future__ import annotations
import asyncio
import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncGenerator, Optional, TYPE_CHECKING

import structlog

from config import Settings
from core.query_router import QueryRouter, QueryDecision
from core.rag_pipeline import RAGPipeline
from models.database import AsyncSessionLocal, Conversation, QAPair, UnansweredPool
from services.user_memory_service import (
    extract_and_store_facts,
    load_user_facts,
    substitute_tags,
)

if TYPE_CHECKING:
    from services.llm.base import BaseLLMService
    from services.tts.base import BaseTTSService
    from services.avatar.base import BaseAvatarService
    from services.embedding.base import BaseEmbeddingService
    from services.vector_store import VectorStoreService

log = structlog.get_logger()


@dataclass
class OrchestrationResult:
    response_text: str
    case: str               # "A" or "B"
    confidence: float
    matched_qa_id: Optional[int]
    ask_count: Optional[int]
    audio_chunks: AsyncGenerator[bytes, None]
    avatar_job_id: Optional[str]   # Poll /avatar/result/{id} when ready


class ConversationOrchestrator:
    def __init__(
        self,
        settings: Settings,
        llm: "BaseLLMService",
        embedding: "BaseEmbeddingService",
        vector_store: "VectorStoreService",
        tts: "BaseTTSService",
        avatar: "BaseAvatarService",
    ):
        self.settings = settings
        self.llm = llm
        self.tts = tts
        self.avatar = avatar
        self.router = QueryRouter(embedding=embedding, vector_store=vector_store, settings=settings)
        self.rag = RAGPipeline(llm=llm, vector_store=vector_store, settings=settings)

    async def process_text(
        self,
        user_message: str,
        session_id: str,
        mentor_id: str = "default",
        user_id: str = "anon",
    ) -> dict:
        """
        Full pipeline for text input.
        Returns a dict suitable for JSON serialization.
        """
        log.info("processing_message", session_id=session_id, message_preview=user_message[:80])

        # Load long-term user facts (name, job, ...) for personalization.
        user_facts = await load_user_facts(user_id)

        # Step 1: Route query
        decision: QueryDecision = await self.router.route(user_message)
        log.info("routing_decision", case=decision.case, confidence=decision.confidence)

        # Step 2: Build response
        if decision.case == "B":
            response_text, _tts_text, ask_count = await self._handle_case_b(decision)
            matched_qa_id = decision.matched_qa_id
        else:
            response_text, _tts_text = await self._handle_case_a(
                user_message, decision, mentor_id, user_facts
            )
            ask_count = None
            matched_qa_id = None

        # Post-process: substitute %name% etc. Safe for Case B too (no tags → no-op).
        response_text = substitute_tags(response_text, user_facts)

        # Step 3: Log conversation + async fact extraction (never blocks).
        asyncio.create_task(self._log_conversation(
            session_id=session_id,
            user_message=user_message,
            bot_response=response_text,
            case_type=decision.case,
            confidence=decision.confidence,
            matched_qa_id=matched_qa_id,
        ))
        asyncio.create_task(
            extract_and_store_facts(
                llm=self.llm,
                user_id=user_id,
                user_message=user_message,
                session_id=session_id,
            )
        )

        return {
            "response": response_text,
            "case": decision.case,
            "confidence": decision.confidence,
            "matched_qa_id": matched_qa_id,
            "ask_count": ask_count,
            "context_chunks": decision.context_chunks if decision.case == "A" else None,
        }

    async def process_with_voice(
        self,
        user_message: str,
        session_id: str,
        mentor_id: str = "default",
        user_id: str = "anon",
    ) -> AsyncGenerator[dict, None]:
        """
        Full pipeline yielding WebSocket events as they become available.
        Yields: thinking → response_text → audio_chunk(s) → avatar_url
        """
        yield {"type": "thinking", "status": "routing"}

        # Long-term user facts for optional personalization.
        user_facts = await load_user_facts(user_id)

        decision: QueryDecision = await self.router.route(user_message)

        if decision.case == "B":
            yield {"type": "thinking", "status": "kb_lookup"}
            response_text, tts_text, ask_count = await self._handle_case_b(decision)
        else:
            yield {"type": "thinking", "status": "generating"}
            response_text, tts_text = await self._handle_case_a(
                user_message, decision, mentor_id, user_facts
            )
            ask_count = None

        # Substitute %name% etc. in both display + TTS text.
        response_text = substitute_tags(response_text, user_facts)
        tts_text = substitute_tags(tts_text, user_facts)

        yield {
            "type": "response_text",
            "data": response_text,
            "case": decision.case,
            "confidence": decision.confidence,
        }

        # TTS: synthesize complete audio (no streaming — we want one clean file)
        audio_buffer = bytearray()
        try:
            async for chunk in self.tts.synthesize_stream(tts_text):
                audio_buffer.extend(chunk)
        except Exception as e:
            log.error("tts_error", error=str(e))
            yield {"type": "error", "data": f"TTS error: {e}"}
            return

        if not audio_buffer:
            yield {"type": "error", "data": "TTS returned empty audio"}
            return

        # Save to static dir so frontend plays via <audio src=URL> — no base64/chunk issues
        import os
        import app_state as _app_state
        audio_id = str(uuid.uuid4())
        static_dir = os.environ.get(
            "AVATAR_STATIC_DIR",
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "avatars"),
        )
        os.makedirs(static_dir, exist_ok=True)
        file_path = os.path.join(static_dir, f"tts_{audio_id}.mp3")
        with open(file_path, "wb") as f:
            f.write(bytes(audio_buffer))

        audio_url = f"/static/avatars/tts_{audio_id}.mp3"
        log.info("audio_saved", audio_id=audio_id, size=len(audio_buffer), url=audio_url)

        # Also buffer in memory for D-ID streaming avatar upload
        if self.settings.AVATAR_PROVIDER == "did":
            _app_state.pending_audio[audio_id] = bytes(audio_buffer)

        # Signal frontend: play audio by URL + use audio_id for streaming avatar
        yield {
            "type": "audio_done",
            "audio_url": audio_url,
            "audio_id": audio_id,
        }

        # Log conversation + async fact extraction (never blocks).
        asyncio.create_task(self._log_conversation(
            session_id=session_id,
            user_message=user_message,
            bot_response=response_text,
            case_type=decision.case,
            confidence=decision.confidence,
            matched_qa_id=decision.matched_qa_id,
        ))
        asyncio.create_task(
            extract_and_store_facts(
                llm=self.llm,
                user_id=user_id,
                user_message=user_message,
                session_id=session_id,
            )
        )

    async def _handle_case_b(self, decision: QueryDecision) -> tuple[str, str, int]:
        """Known question — retrieve from KB, increment ask_count.
        Returns (display_text, tts_text, ask_count).
        """
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            result = await db.execute(select(QAPair).where(QAPair.id == decision.matched_qa_id))
            qa = result.scalar_one_or_none()
            if not qa:
                raise RuntimeError(f"QA pair {decision.matched_qa_id} not found")
            qa.ask_count += 1
            await db.commit()
            await db.refresh(qa)
            count = qa.ask_count
            # Display text includes count context; TTS reads only the answer naturally
            display_text = f"{count} {'person has' if count == 1 else 'people have'} asked this question. {qa.answer}"
            tts_text = qa.answer  # clean, no robotic prefix
            return display_text, tts_text, count

    async def _handle_case_a(
        self,
        user_message: str,
        decision: QueryDecision,
        mentor_id: str,
        user_facts=None,
    ) -> tuple[str, str]:
        """New question — RAG generation + save to unanswered pool.
        Returns (display_text, tts_text).
        """
        general_response = await self.rag.generate(
            question=user_message,
            context_chunks=decision.context_chunks,
            user_facts=user_facts,
        )

        # TTS reads the response naturally; display shows a small UI label
        tts_text = general_response
        display_text = general_response  # no robotic prefix — clean for both

        # Save to unanswered pool for mentor review
        async with AsyncSessionLocal() as db:
            entry = UnansweredPool(
                question=user_message,
                user_query_original=user_message,
                general_response=display_text,
                rag_context_used=json.dumps(decision.context_chunks),
                confidence_score=decision.confidence,
                mentor_id=mentor_id,
                status="pending",
            )
            db.add(entry)
            await db.commit()

        return display_text, tts_text

    async def _log_conversation(
        self,
        session_id: str,
        user_message: str,
        bot_response: str,
        case_type: str,
        confidence: float,
        matched_qa_id: Optional[int],
    ):
        try:
            async with AsyncSessionLocal() as db:
                log_entry = Conversation(
                    session_id=session_id,
                    user_message=user_message,
                    bot_response=bot_response,
                    case_type=case_type,
                    confidence_score=confidence,
                    matched_qa_id=matched_qa_id,
                    tts_provider=self.settings.TTS_PROVIDER,
                    avatar_provider=self.settings.AVATAR_PROVIDER,
                )
                db.add(log_entry)
                await db.commit()
        except Exception as e:
            log.error("conversation_log_error", error=str(e))
