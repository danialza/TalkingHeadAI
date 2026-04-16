"""Long-term user memory — extracts and stores personal facts.

Design rules:
- Facts are scoped by `user_id` (browser-local, not authenticated).
- Extraction runs AFTER a user message is processed so it never blocks
  the response. Fire-and-forget asyncio task.
- Facts are injected into the system prompt for personalization ONLY.
  The RAG pipeline tells Claude that these facts must not change the
  substance of answers — only tone/greeting.
- Case B (KB hit) answers are returned verbatim from the knowledge base,
  so facts never alter their content. Case A answers may optionally use
  `%name%` placeholders which `substitute_tags()` resolves.
- A `reset_user(user_id)` helper wipes everything learned about a user.

The extractor uses a strict JSON-only prompt; parse failures are logged
and ignored so a broken extractor never breaks the chat.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

import structlog
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models.database import AsyncSessionLocal, UserFact

if TYPE_CHECKING:
    from services.llm.base import BaseLLMService

log = structlog.get_logger()

# Keys we accept from the extractor. Anything else is dropped — keeps the
# memory tight and predictable, avoids the LLM inventing dozens of fields.
ALLOWED_KEYS = {
    "name",
    "job",
    "company",
    "experience_level",
    "location",
    "interests",
    "current_challenge",
    "goals",
}

# Strict JSON-only extractor prompt. The model must return an object whose
# keys are a subset of ALLOWED_KEYS. Empty `{}` is valid and expected for
# turns that contain no self-disclosure.
EXTRACTOR_SYSTEM = """You extract personal facts from user messages in a career-mentoring chat.

