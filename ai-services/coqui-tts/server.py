"""
Coqui XTTS v2 HTTP TTS server.
XTTS v2 supports voice cloning from a reference WAV file.

Endpoints:
  GET  /health     — readiness check
  POST /synthesize — synthesize speech, returns WAV bytes
"""
import io
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

log = logging.getLogger("coqui-tts-server")
logging.basicConfig(level=logging.INFO)

TTS_MODEL = os.getenv("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
DEVICE = os.getenv("TTS_DEVICE", "cpu")

_tts = None
_default_speaker_wav: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tts, _default_speaker_wav
    log.info(f"Loading TTS model: {TTS_MODEL} on {DEVICE}")

    from TTS.api import TTS
    _tts = TTS(TTS_MODEL, gpu=(DEVICE == "cuda"))

    # Check for a default speaker WAV in mounted volume
    speaker_path = "/app/speaker/reference.wav"
    if os.path.exists(speaker_path):
        _default_speaker_wav = speaker_path
        log.info(f"Default speaker voice loaded: {speaker_path}")

    log.info("Coqui TTS model loaded ✓")
    yield
    _tts = None


app = FastAPI(title="Coqui TTS Service", lifespan=lifespan)


class SynthesizeRequest(BaseModel):
    text: str
    language: str = "en"
    speaker_wav_url: Optional[str] = None  # URL or local path to reference voice WAV


@app.get("/health")
async def health():
    if _tts is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": TTS_MODEL, "device": DEVICE}


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """Synthesize text to speech. Returns WAV audio bytes."""
    if _tts is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    # Determine speaker reference
    speaker_wav = _default_speaker_wav
    if request.speaker_wav_url:
        # If it's a local path in the container
        if os.path.exists(request.speaker_wav_url):
            speaker_wav = request.speaker_wav_url
        # If it's a URL, download it
        elif request.speaker_wav_url.startswith("http"):
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(request.speaker_wav_url)
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(resp.content)
                    speaker_wav = tmp.name

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_file:
        out_path = out_file.name

    try:
        if speaker_wav and "xtts" in TTS_MODEL.lower():
            # XTTS v2 voice cloning mode
            _tts.tts_to_file(
                text=text,
                speaker_wav=speaker_wav,
                language=request.language,
                file_path=out_path,
            )
        else:
            # Standard TTS without voice cloning
            _tts.tts_to_file(
                text=text,
                file_path=out_path,
            )

        with open(out_path, "rb") as f:
            audio_bytes = f.read()

        return Response(content=audio_bytes, media_type="audio/wav")
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)
