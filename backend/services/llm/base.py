from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseLLMService(ABC):
    @abstractmethod
    async def generate(self, prompt: str, system: str = "", max_tokens: int = 300) -> str:
        """Generate a response synchronously (waits for full response)."""
        ...

    @abstractmethod
    async def stream(self, prompt: str, system: str = "") -> AsyncGenerator[str, None]:
        """Stream response tokens as they arrive."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
