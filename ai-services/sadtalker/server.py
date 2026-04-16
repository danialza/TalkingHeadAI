"""
SadTalker HTTP API wrapper.
Generates a talking-head video from an audio file + face image.

Endpoints:
  GET  /health              — readiness check
  POST /generate            — submit generation job (async), returns job_id
  GET  /result/{job_id}     — poll for job status and get result
"""
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from typing import Dict, Optional

import httpx
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse

# Add SadTalker to path
sys.path.insert(0, "/sadtalker")

log = logging.getLogger("sadtalker-server")
logging.basicConfig(level=logging.INFO)

DEVICE = os.getenv("SADTALKER_DEVICE", "cpu")
STILL_MODE = os.getenv("SADTALKER_STILL", "true").lower() == "true"
ENHANCER = os.getenv("SADTALKER_ENHANCER", "gfpgan")   # gfpgan | RestoreFormer | none
RESULTS_DIR = "/app/results"
SADTALKER_DIR = "/sadtalker"

os.makedirs(RESULTS_DIR, exist_ok=True)

# In-memory job store { job_id: { status, filename, error, started_at } }
jobs: Dict[str, dict] = {}


app = FastAPI(title="SadTalker Avatar Service")


@app.get("/health")
async def health():
    return {"status": "healthy", "device": DEVICE, "still": STILL_MODE}


@app.post("/generate")
async def generate_avatar(
    audio: UploadFile = File(...),
    image_url: str = Form(default=""),
    image_file: Optional[UploadFile] = File(default=None),
):
    """
    Submit a talking-head generation job.
    Returns immediately with a job_id; poll /result/{job_id} for completion.
    """
    job_id = str(uuid.uuid4())

    # Save audio to temp file
    audio_bytes = await audio.read()
    audio_path = f"/tmp/{job_id}_audio.wav"
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    # Get source image
    if image_file:
        img_bytes = await image_file.read()
        image_path = f"/tmp/{job_id}_image.jpg"
        with open(image_path, "wb") as f:
            f.write(img_bytes)
    elif image_url:
        import asyncio
        async with httpx.AsyncClient() as client:
            resp = await client.get(image_url)
            image_path = f"/tmp/{job_id}_image.jpg"
            with open(image_path, "wb") as f:
                f.write(resp.content)
    else:
        raise HTTPException(status_code=400, detail="Provide image_url or image_file")

    # Start background generation thread
    jobs[job_id] = {"status": "running", "started_at": time.time()}
    thread = threading.Thread(
        target=_run_sadtalker,
        args=(job_id, audio_path, image_path),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "running"}


@app.get("/result/{job_id}")
async def get_result(job_id: str):
    """Poll for job completion."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _run_sadtalker(job_id: str, audio_path: str, image_path: str):
    """Run SadTalker inference in a background thread."""
    try:
        out_dir = f"/tmp/{job_id}_output"
        os.makedirs(out_dir, exist_ok=True)

        cmd = [
            "python", f"{SADTALKER_DIR}/inference.py",
            "--driven_audio", audio_path,
            "--source_image", image_path,
            "--result_dir", out_dir,
            "--device", DEVICE,
            "--size", "256",          # 256 is faster than 512, good enough for video calls
        ]

        if STILL_MODE:
            cmd.append("--still")     # Minimal head motion — looks more professional

        if ENHANCER and ENHANCER.lower() != "none":
            cmd.extend(["--enhancer", ENHANCER])   # GFPGAN face enhancement

        log.info(f"[{job_id}] Running SadTalker: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            log.error(f"[{job_id}] SadTalker failed: {result.stderr}")
            jobs[job_id] = {
                "status": "error",
                "error": result.stderr[-500:],  # Last 500 chars of stderr
            }
            return

        # Find generated video
        mp4_files = [f for f in os.listdir(out_dir) if f.endswith(".mp4")]
        if not mp4_files:
            jobs[job_id] = {"status": "error", "error": "No output video generated"}
            return

        # Move to results directory (shared volume)
        src = os.path.join(out_dir, mp4_files[0])
        filename = f"{job_id}.mp4"
        dst = os.path.join(RESULTS_DIR, filename)
        os.rename(src, dst)

        elapsed = round(time.time() - jobs[job_id]["started_at"], 1)
        log.info(f"[{job_id}] Done in {elapsed}s → {filename}")
        jobs[job_id] = {"status": "done", "filename": filename, "elapsed_s": elapsed}

    except subprocess.TimeoutExpired:
        jobs[job_id] = {"status": "error", "error": "Timeout after 600s"}
        log.error(f"[{job_id}] Timeout")
    except Exception as e:
        jobs[job_id] = {"status": "error", "error": str(e)}
        log.error(f"[{job_id}] Exception: {e}")
    finally:
        # Cleanup temp files
        for path in [audio_path, image_path]:
            if os.path.exists(path):
                os.unlink(path)
