"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings, get_llm_service, get_stt_service, get_tts_service, get_avatar_service, get_embedding_service
from core.orchestrator import ConversationOrchestrator
from services.vector_store import VectorStoreService
from models.database import init_db
import app_state as _app_state

log = structlog.get_logger()

# Alias for backwards compat
app_state = _app_state.state


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all services on startup, clean up on shutdown."""
    settings = get_settings()
    log.info("starting_up", llm=settings.LLM_PROVIDER, stt=settings.STT_PROVIDER,
             tts=settings.TTS_PROVIDER, avatar=settings.AVATAR_PROVIDER,
             embedding=settings.EMBEDDING_PROVIDER)

    # Initialize database tables
    await init_db()

    # Instantiate services
    app_state["settings"] = settings
    app_state["llm"] = get_llm_service(settings)
    app_state["stt"] = get_stt_service(settings)
    app_state["tts"] = get_tts_service(settings)
    app_state["avatar"] = get_avatar_service(settings)
    app_state["embedding"] = get_embedding_service(settings)
    app_state["vector_store"] = VectorStoreService(base_url=settings.QDRANT_URL)

    app_state["orchestrator"] = ConversationOrchestrator(
        settings=settings,
        llm=app_state["llm"],
        embedding=app_state["embedding"],
        vector_store=app_state["vector_store"],
        tts=app_state["tts"],
        avatar=app_state["avatar"],
    )

    log.info("startup_complete")
    yield

    # Cleanup
    log.info("shutting_down")


app = FastAPI(
    title="TalkingHeadAI API",
    version="1.0.0",
    description="Real-time conversational talking-head mentor agent",
    lifespan=lifespan,
)

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated avatar videos — path works both in Docker (/app) and locally
import os as _os
_AVATAR_DIR = _os.environ.get("AVATAR_STATIC_DIR", _os.path.join(_os.path.dirname(__file__), "static", "avatars"))
_os.makedirs(_AVATAR_DIR, exist_ok=True)
app.mount("/static/avatars", StaticFiles(directory=_AVATAR_DIR), name="avatars")

# Register routers
from api.routes.health import router as health_router
from api.routes.conversation import router as conversation_router
from api.routes.knowledge import router as knowledge_router
from api.routes.mentor import router as mentor_router
from api.routes.avatar_stream import router as avatar_stream_router
from api.routes.stt import router as stt_router
from api.routes.user import router as user_router

app.include_router(health_router, prefix="/api")
app.include_router(conversation_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(mentor_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(avatar_stream_router)
app.include_router(stt_router)


def get_orchestrator() -> ConversationOrchestrator:
    return _app_state.get_orchestrator()


def get_app_settings():
    return app_state["settings"]
