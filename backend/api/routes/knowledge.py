"""Knowledge base CRUD endpoints."""
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db, QAPair
from models.schemas import QAPairCreate, QAPairUpdate, QAPairResponse
from api.middleware.auth import require_api_key

log = structlog.get_logger()
router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=list[QAPairResponse])
async def list_qa_pairs(
    limit: int = 50,
    offset: int = 0,
    approved_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    query = select(QAPair).order_by(desc(QAPair.ask_count)).limit(limit).offset(offset)
    if approved_only:
        query = query.where(QAPair.approved == True)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=QAPairResponse, status_code=status.HTTP_201_CREATED)
async def create_qa_pair(
    payload: QAPairCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_api_key),
):
    qa = QAPair(**payload.model_dump())
    db.add(qa)
    await db.flush()
    await db.refresh(qa)

    # Index in Qdrant
    if qa.approved:
        await _index_qa(qa)

    return qa


@router.patch("/{qa_id}", response_model=QAPairResponse)
async def update_qa_pair(
    qa_id: int,
    payload: QAPairUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_api_key),
):
    result = await db.execute(select(QAPair).where(QAPair.id == qa_id))
    qa = result.scalar_one_or_none()
    if not qa:
        raise HTTPException(status_code=404, detail="QA pair not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(qa, field, value)

    await db.flush()
    await db.refresh(qa)

    if qa.approved:
        await _index_qa(qa)

    return qa


@router.delete("/{qa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_qa_pair(
    qa_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_api_key),
):
    result = await db.execute(select(QAPair).where(QAPair.id == qa_id))
    qa = result.scalar_one_or_none()
    if not qa:
        raise HTTPException(status_code=404, detail="QA pair not found")
    await db.delete(qa)


async def _index_qa(qa: QAPair):
    """Embed Q&A pair and upsert into Qdrant approved_qa collection."""
    try:
        from main import app_state
        embedding_svc = app_state["embedding"]
        vector_store = app_state["vector_store"]

        vector = await embedding_svc.embed(qa.question)
        await vector_store.upsert(
            collection="approved_qa",
            vector_id=qa.id,
            vector=vector,
            payload={
                "qa_id": qa.id,
                "question": qa.question,
                "answer": qa.answer,
                "mentor_id": qa.mentor_id,
            },
        )
        log.info("qa_indexed", qa_id=qa.id)
    except Exception as e:
        log.error("qa_index_error", qa_id=qa.id, error=str(e))
