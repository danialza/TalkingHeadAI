"""SadTalker local avatar — calls the sadtalker container REST API."""
import asyncio
from typing import Optional

import httpx
import structlog

from services.avatar.base import BaseAvatarService, AvatarResult

log = structlog.get_logger()


class SadTalkerService(BaseAvatarService):
    def __init__(self, base_url: str = "http://sadtalker:8003"):
        self.base_url = base_url.rstrip("/")
        log.info("sadtalker_avatar_init", url=base_url)

    async def generate(self, audio_bytes: bytes, image_url: str) -> AvatarResult:
        """Submit generation job, poll until complete, return video URL."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Submit job
            files = {"audio": ("audio.wav", audio_bytes, "audio/wav")}
            data = {"image_url": image_url}
            resp = await client.post(f"{self.base_url}/generate", files=files, data=data)
            resp.raise_for_status()
            job_id = resp.json()["job_id"]

        # Poll for completion (SadTalker on CPU can take 2-5 mins)
        async with httpx.AsyncClient(timeout=10.0) as client:
            for attempt in range(150):  # up to 5 minutes
                await asyncio.sleep(2)
                try:
                    status_resp = await client.get(f"{self.base_url}/result/{job_id}")
                    data = status_resp.json()
                    if data["status"] == "done":
                        video_url = f"/static/avatars/{data['filename']}"
                        log.info("sadtalker_done", job_id=job_id, url=video_url)
                        return AvatarResult(video_url=video_url, job_id=job_id)
                    if data["status"] == "error":
                        raise RuntimeError(f"SadTalker failed: {data.get('error')}")
                except httpx.HTTPError:
                    pass

        raise TimeoutError(f"SadTalker job {job_id} timed out")

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False
