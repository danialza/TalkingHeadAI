"""Ollama local LLM service — runs models like llama3.2, mistral locally."""
from typing import AsyncGenerator

import httpx
import structlog

from services.llm.base import BaseLLMService

log = structlog.get_logger()


class OllamaLLMService(BaseLLMService):
    def __init__(self, base_url: str = "http://ollama:11434", model: str = "llama3.2:3b"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        log.info("ollama_llm_init", model=model, url=base_url)

    async def generate(self, prompt: str, system: str = "", max_tokens: int = 300) -> str:
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "system": system,
                "stream": False,
                "options": {"num_predict": max_tokens},
            }
            resp = await client.post(f"{self.base_url}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json()["response"]

    async def stream(self, prompt: str, system: str = "") -> AsyncGenerator[str, None]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/generate",
                json={"model": self.model, "prompt": prompt, "system": system, "stream": True},
            ) as response:
                import json
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        yield data.get("response", "")
                        if data.get("done"):
                            break

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False
