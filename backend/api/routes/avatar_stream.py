"""
D-ID Streaming API proxy — real-time WebRTC talking-head avatar.

Flow:
  1. POST /api/avatar/stream/start  → creates D-ID stream, returns offer + ICE
  2. POST /api/avatar/stream/{id}/sdp  → forwards browser SDP answer to D-ID
  3. POST /api/avatar/stream/{id}/ice  → forwards ICE candidates to D-ID
  4. POST /api/avatar/stream/{id}/talk → uploads audio + triggers avatar speech
  5. DELETE /api/avatar/stream/{id}    → closes stream
"""
import base64

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import app_state as _app_state

log = structlog.get_logger()
router = APIRouter(prefix="/api/avatar", tags=["avatar-stream"])

DID_API = "https://api.d-id.com"

# D-ID's built-in presenter image (no auth needed, works on all plans)
DEFAULT_PRESENTER_IMAGE = (
    "https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/v1_image.jpeg"
)


def _headers():
    settings = _app_state.state["settings"]
    creds = base64.b64encode(settings.DID_API_KEY.encode()).decode()
    return {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


class SDPPayload(BaseModel):
    answer: dict
    session_id: str


class ICEPayload(BaseModel):
    candidate: str
    sdpMid: str
    sdpMLineIndex: int
    session_id: str


class TalkPayload(BaseModel):
    audio_url: str = ""        # direct HTTPS URL (optional)
    audio_id: str = ""         # backend-buffered audio ID (preferred)
    session_id: str


class TalkTextPayload(BaseModel):
    text: str
    session_id: str
    voice_id: str = "en-US-JennyNeural"
    provider: str = "microsoft"


@router.post("/stream/start")
async def create_stream():
    settings = _app_state.state["settings"]
    image_url = getattr(settings, "DID_STREAM_IMAGE_URL", "") or DEFAULT_PRESENTER_IMAGE

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{DID_API}/talks/streams",
            headers=_headers(),
            json={"source_url": image_url},
        )
        if resp.status_code not in (200, 201):
            log.error("stream_create_failed", status=resp.status_code, body=resp.text[:300])
            raise HTTPException(status_code=resp.status_code, detail=resp.json())
        data = resp.json()

    log.info("stream_created", stream_id=data["id"], session_id=data.get("session_id", ""))
    return {
        "stream_id": data["id"],
        "session_id": data.get("session_id", ""),
        "offer": data["offer"],
        "ice_servers": data.get("ice_servers", []),
    }


@router.post("/stream/{stream_id}/sdp")
async def send_sdp(stream_id: str, payload: SDPPayload):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{DID_API}/talks/streams/{stream_id}/sdp",
            headers=_headers(),
            json={"answer": payload.answer, "session_id": payload.session_id},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"ok": True}


@router.post("/stream/{stream_id}/ice")
async def send_ice(stream_id: str, payload: ICEPayload):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{DID_API}/talks/streams/{stream_id}/ice",
            headers=_headers(),
            json={
                "candidate": payload.candidate,
                "sdpMid": payload.sdpMid,
                "sdpMLineIndex": payload.sdpMLineIndex,
                "session_id": payload.session_id,
            },
        )
        if resp.status_code >= 400:
            log.warning("ice_failed", status=resp.status_code)
    return {"ok": True}


@router.post("/stream/{stream_id}/talk")
async def send_talk(stream_id: str, payload: TalkPayload):
    """Resolve audio URL then make the avatar speak."""
    audio_url = payload.audio_url

    # If audio_id provided, upload the buffered bytes to D-ID to get an HTTPS URL
    if payload.audio_id and not audio_url:
        audio_bytes = _app_state.pending_audio.pop(payload.audio_id, None)
        if audio_bytes:
            try:
                settings = _app_state.state["settings"]
                from services.avatar.did_avatar import DIDService
                avatar = _app_state.state.get("avatar")
                if isinstance(avatar, DIDService):
                    async with httpx.AsyncClient(timeout=30.0) as upload_client:
                        audio_url = await avatar._upload_audio(upload_client, audio_bytes)
                        log.info("audio_uploaded_for_talk", audio_url=audio_url[:80])
            except Exception as e:
                log.error("audio_upload_error", error=str(e))
                raise HTTPException(status_code=500, detail=f"Audio upload failed: {e}")
        else:
            log.warning("audio_id_not_found", audio_id=payload.audio_id)
            raise HTTPException(status_code=404, detail="audio_id not found or already consumed")

    if not audio_url:
        raise HTTPException(status_code=400, detail="No audio_url or audio_id provided")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{DID_API}/talks/streams/{stream_id}",
            headers=_headers(),
            json={
                "script": {"type": "audio", "audio_url": audio_url},
                "session_id": payload.session_id,
                "config": {"stitch": True},
            },
        )
        if resp.status_code >= 400:
            log.error("talk_failed", status=resp.status_code, body=resp.text[:200])
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
    log.info("talk_sent", stream_id=stream_id, audio_url=audio_url[:80] if audio_url else "")
    return {"ok": True}


@router.post("/stream/{stream_id}/talk_text")
async def send_talk_text(stream_id: str, payload: TalkTextPayload):
    """Make avatar speak from raw text — D-ID does TTS + lip-sync internally.

    Bypasses ElevenLabs/OpenAI TTS entirely. Cheaper + one less moving part.
    """
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text required")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{DID_API}/talks/streams/{stream_id}",
            headers=_headers(),
            json={
                "script": {
                    "type": "text",
                    "input": payload.text,
                    "provider": {
                        "type": payload.provider,
                        "voice_id": payload.voice_id,
                    },
                },
                "session_id": payload.session_id,
                "config": {"stitch": True},
            },
        )
        if resp.status_code >= 400:
            log.error("talk_text_failed", status=resp.status_code, body=resp.text[:300])
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
    log.info("talk_text_sent", stream_id=stream_id, text_preview=payload.text[:60])
    return {"ok": True}


async def _close_did_stream(stream_id: str, session_id: str) -> tuple[int, str]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.request(
            "DELETE",
            f"{DID_API}/talks/streams/{stream_id}",
            headers=_headers(),
            json={"session_id": session_id} if session_id else {},
        )
    log.info("stream_closed", stream_id=stream_id, status=resp.status_code, body=resp.text[:200])
    return resp.status_code, resp.text[:200]


@router.delete("/stream/{stream_id}")
async def close_stream(stream_id: str, session_id: str = ""):
    """D-ID requires session_id in the JSON body of DELETE, not in the URL."""
    status, _body = await _close_did_stream(stream_id, session_id)
    return {"ok": status < 400, "status": status}


@router.post("/stream/{stream_id}/close")
async def close_stream_beacon(stream_id: str, session_id: str = ""):
    """POST alias for sendBeacon on page unload (DELETE isn't allowed by sendBeacon)."""
    status, _body = await _close_did_stream(stream_id, session_id)
    return {"ok": status < 400, "status": status}
