"""OpenAI cloud TTS — used as fallback when ElevenLabs is unavailable."""
from typing import AsyncGenerator

import httpx
import structlog

from services.tts.base import BaseTTSService

log = structlog.get_logger()

BASE_URL = "https://api.openai.com/v1"


class OpenAITTSService(BaseTTSService):
    def __init__(self, api_key: str, voice: str = "alloy", model: str = "tts-1"):
        self.api_key = api_key
        self.voice = voice
        self.model = model
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        log.info("openai_tts_init", voice=voice, model=model)

    async def synthesize_stream(self, text: str, language: str = "en") -> AsyncGenerator[bytes, None]:
        url = f"{BASE_URL}/audio/speech"
        payload = {
            "model": self.model,
            "voice": self.voice,
            "input": text,
            "response_format": "mp3",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            audio_bytes = resp.content
            chunk_size = 4096
            for i in range(0, len(audio_bytes), chunk_size):
                yield audio_bytes[i:i + chunk_size]

    async def synthesize(self, text: str, language: str = "en") -> bytes:
        chunks = []
        async for chunk in self.synthesize_stream(text, language):
            chunks.append(chunk)
        return b"".join(chunks)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{BASE_URL}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return resp.status_code == 200
        except Exception:
            return False
