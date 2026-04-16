"""Health check endpoint."""
from fastapi import APIRouter
from config import get_settings
from models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    settings = get_settings()
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        providers={
            "llm": settings.LLM_PROVIDER,
            "stt": settings.STT_PROVIDER,
            "tts": settings.TTS_PROVIDER,
            "avatar": settings.AVATAR_PROVIDER,
            "embedding": settings.EMBEDDING_PROVIDER,
        },
    )
