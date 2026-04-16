"""
faster-whisper HTTP API server.
Endpoints:
  GET  /health              — readiness check
  POST /transcribe          — transcribe audio file (multipart)
  WS   /ws/transcribe       — streaming transcription (future)
"""
import io
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from faster_whisper import WhisperModel

log = logging.getLogger("whisper-server")
logging.basicConfig(level=logging.INFO)

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")        # tiny|base|small|medium|large-v3
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")            # cpu|cuda
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MODELS_DIR = "/app/models"

_model: Optional[WhisperModel] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    log.info(f"Loading Whisper model: {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})")
    _model = WhisperModel(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        download_root=MODELS_DIR,
    )
    log.info("Whisper model loaded ✓")
    yield
    _model = None


app = FastAPI(title="Whisper STT Service", lifespan=lifespan)


@app.get("/health")
async def health():
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(default="en"),
    task: str = Form(default="transcribe"),  # transcribe | translate
):
    """Transcribe uploaded audio file. Accepts wav, mp3, ogg, webm, m4a."""
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    audio_bytes = await audio.read()

    # Write to temp file (faster-whisper needs a file path)
    suffix = "." + (audio.filename.rsplit(".", 1)[-1] if audio.filename and "." in audio.filename else "wav")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = _model.transcribe(
            tmp_path,
            language=language if language != "auto" else None,
            task=task,
            beam_size=5,
            vad_filter=True,           # Skip silent sections
            vad_parameters={"min_silence_duration_ms": 500},
        )

        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())

        full_text = " ".join(text_parts).strip()

        return {
            "text": full_text,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "confidence": 1.0,  # faster-whisper doesn't expose segment-level confidence easily
            "model": MODEL_SIZE,
        }
    finally:
        import os as _os
        _os.unlink(tmp_path)
