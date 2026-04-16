from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseTTSService(ABC):
    @abstractmethod
    async def synthesize_stream(self, text: str, language: str = "en") -> AsyncGenerator[bytes, None]:
        """Stream audio bytes (mp3 or wav chunks) as they arrive."""
        ...

    @abstractmethod
    async def synthesize(self, text: str, language: str = "en") -> bytes:
        """Synthesize full audio and return all bytes at once."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
