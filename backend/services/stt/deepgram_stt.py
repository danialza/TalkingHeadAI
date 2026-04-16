"""Deepgram cloud STT service."""
import structlog
from deepgram import DeepgramClient, PrerecordedOptions

from services.stt.base import BaseSTTService, TranscriptionResult

log = structlog.get_logger()


class DeepgramSTTService(BaseSTTService):
    def __init__(self, api_key: str):
        self.client = DeepgramClient(api_key)
        log.info("deepgram_stt_init")

    async def transcribe_audio(self, audio_bytes: bytes, language: str = "en") -> TranscriptionResult:
        options = PrerecordedOptions(
            model="nova-2",
            language=language,
            punctuate=True,
            smart_format=True,
        )
        payload = {"buffer": audio_bytes}
        response = await self.client.listen.asyncrest.v("1").transcribe_file(payload, options)

        result = response.results.channels[0].alternatives[0]
        return TranscriptionResult(
            text=result.transcript,
            is_final=True,
            confidence=result.confidence,
            language=language,
        )

    async def health_check(self) -> bool:
        return bool(self.client)