Output a JSON object with ONLY these allowed keys (omit any you aren't sure about):
- name: the user's first name (just the name, e.g. "Sarah")
- job: their current job title (e.g. "backend engineer")
- company: current employer name
- experience_level: short phrase e.g. "junior", "5 years", "senior"
- location: city or country
- interests: short comma-separated topics they care about
- current_challenge: what they're currently working on or struggling with
- goals: short phrase describing their career goal

Rules:
1. Output ONLY a valid JSON object. No markdown, no code fences, no prose.
2. Use null or omit keys you're not CONFIDENT about. Do not guess.
3. Only extract facts about the USER themselves, never about third parties.
4. If the new message contradicts an existing fact, prefer the new value.
5. If nothing new is said about the user, output exactly: {}
"""

EXTRACTOR_USER_TEMPLATE = """Existing known facts about this user:
{existing}

New user message:
\"\"\"{message}\"\"\"

Output the updated/new facts as JSON."""


@dataclass
class UserFactsDict:
    """Simple mapping of fact key → value. `.get('name')` for templating."""

    data: dict[str, str]

    def get(self, key: str, default: str = "") -> str:
        return self.data.get(key, default)

    def as_prompt_block(self) -> str:
        if not self.data:
            return ""
        lines = [f"- {k}: {v}" for k, v in self.data.items()]
        return "\n".join(lines)

    def is_empty(self) -> bool:
        return not self.data


# ── Persistence ──────────────────────────────────────────────────────────────

async def load_user_facts(user_id: str) -> UserFactsDict:
    """Load all facts for a user_id. Returns empty dict if none."""
    if not user_id or user_id == "anon":
        return UserFactsDict(data={})
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserFact.key, UserFact.value).where(UserFact.user_id == user_id)
        )
        rows = result.all()
    return UserFactsDict(data={k: v for k, v in rows})


async def upsert_fact(
    user_id: str,
    key: str,
    value: str,
    session_id: Optional[str] = None,
) -> None:
    """Upsert a single (user_id, key) → value row."""
    if not user_id or not key or not value:
        return
    stmt = (
        pg_insert(UserFact)
        .values(
            user_id=user_id,
            key=key,
            value=value,
            confidence=1.0,
            source_session_id=session_id,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "key"],
            set_={
                "value": value,
                "source_session_id": session_id,
                # `updated_at` uses `onupdate=func.now()` on the column but
                # on_conflict_do_update bypasses it, so set explicitly.
                "updated_at": __import__("sqlalchemy").func.now(),
            },
        )
    )
    async with AsyncSessionLocal() as db:
        await db.execute(stmt)
        await db.commit()


async def reset_user(user_id: str) -> int:
    """Delete all facts for a user. Returns deleted row count."""
    if not user_id:
        return 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(delete(UserFact).where(UserFact.user_id == user_id))
        await db.commit()
        return result.rowcount or 0


# ── Extraction ───────────────────────────────────────────────────────────────

# Strips ```json fences Claude sometimes adds despite instructions.
_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _parse_json_loose(raw: str) -> dict:
    """Best-effort JSON parse: strip code fences, find outermost {...}."""
    if not raw:
        return {}
    cleaned = _JSON_FENCE.sub("", raw).strip()
    # Find the first {...} block.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        parsed = json.loads(cleaned[start : end + 1])
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


async def extract_and_store_facts(
    llm: "BaseLLMService",
    user_id: str,
    user_message: str,
    session_id: Optional[str] = None,
) -> dict:
    """Run the extractor on one user message and upsert any new facts.

    Safe to `asyncio.create_task()` — all errors are caught and logged.
    Returns the dict of facts that were written (empty on no-op/error).
    """
    if not user_id or user_id == "anon" or not user_message.strip():
        return {}

    try:
        existing = await load_user_facts(user_id)
        existing_json = (
            json.dumps(existing.data, ensure_ascii=False)
            if not existing.is_empty()
            else "{}"
        )
        prompt = EXTRACTOR_USER_TEMPLATE.format(
            existing=existing_json,
            message=user_message.strip()[:2000],
        )
        raw = await llm.generate(
            prompt=prompt,
            system=EXTRACTOR_SYSTEM,
            max_tokens=200,
        )
        parsed = _parse_json_loose(raw)
        if not parsed:
            return {}

        written: dict[str, str] = {}
        for k, v in parsed.items():
            if k not in ALLOWED_KEYS:
                continue
            if v is None:
                continue
            val = str(v).strip()
            if not val or val.lower() in {"null", "none", "unknown"}:
                continue
            # Clamp length to keep prompts lean.
            if len(val) > 200:
                val = val[:200]
            await upsert_fact(user_id, k, val, session_id=session_id)
            written[k] = val

        if written:
            log.info(
                "user_facts_extracted",
                user_id=user_id,
                keys=list(written.keys()),
            )
        return written
    except Exception as e:
        log.warning("user_fact_extraction_failed", user_id=user_id, error=str(e))
        return {}


# ── Response templating ─────────────────────────────────────────────────────

# Matches `%name%` and also gracefully swallows an optional trailing ", "
# so "Hi %name%, how are you" → "Hi, how are you" when name is unknown
# becomes a clean "Hi how are you".
_TAG_WITH_TRAILING_COMMA = re.compile(r"%(\w+)%,?\s?")


def substitute_tags(text: str, facts: UserFactsDict) -> str:
    """Replace `%name%`, `%job%`, etc. with stored values.

    - If the fact is known → replace with the value.
    - If the fact is unknown → remove the tag + any trailing comma+space
      so the sentence stays natural.
    - Trims leading/trailing whitespace and collapses double spaces.
    """
    if not text or "%" not in text:
        return text

    def _repl(m: re.Match) -> str:
        key = m.group(1).lower()
        val = facts.get(key)
        if val:
            # Preserve the original trailing whitespace/comma that was in
            # the template by returning value + whatever came after the tag.
            trailing = m.group(0)[len(f"%{m.group(1)}%") :]
            return f"{val}{trailing}"
        return ""

    out = _TAG_WITH_TRAILING_COMMA.sub(_repl, text)
    # Collapse runs of spaces and fix " ," artifacts.
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+([,.!?])", r"\1", out)
    return out.strip()
