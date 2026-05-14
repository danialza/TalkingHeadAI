#!/usr/bin/env python3
"""
Seed the approved_qa knowledge base with university-demo Q&A pairs.

Run from project root:
    .venv/bin/python demo/university/seed_university_kb.py

Idempotent — POSTs to /api/knowledge. Re-running creates duplicates, so
truncate first if you want a clean reset.
"""
import json
import os
import sys
from pathlib import Path
from urllib import request, error

API_URL = os.environ.get("API_URL", "http://localhost:8009/api")
API_KEY = os.environ.get("API_KEY", "talkinghead-mentor-2026")

QA_FILE = Path(__file__).parent / "approved_qa.json"


def post_qa(question: str, answer: str) -> dict:
    body = json.dumps({
        "question": question,
        "answer": answer,
        "approved": True,
        "mentor_id": "professor-karimi",
        "source": "university-demo-seed",
    }).encode()
    req = request.Request(
        f"{API_URL}/knowledge",
        data=body,
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode()[:300]}


def main() -> int:
    if not QA_FILE.exists():
        print(f"Missing {QA_FILE}", file=sys.stderr)
        return 1
    pairs = json.loads(QA_FILE.read_text())
    print(f"Seeding {len(pairs)} Q&A pairs into approved_qa…")
    ok = 0
    for i, qa in enumerate(pairs, 1):
        result = post_qa(qa["question"], qa["answer"])
        if "error" in result:
            print(f"  [{i:2d}/{len(pairs)}] FAIL  {qa['question'][:60]} — {result['error']}")
        else:
            ok += 1
            print(f"  [{i:2d}/{len(pairs)}] OK    {qa['question'][:60]}")
    print(f"\nDone: {ok}/{len(pairs)} inserted.")
    return 0 if ok == len(pairs) else 2


if __name__ == "__main__":
    sys.exit(main())
