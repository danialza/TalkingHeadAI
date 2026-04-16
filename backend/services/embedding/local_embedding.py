"""
Local sentence-transformers embedding — no API cost.
Uses nomic-embed-text (768 dim) for good quality.
Loaded lazily to avoid slowing startup.
"""
import asyncio
import structlog

from services.embedding.base import BaseEmbeddingService

log = structlog.get_logger()

MODEL_NAME = "nomic-ai/nomic-embed-text-v1"
DIM = 768


class LocalEmbeddingService(BaseEmbeddingService):
    def __init__(self, model_name: str = MODEL_NAME):
        self.model_name = model_name
        self._model = None
        log.info("local_embedding_init", model=model_name, dim=DIM)

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name, trust_remote_code=True)
            log.info("local_embedding_loaded", model=self.model_name)
        return self._model

    async def embed(self, text: str) -> list[float]:
        loop = asyncio.get_event_loop()
        model = self._get_model()
        embedding = await loop.run_in_executor(None, lambda: model.encode(text).tolist())
        return embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        loop = asyncio.get_event_loop()
        model = self._get_model()
        embeddings = await loop.run_in_executor(None, lambda: model.encode(texts).tolist())
        return embeddings

    @property
    def dimension(self) -> int:
        return DIM
