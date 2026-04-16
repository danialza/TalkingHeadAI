"""
D-ID cloud talking-head avatar.

Supports two modes:
  clips mode  (preferred): uses /clips endpoint with a presenter_id
                           Pre-built photo-realistic avatars, better quality
  talks mode  (fallback):  uses /talks endpoint with a source image URL
                           Custom photo → talking head

Set DID_PRESENTER_ID in .env to use clips mode.
Set DID_AVATAR_IMAGE_URL to use talks mode.
"""
import asyncio
import base64
import tempfile
import os
from typing import Optional

import httpx
import structlog

from services.avatar.base import BaseAvatarService, AvatarResult

log = structlog.get_logger()

DID_API_URL = "https://api.d-id.com"


class DIDService(BaseAvatarService):
    def __init__(
        self,
        api_key: str,
        presenter_id: str = "",
        avatar_image_url: str = "",
    ):
        self.presenter_id = presenter_id
        self.avatar_image_url = avatar_image_url

        # D-ID API key is "base64(email):secret" — base64-encode the whole thing
        credentials = base64.b64encode(api_key.encode()).decode()
        self.headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        mode = "clips" if presenter_id else "talks"
        log.info("did_avatar_init", mode=mode, presenter=presenter_id, image=avatar_image_url)

    async def generate(self, audio_bytes: bytes, image_url: str = "") -> AvatarResult:
        if self.presenter_id:
            return await self._generate_clips(audio_bytes)
        return await self._generate_talks(audio_bytes, image_url or self.avatar_image_url)

    async def _upload_audio(self, client: httpx.AsyncClient, audio_bytes: bytes) -> str:
        """Upload audio to D-ID via multipart form and return a hosted HTTPS URL."""
        # Detect mime type from magic bytes
        if audio_bytes[:3] == b'ID3' or audio_bytes[:2] == b'\xff\xfb':
            mime, ext = "audio/mp3", "mp3"
        elif audio_bytes[:4] == b'RIFF':
            mime, ext = "audio/wav", "wav"
        else:
            mime, ext = "audio/mpeg", "mp3"

        # D-ID /audios expects multipart form with field "audio"
        upload_headers = {k: v for k, v in self.headers.items() if k != "Content-Type"}
        files = {"audio": (f"tts.{ext}", audio_bytes, mime)}
        resp = await client.post(
            f"{DID_API_URL}/audios",
            headers=upload_headers,
            files=files,
        )
        if resp.status_code not in (200, 201):
            log.error("audio_upload_failed", status=resp.status_code, body=resp.text[:200])
            resp.raise_for_status()

        data = resp.json()
        audio_id = data.get("id", "")
        raw_url = data.get("url") or data.get("audio_url") or ""
        log.info("audio_uploaded", id=audio_id, raw_url=raw_url)

        # raw_url is s3://d-id-audios-prod/... — not publicly accessible.
        # Call GET /audios/{id} to retrieve a signed/CDN HTTPS URL from D-ID.
        if audio_id:
            try:
                get_resp = await client.get(
                    f"{DID_API_URL}/audios/{audio_id}",
                    headers=self.headers,
                )
                if get_resp.status_code == 200:
                    get_data = get_resp.json()
                    https_url = (
                        get_data.get("url")
                        or get_data.get("audio_url")
                        or get_data.get("cdn_url")
                        or ""
                    )
                    # Accept only HTTPS URLs — skip s3:// URIs
                    if https_url.startswith("https://"):
                        log.info("audio_cdn_url", url=https_url)
                        return https_url
                    log.warning("audio_get_no_https", body=str(get_data)[:200])
                else:
                    log.warning("audio_get_failed", status=get_resp.status_code)
            except Exception as e:
                log.warning("audio_get_error", error=str(e))

        # Fallback: convert s3:// URI to HTTPS path (may fail if bucket is not public)
        if raw_url.startswith("s3://"):
            bucket_and_key = raw_url[5:]  # strip "s3://"
            parts = bucket_and_key.split("/", 1)
            if len(parts) == 2:
                bucket, key = parts
                import urllib.parse
                https_url = f"https://{bucket}.s3.amazonaws.com/{urllib.parse.quote(key)}"
                log.warning("audio_s3_fallback", url=https_url)
                return https_url

        return raw_url

    async def _generate_clips(self, audio_bytes: bytes) -> AvatarResult:
        """Use /clips endpoint with presenter_id — best quality pre-built avatars."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            audio_url = await self._upload_audio(client, audio_bytes)

            payload = {
                "presenter_id": self.presenter_id,
                "script": {
                    "type": "audio",
                    "audio_url": audio_url,
                },
                "config": {
                    "result_format": "mp4",
                },
            }
            resp = await client.post(f"{DID_API_URL}/clips", headers=self.headers, json=payload)
            if resp.status_code != 201:
                log.error("clips_create_failed", status=resp.status_code, body=resp.text[:300])
                resp.raise_for_status()

            clip_id = resp.json()["id"]
            log.info("clip_created", clip_id=clip_id)

            # Poll until done (max 90s)
            for _ in range(45):
                await asyncio.sleep(2)
                r = await client.get(f"{DID_API_URL}/clips/{clip_id}", headers=self.headers)
                data = r.json()
                status = data.get("status")

                if status == "done":
                    video_url = data.get("result_url")
                    log.info("clip_done", clip_id=clip_id, url=video_url)
                    return AvatarResult(video_url=video_url, job_id=clip_id)

                if status in ("error", "failed"):
                    raise RuntimeError(f"D-ID clip failed: {data.get('error', data)}")

                log.debug("clip_polling", status=status)

        raise TimeoutError(f"D-ID clip {clip_id} did not complete in 90s")

    async def _generate_talks(self, audio_bytes: bytes, image_url: str) -> AvatarResult:
        """Use /talks endpoint with a custom source image."""
        audio_b64 = base64.b64encode(audio_bytes).decode()

        async with httpx.AsyncClient(timeout=30.0) as client:
            payload = {
                "source_url": image_url,
                "script": {
                    "type": "audio",
                    "audio_url": f"data:audio/mpeg;base64,{audio_b64}",
                },
                "config": {"fluent": True, "pad_audio": 0.0, "stitch": True},
            }
            resp = await client.post(f"{DID_API_URL}/talks", headers=self.headers, json=payload)
            resp.raise_for_status()
            talk_id = resp.json()["id"]

            for _ in range(30):
                await asyncio.sleep(2)
                r = await client.get(f"{DID_API_URL}/talks/{talk_id}", headers=self.headers)
                data = r.json()
                status = data.get("status")

                if status == "done":
                    video_url = data.get("result_url") or data.get("video_url")
                    log.info("talk_done", talk_id=talk_id, url=video_url)
                    return AvatarResult(video_url=video_url, job_id=talk_id)

                if status in ("error", "failed"):
                    raise RuntimeError(f"D-ID talk failed: {data.get('error')}")

        raise TimeoutError(f"D-ID talk {talk_id} did not complete in 60s")

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{DID_API_URL}/credits", headers=self.headers)
                return resp.status_code == 200
        except Exception:
            return False
