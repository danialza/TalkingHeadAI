"""RAG pipeline — builds context-grounded prompts and calls the LLM."""
from __future__ import annotations
import re
from typing import TYPE_CHECKING, Optional

import structlog

# Strips the "[src:...|title:...|score:...] " metadata prefix added by
# query_router before feeding text to the LLM.
_META_PREFIX = re.compile(r"^\[src:[^\]]*\]\s*")

if TYPE_CHECKING:
    from services.llm.base import BaseLLMService
    from services.vector_store import VectorStoreService
    from config import Settings
    from services.user_memory_service import UserFactsDict

log = structlog.get_logger()

SYSTEM_PROMPT = """You are Noor, a knowledgeable mentor helping mentees with career and professional guidance.

CRITICAL: Your response will be spoken aloud by a voice AI. Follow these rules exactly:
1. Write 2–3 sentences MAXIMUM. Never more.
2. Always end your response with a complete, properly punctuated sentence. Never cut off mid-sentence.
3. Speak naturally and conversationally — no bullet points, no headers, no lists.
4. Be warm, encouraging, and specific.
5. Do NOT start with "I", "Well", "Great question", or filler phrases.
6. Never reference "the context" or "the knowledge base" — just answer naturally.
7. NEVER invent personal details about the user (name, job, background, past conversations). If the user asks "what is my name?", "what do I do?", "what have we talked about before?" and the answer is not explicitly provided in the "About this user" block below, honestly say you don't know yet and ask them. Do NOT guess, do NOT borrow names or careers from the context chunks — those are example stories, not facts about the user in front of you."""

# Appended to SYSTEM_PROMPT ONLY when we have user facts. This is personalization
# ONLY — the substance of the answer must be identical regardless of what we
# know about the user. The %tag% mechanism lets the LLM opt in to using a name
# naturally, and substitute_tags() later removes any tag whose fact is unknown.
PERSONALIZATION_INSTRUCTIONS = """

## About this user (for personalization ONLY):
{user_facts_block}

Personalization rules — these are STRICT:
1. Do NOT let these facts change the SUBSTANCE of your answer. The answer
   content must be identical to what you would give anyone else.
2. You MAY optionally address the user naturally using the placeholder %name%
   where a name would fit (e.g. "That's a common concern, %name%.").
3. Do NOT hardcode the literal name — always use %name% if you want to
   address them. The backend substitutes it afterwards.
4. Never reference their job, company, or other facts unless they directly
   relate to answering the question. Prefer NOT referencing them.
5. Use %name% at most ONCE per response. Do not overuse it."""

RAG_PROMPT_TEMPLATE = """{system}

## Relevant Knowledge:
{approved_qa_context}

{session_context}

## Question: {question}

Answer in 2–3 complete sentences. End on a complete sentence."""


class RAGPipeline:
    def __init__(
        self,
        llm: "BaseLLMService",
        vector_store: "VectorStoreService",
        settings: "Settings",
    ):
        self.llm = llm
        self.vector_store = vector_store
        self.settings = settings

    async def generate(
        self,
        question: str,
        context_chunks: list[str],
        user_facts: "Optional[UserFactsDict]" = None,
    ) -> str:
        """Build RAG prompt and call LLM.

        If `user_facts` is provided and non-empty, a personalization block is
        appended to the system prompt. The LLM may use `%name%` etc. which the
        orchestrator later substitutes via `substitute_tags()`.
        """
        # Separate QA pairs from text chunks
        qa_context_parts = []
        session_context_parts = []

        for chunk in context_chunks:
            # Detect source from metadata prefix (new format) or fall back to
            # legacy "Q:" heuristic. Then strip the prefix before using the
            # text — Claude should never see our internal metadata tags.
            prefix = _META_PREFIX.match(chunk)
            if prefix:
                is_qa = "src:qa" in prefix.group(0)
                clean = chunk[prefix.end():]
            else:
                is_qa = chunk.startswith("Q:") and "\nA:" in chunk
                clean = chunk
            if is_qa:
                qa_context_parts.append(clean)
            else:
                session_context_parts.append(clean)

        approved_qa_context = "\n\n".join(qa_context_parts) if qa_context_parts else "No approved Q&A available."
        session_context = "\n\n".join(session_context_parts) if session_context_parts else "No session context available."

        # Personalization block — only added when facts exist. Never affects
        # the body of the answer, only opens the door to optional %name% usage.
        personalization = ""
        if user_facts is not None and not user_facts.is_empty():
            personalization = PERSONALIZATION_INSTRUCTIONS.format(
                user_facts_block=user_facts.as_prompt_block()
            )

        system_full = (
            SYSTEM_PROMPT
            + personalization
            + f"\n\n## Context:\n{approved_qa_context}\n\n{session_context}"
        )

        log.info(
            "rag_generating",
            qa_chunks=len(qa_context_parts),
            session_chunks=len(session_context_parts),
            has_user_facts=bool(personalization),
        )
        response = await self.llm.generate(prompt=question, system=system_full)
        return response
