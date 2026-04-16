"""Pydantic schemas for API request/response validation."""
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


# ── QA Pairs ────────────────────────────────────────────────────────────────

class QAPairCreate(BaseModel):
    question: str = Field(..., min_length=5, max_length=2000)
    answer: str = Field(..., min_length=5, max_length=5000)
    mentor_id: str = Field(..., max_length=100)
    source: str = Field(default="manual")
    approved: bool = Field(default=True)


class QAPairUpdate(BaseModel):
    answer: Optional[str] = None
    approved: Optional[bool] = None


class QAPairResponse(BaseModel):
    id: int
    question: str
    answer: str
    mentor_id: str
    ask_count: int
    source: str
    approved: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Unanswered Pool ──────────────────────────────────────────────────────────

class UnansweredPoolResponse(BaseModel):
    id: int
    question: str
    user_query_original: str
    general_response: Optional[str]
    rag_context_used: Optional[str] = None  # JSON-encoded list of context chunks
    confidence_score: Optional[float] = None  # best similarity vs approved_qa at routing time
    mentor_id: Optional[str]
    status: str
    created_at: datetime
    reviewed_at: Optional[datetime]

    class Config:
        from_attributes = True


class MentorAnswerRequest(BaseModel):
    mentor_answer: str = Field(..., min_length=5, max_length=5000)
    add_to_kb: bool = Field(default=True, description="Add answer to knowledge base")
    mentor_id: str = Field(..., max_length=100)
    group_ids: Optional[List[int]] = Field(
        default=None,
        description="When set, mark all these unanswered rows as answered (duplicate grouping).",
    )


class DismissRequest(BaseModel):
    group_ids: Optional[List[int]] = Field(
        default=None,
        description="When set, dismiss all these ids in one call.",
    )


class UnansweredVariant(BaseModel):
    id: int
    question: str
    similarity: float  # cosine similarity to representative, 1.0 for the rep itself
    created_at: datetime


class UnansweredGroupResponse(BaseModel):
    cluster_id: int
    representative_id: int
    question: str
    count: int
    group_ids: List[int]
    variants: List[UnansweredVariant]  # includes representative
    general_response: Optional[str]
    rag_context_used: Optional[str] = None  # JSON-encoded list of context chunks
    confidence_score: Optional[float] = None  # best similarity vs approved_qa
    mentor_id: Optional[str]
    created_at: datetime
    latest_created_at: datetime


# ── Chat ─────────────────────────────────────────────────────────────────────

class TextChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(default="test-session")
    mentor_id: str = Field(default="default")
    user_id: str = Field(default="anon", max_length=100)


# ── User Memory ──────────────────────────────────────────────────────────────

class UserFactResponse(BaseModel):
    key: str
    value: str
    updated_at: datetime

    class Config:
        from_attributes = True


class UserMemoryResponse(BaseModel):
    user_id: str
    facts: List[UserFactResponse]


class UserMemoryResetResponse(BaseModel):
    user_id: str
    deleted: int


class TextChatResponse(BaseModel):
    response: str
    case: Literal["A", "B"]
    confidence: float
    matched_qa_id: Optional[int] = None
    ask_count: Optional[int] = None
    context_chunks: Optional[List[str]] = None  # raw RAG chunks (Case A only)


# ── WebSocket messages ────────────────────────────────────────────────────────

class WSClientMessage(BaseModel):
    type: Literal["audio_chunk", "text_message", "start_recording", "stop_recording"]
    data: Optional[str] = None


class WSServerMessage(BaseModel):
    type: str
    data: Optional[str] = None
    status: Optional[str] = None
    case: Optional[str] = None
    is_final: Optional[bool] = None
    confidence: Optional[float] = None


# ── Session Transcripts ───────────────────────────────────────────────────────

class TranscriptCreate(BaseModel):
    mentor_id: str
    mentee_id: Optional[str] = None
    transcript_text: str
    source: str = "session"
    session_date: Optional[datetime] = None


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    providers: dict
