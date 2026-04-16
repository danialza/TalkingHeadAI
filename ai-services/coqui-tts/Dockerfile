FROM python:3.11-slim

WORKDIR /app

# System deps for audio processing + espeak (for TTS phonemization)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install TTS — this pulls Coqui XTTS v2 support
# Use a specific version for reproducibility
RUN pip install --no-cache-dir \
    TTS==0.22.0 \
    fastapi==0.111.0 \
    uvicorn[standard]==0.29.0 \
    pydantic==2.7.0

COPY server.py .

EXPOSE 8002

# XTTS v2 model downloads to /root/.local/share/tts (mounted volume)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8002", "--log-level", "info"]
