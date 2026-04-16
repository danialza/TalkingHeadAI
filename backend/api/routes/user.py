"""User memory endpoints — read and wipe long-term personal facts."""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

import structlog

from models.database import AsyncSessionLocal, UserFact
from models.schemas import (
    UserFactResponse,
    UserMemoryResponse,
    UserMemoryResetResponse,
)
from services.user_memory_service import reset_user

log = structlog.get_logger()
router = APIRouter(tags=["user"])


@router.get("/user/{user_id}/facts", response_model=UserMemoryResponse)
async def get_user_facts(user_id: str):
    """List all stored facts for a user_id."""
    if not user_id or user_id == "anon":
        return UserMemoryResponse(user_id=user_id, facts=[])
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserFact).where(UserFact.user_id == user_id).order_by(UserFact.key)
        )
        rows = result.scalars().all()
    return UserMemoryResponse(
        user_id=user_id,
        facts=[
            UserFactResponse(key=r.key, value=r.value, updated_at=r.updated_at)
            for r in rows
        ],
    )


@router.delete("/user/{user_id}/facts", response_model=UserMemoryResetResponse)
async def delete_user_facts(user_id: str):
    """Wipe everything the system has learned about this user."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    deleted = await reset_user(user_id)
    log.info("user_facts_reset", user_id=user_id, deleted=deleted)
    return UserMemoryResetResponse(user_id=user_id, deleted=deleted)
