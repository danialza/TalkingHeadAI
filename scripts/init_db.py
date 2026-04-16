#!/usr/bin/env python3
"""Create all PostgreSQL tables. Safe to run multiple times."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from models.database import init_db, engine
import structlog

log = structlog.get_logger()


async def main():
    print("[init_db] Creating tables...")
    await init_db()
    await engine.dispose()
    print("[init_db] Done!")


if __name__ == "__main__":
    asyncio.run(main())
