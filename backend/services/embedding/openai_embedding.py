"""OpenAI text-embedding-3-small — 1536 dimensions."""
import structlog
from openai import AsyncOpenAI

from services.embedding.base import BaseEmbeddingService

log = structlog.get_logger()

MODEL = "text-embedding-3-small"
DIM = 1536


class OpenAIEmbeddingService(BaseEmbeddingService):
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
        log.info("openai_embedding_init", model=MODEL, dim=DIM)

    async def embed(self, text: str) -> list[float]:
        resp = await self.client.embeddings.create(model=MODEL, input=text)
        return resp.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        resp = await self.client.embeddings.create(model=MODEL, input=texts)
        return [d.embedding for d in resp.data]

    @property
    def dimension(self) -> int:
        return DIM
