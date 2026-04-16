"""
Central configuration and service provider factory.
Set LLM_PROVIDER, STT_PROVIDER, TTS_PROVIDER, AVATAR_PROVIDER, EMBEDDING_PROVIDER
in .env to switch between local and cloud implementations.
"""
from __future__ import annotations
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # ── Provider selectors ───────────────────────────────
    LLM_PROVIDER: str = "claude"        # claude | ollama
    STT_PROVIDER: str = "deepgram"      # deepgram | whisper
    TTS_PROVIDER: str = "elevenlabs"    # elevenlabs | openai | coqui
    OPENAI_TTS_VOICE: str = "alloy"     # alloy | echo | fable | onyx | nova | shimmer
    OPENAI_TTS_MODEL: str = "tts-1"     # tts-1 | tts-1-hd
    AVATAR_PROVIDER: str = "did"        # did | sadtalker
    EMBEDDING_PROVIDER: str = "openai"  # openai | local

    # ── Cloud API keys ───────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""
    DID_API_KEY: str = ""
    DID_PRESENTER_ID: str = ""       # clips mode — pre-built D-ID avatar
    DID_AVATAR_IMAGE_URL: str = ""   # talks mode — custom photo URL
    DID_STREAM_IMAGE_URL: str = ""   # streaming mode — photo for WebRTC stream

    # ── Local service URLs ───────────────────────────────
    WHISPER_URL: str = "http://whisper:8001"
    COQUI_TTS_URL: str = "http://coqui-tts:8002"
    SADTALKER_URL: str = "http://sadtalker:8003"
    OLLAMA_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "llama3.2:3b"

    # ── Database ─────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://thuser:thpassword@postgres:5432/talkinghead"
    QDRANT_URL: str = "http://qdrant:6333"
    REDIS_URL: str = "redis://redis:6379"

    # ── Application ──────────────────────────────────────
    SIMILARITY_THRESHOLD: float = 0.85
    RAG_TOP_K: int = 5
    LLM_MAX_TOKENS: int = 300
    EMBEDDING_DIM: int = 1536           # 1536 for openai, 768 for local
    API_KEY: str = "change-me-in-prod"

    # ── Voice / Avatar ───────────────────────────────────
    SPEAKER_WAV_URL: str = ""           # Reference voice for Coqui TTS cloning
    SADTALKER_STILL: bool = True
    SADTALKER_ENHANCER: str = "gfpgan"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# ── Service factories ────────────────────────────────────────────────────────

def get_llm_service(settings: Settings):
    from services.llm.base import BaseLLMService
    if settings.LLM_PROVIDER == "claude":
        from services.llm.claude_llm import ClaudeLLMService
        return ClaudeLLMService(api_key=settings.ANTHROPIC_API_KEY, max_tokens=settings.LLM_MAX_TOKENS)
    if settings.LLM_PROVIDER == "ollama":
        from services.llm.ollama_llm import OllamaLLMService
        return OllamaLLMService(base_url=settings.OLLAMA_URL, model=settings.OLLAMA_MODEL)
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.LLM_PROVIDER!r}")


def get_stt_service(settings: Settings):
    if settings.STT_PROVIDER == "deepgram":
        from services.stt.deepgram_stt import DeepgramSTTService
        return DeepgramSTTService(api_key=settings.DEEPGRAM_API_KEY)
    if settings.STT_PROVIDER == "whisper":
        from services.stt.whisper_stt import WhisperSTTService
        return WhisperSTTService(base_url=settings.WHISPER_URL)
    raise ValueError(f"Unknown STT_PROVIDER: {settings.STT_PROVIDER!r}")


def get_tts_service(settings: Settings):
    if settings.TTS_PROVIDER == "elevenlabs":
        from services.tts.elevenlabs_tts import ElevenLabsTTSService
        return ElevenLabsTTSService(api_key=settings.ELEVENLABS_API_KEY, voice_id=settings.ELEVENLABS_VOICE_ID)
    if settings.TTS_PROVIDER == "openai":
        from services.tts.openai_tts import OpenAITTSService
        return OpenAITTSService(
            api_key=settings.OPENAI_API_KEY,
            voice=settings.OPENAI_TTS_VOICE,
            model=settings.OPENAI_TTS_MODEL,
        )
    if settings.TTS_PROVIDER == "coqui":
        from services.tts.coqui_tts import CoquiTTSService
        return CoquiTTSService(base_url=settings.COQUI_TTS_URL, speaker_wav_url=settings.SPEAKER_WAV_URL)
    raise ValueError(f"Unknown TTS_PROVIDER: {settings.TTS_PROVIDER!r}")


def get_avatar_service(settings: Settings):
    if settings.AVATAR_PROVIDER == "did":
        from services.avatar.did_avatar import DIDService
        return DIDService(
            api_key=settings.DID_API_KEY,
            presenter_id=settings.DID_PRESENTER_ID,
            avatar_image_url=settings.DID_AVATAR_IMAGE_URL,
        )
    if settings.AVATAR_PROVIDER == "sadtalker":
        from services.avatar.sadtalker_avatar import SadTalkerService
        return SadTalkerService(base_url=settings.SADTALKER_URL)
    raise ValueError(f"Unknown AVATAR_PROVIDER: {settings.AVATAR_PROVIDER!r}")


def get_embedding_service(settings: Settings):
    if settings.EMBEDDING_PROVIDER == "openai":
        from services.embedding.openai_embedding import OpenAIEmbeddingService
        return OpenAIEmbeddingService(api_key=settings.OPENAI_API_KEY)
    if settings.EMBEDDING_PROVIDER == "local":
        from services.embedding.local_embedding import LocalEmbeddingService
        return LocalEmbeddingService()
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {settings.EMBEDDING_PROVIDER!r}")
