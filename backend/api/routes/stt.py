"""Speech-to-text HTTP route — ElevenLabs scribe_v1.

Used by the frontend mic button: user records audio, POSTs the blob here, gets
transcribed text back, then loads it into the input field for review before
sending.
"""
import httpx
import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

import app_state as _app_state

log = structlog.get_logger()
router = APIRouter(prefix="/api/stt", tags=["stt"])

ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language_code: str = Form(default="eng"),
):
    """Transcribe an uploaded audio blob via ElevenLabs scribe_v1."""
    settings = _app_state.state["settings"]
    api_key = settings.ELEVENLABS_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    content_type = file.content_type or "audio/webm"
    files = {"file": (file.filename or "audio.webm", audio_bytes, content_type)}
    data = {
        "model_id": "scribe_v1",
        "language_code": language_code,
    }
    headers = {"xi-api-key": api_key}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                ELEVENLABS_STT_URL, headers=headers, data=data, files=files
            )
    except httpx.HTTPError as e:
        log.error("elevenlabs_stt_network_error", error=str(e))
        raise HTTPException(status_code=502, detail=f"ElevenLabs unreachable: {e}")

    if resp.status_code >= 400:
        log.error(
            "elevenlabs_stt_failed",
            status=resp.status_code,
            body=resp.text[:300],
        )
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:300])

    payload = resp.json()
    # scribe_v1 returns { text, language_code, words: [...] }
    text = payload.get("text", "").strip()
    log.info("stt_ok", text_preview=text[:80], size=len(audio_bytes))
    return {"text": text, "language_code": payload.get("language_code", language_code)}
