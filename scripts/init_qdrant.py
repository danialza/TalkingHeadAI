#!/usr/bin/env python3
"""Create Qdrant collections. Safe to run multiple times."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from config import get_settings
from services.vector_store import VectorStoreService


async def main():
    settings = get_settings()
    dim = settings.EMBEDDING_DIM
    print(f"[init_qdrant] Creating collections with dim={dim}...")

    vs = VectorStoreService(base_url=settings.QDRANT_URL)
    await vs.ensure_collections(dim=dim)

    count_qa = await vs.count("approved_qa")
    count_chunks = await vs.count("session_chunks")
    print(f"[init_qdrant] approved_qa: {count_qa} vectors, session_chunks: {count_chunks} vectors")
    print("[init_qdrant] Done!")


if __name__ == "__main__":
    asyncio.run(main())
