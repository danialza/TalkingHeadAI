"""Claude API (Anthropic) LLM service — default provider."""
from typing import AsyncGenerator

import anthropic
import structlog

from services.llm.base import BaseLLMService

log = structlog.get_logger()


class ClaudeLLMService(BaseLLMService):
    MODEL = "claude-sonnet-4-5"

    def __init__(self, api_key: str, max_tokens: int = 300):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.max_tokens = max_tokens
        log.info("claude_llm_init", model=self.MODEL)

    async def generate(self, prompt: str, system: str = "", max_tokens: int = 0) -> str:
        tokens = max_tokens or self.max_tokens
        message = await self.client.messages.create(
            model=self.MODEL,
            max_tokens=tokens,
            system=system or "You are a helpful mentor assistant.",
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    async def stream(self, prompt: str, system: str = "") -> AsyncGenerator[str, None]:
        async with self.client.messages.stream(
            model=self.MODEL,
            max_tokens=self.max_tokens,
            system=system or "You are a helpful mentor assistant.",
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def health_check(self) -> bool:
        try:
            msg = await self.client.messages.create(
                model=self.MODEL,
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return bool(msg.content)
        except Exception as e:
            log.error("claude_health_fail", error=str(e))
            return False
