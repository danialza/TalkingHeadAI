"""SQLAlchemy async ORM models."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, Float, ForeignKey,
    Integer, String, Text, DateTime, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

from config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class QAPair(Base):
    """Mentor-approved question/answer pairs — the knowledge base."""
    __tablename__ = "qa_pairs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    mentor_id = Column(String(100), nullable=False)
    ask_count = Column(Integer, default=0, nullable=False)
    source = Column(String(50), default="manual")   # manual | podcast | session
    approved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Qdrant vector ID for this QA pair
    vector_id = Column(String(100), nullable=True)


class UnansweredPool(Base):
    """Questions asked by users that weren't in the knowledge base."""
    __tablename__ = "unanswered_pool"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question = Column(Text, nullable=False)
    user_query_original = Column(Text, nullable=False)
    general_response = Column(Text, nullable=True)    # The RAG response given
    rag_context_used = Column(Text, nullable=True)    # JSON of context chunks
    # Best similarity score against approved_qa at routing time (0–1). For a
    # Case A row, this is how close the question came to being a KB hit — the
    # threshold recommender uses the distribution of these to suggest a new
    # similarity threshold per mentor.
    confidence_score = Column(Float, nullable=True)
    mentor_id = Column(String(100), nullable=True)
    status = Column(String(20), default="pending")    # pending | answered | dismissed
    mentor_answer = Column(Text, nullable=True)
    # True iff the mentor's approved answer was a verbatim copy of the AI RAG
    # response. These rows are EXCLUDED from threshold recommendations — they
    # signal the AI was already right, not that the threshold was wrong.
    answer_was_copied = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    # Semantic cluster id — rows sharing a cluster_id are grouped as "similar
    # questions" in the mentor dashboard. NULL means unassigned; the mentor
    # dashboard lazily assigns it on first GET.
    cluster_id = Column(Integer, nullable=True, index=True)


class SessionTranscript(Base):
    """Transcripts from mentor-mentee sessions used for RAG context."""
    __tablename__ = "session_transcripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mentor_id = Column(String(100), nullable=False)
    mentee_id = Column(String(100), nullable=True)
    transcript_text = Column(Text, nullable=False)
    source = Column(String(50), default="session")    # session | podcast
    session_date = Column(DateTime(timezone=True), nullable=True)
    processed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Conversation(Base):
    """Log of every conversation turn for analytics."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), nullable=False)   # UUID as string
    user_message = Column(Text, nullable=False)
    bot_response = Column(Text, nullable=False)
    case_type = Column(String(1), nullable=False)     # A | B
    confidence_score = Column(Float, nullable=True)
    matched_qa_id = Column(Integer, ForeignKey("qa_pairs.id"), nullable=True)
    tts_provider = Column(String(50), nullable=True)
    avatar_provider = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserFact(Base):
    """Long-term facts extracted about a user (name, job, goals, ...).

    Scoped by a browser-local `user_id` — one row per (user_id, key).
    Values are short plain strings; the extractor stores structured info
    here so future turns can greet users personally without changing the
    substance of answers. Users can reset their facts via the API.
    """
    __tablename__ = "user_facts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)
    key = Column(String(50), nullable=False)       # 'name' | 'job' | 'company' | ...
    value = Column(Text, nullable=False)           # short plain-string value
    confidence = Column(Float, default=1.0)
    source_session_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


async def init_db():
    """Create all tables if they don't exist + add any columns introduced after
    the initial schema was created (lightweight in-process migration).
    """
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add cluster_id on existing installs (create_all doesn't ALTER).
        await conn.execute(
            text(
                "ALTER TABLE unanswered_pool "
                "ADD COLUMN IF NOT EXISTS cluster_id INTEGER"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_unanswered_pool_cluster_id "
                "ON unanswered_pool (cluster_id)"
            )
        )
        # Routing confidence + copy-paste flag for threshold recommender.
        await conn.execute(
            text(
                "ALTER TABLE unanswered_pool "
                "ADD COLUMN IF NOT EXISTS confidence_score FLOAT"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE unanswered_pool "
                "ADD COLUMN IF NOT EXISTS answer_was_copied BOOLEAN DEFAULT FALSE"
            )
        )
        # user_facts — long-term personalization memory. `create_all` above
        # already creates the table on fresh installs; the UNIQUE index is
        # needed for the upsert path in user_memory_service.
        await conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_facts_user_id_key "
                "ON user_facts (user_id, key)"
            )
        )


async def get_db():
    """FastAPI dependency for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
