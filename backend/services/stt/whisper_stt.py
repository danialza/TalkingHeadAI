"""Local faster-whisper STT service — calls the whisper container HTTP API."""
import httpx
import structlog

from services.stt.base import BaseSTTService, TranscriptionResult

log = structlog.get_logger()


class WhisperSTTService(BaseSTTService):
    def __init__(self, base_url: str = "http://whisper:8001"):
        self.base_url = base_url.rstrip("/")
        log.info("whisper_stt_init", url=base_url)

    async def transcribe_audio(self, audio_bytes: bytes, language: str = "en") -> TranscriptionResult:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/transcribe",
                files={"audio": ("audio.wav", audio_bytes, "audio/wav")},
                data={"language": language},
            )
            resp.raise_for_status()
            data = resp.json()
            return TranscriptionResult(
                text=data["text"],
                is_final=True,
                confidence=data.get("confidence", 1.0),
                language=data.get("language", language),
            )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False
