from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator, Optional


@dataclass
class TranscriptionResult:
    text: str
    is_final: bool
    confidence: float = 1.0
    language: Optional[str] = None


class BaseSTTService(ABC):
    @abstractmethod
    async def transcribe_audio(self, audio_bytes: bytes, language: str = "en") -> TranscriptionResult:
        """Transcribe a complete audio clip (non-streaming)."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
