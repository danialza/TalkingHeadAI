"""ElevenLabs cloud TTS — very high quality voice synthesis."""
from typing import AsyncGenerator

import httpx
import structlog

from services.tts.base import BaseTTSService

log = structlog.get_logger()

BASE_URL = "https://api.elevenlabs.io/v1"


class ElevenLabsTTSService(BaseTTSService):
    def __init__(self, api_key: str, voice_id: str, model_id: str = "eleven_multilingual_v2"):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id
        self.headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
        }
        log.info("elevenlabs_tts_init", voice_id=voice_id, model=model_id)

    async def synthesize_stream(self, text: str, language: str = "en") -> AsyncGenerator[bytes, None]:
        # Use non-streaming endpoint for complete, high-quality audio with no gaps
        url = f"{BASE_URL}/text-to-speech/{self.voice_id}"
        payload = {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": {
                "stability": 0.55,
                "similarity_boost": 0.80,
                "style": 0.0,
                "use_speaker_boost": True,
            },
            "output_format": "mp3_44100_128",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            # Yield in chunks so the rest of the pipeline is unchanged
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
                resp = await client.get(f"{BASE_URL}/user", headers=self.headers)
                return resp.status_code == 200
        except Exception:
            return False
