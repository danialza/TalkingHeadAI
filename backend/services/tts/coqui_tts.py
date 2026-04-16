"""Coqui XTTS v2 local TTS — voice cloning with reference WAV."""
from typing import AsyncGenerator

import httpx
import structlog

from services.tts.base import BaseTTSService

log = structlog.get_logger()


class CoquiTTSService(BaseTTSService):
    def __init__(self, base_url: str = "http://coqui-tts:8002", speaker_wav_url: str = ""):
        self.base_url = base_url.rstrip("/")
        self.speaker_wav_url = speaker_wav_url
        log.info("coqui_tts_init", url=base_url)

    async def synthesize_stream(self, text: str, language: str = "en") -> AsyncGenerator[bytes, None]:
        # Coqui doesn't stream natively — synthesize then yield as one chunk
        audio = await self.synthesize(text, language)
        yield audio

    async def synthesize(self, text: str, language: str = "en") -> bytes:
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "text": text,
                "language": language,
                "speaker_wav_url": self.speaker_wav_url or None,
            }
            resp = await client.post(f"{self.base_url}/synthesize", json=payload)
            resp.raise_for_status()
            return resp.content  # raw WAV bytes

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False
