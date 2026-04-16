#!/usr/bin/env python3
"""
Seed the knowledge base with initial Q&A pairs from podcast_qa.json.
Runs DB inserts + Qdrant indexing.

Usage: python seed/seed_kb.py
"""
import asyncio
import json
import sys
import os

# Make sure backend/ is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import get_settings, get_embedding_service
from models.database import init_db, AsyncSessionLocal, QAPair
from services.vector_store import VectorStoreService


async def seed():
    settings = get_settings()
    print(f"[seed] LLM: {settings.LLM_PROVIDER}, Embedding: {settings.EMBEDDING_PROVIDER}")

    # Init DB tables
    await init_db()

    embedding_svc = get_embedding_service(settings)
    vector_store = VectorStoreService(base_url=settings.QDRANT_URL)
    await vector_store.ensure_collections(dim=settings.EMBEDDING_DIM)

    # Load Q&A pairs
    qa_file = os.path.join(os.path.dirname(__file__), "podcast_qa.json")
    with open(qa_file) as f:
        qa_data = json.load(f)

    print(f"[seed] Seeding {len(qa_data)} Q&A pairs...")

    async with AsyncSessionLocal() as db:
        for item in qa_data:
            # Check if already exists
            from sqlalchemy import select
            existing = await db.execute(
                select(QAPair).where(QAPair.question == item["question"])
            )
            if existing.scalar_one_or_none():
                print(f"  [skip] {item['question'][:60]}...")
                continue

            # Insert into PostgreSQL
            qa = QAPair(
                question=item["question"],
                answer=item["answer"],
                mentor_id=item.get("mentor_id", "jack"),
                source="podcast",
                approved=True,
            )
            db.add(qa)
            await db.flush()
            await db.refresh(qa)

            # Embed and index in Qdrant
            vector = await embedding_svc.embed(qa.question)
            await vector_store.upsert(
                collection="approved_qa",
                vector_id=qa.id,
                vector=vector,
                payload={
                    "qa_id": qa.id,
                    "question": qa.question,
                    "answer": qa.answer,
                    "mentor_id": qa.mentor_id,
                },
            )
            print(f"  [ok] id={qa.id} {qa.question[:60]}...")

        await db.commit()

    count = await vector_store.count("approved_qa")
    print(f"[seed] Done! approved_qa collection has {count} vectors.")


if __name__ == "__main__":
    asyncio.run(seed())
