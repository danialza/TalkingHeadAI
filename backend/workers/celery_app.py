"""Celery application instance."""
import os
from celery import Celery

celery_app = Celery(
    "talkingheadai",
    broker=os.getenv("REDIS_URL", "redis://redis:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://redis:6379/1"),
    include=["workers.transcript_processor"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_routes={
        "workers.transcript_processor.process_transcript": {"queue": "transcripts"},
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_track_started=True,
    result_expires=3600,
)
