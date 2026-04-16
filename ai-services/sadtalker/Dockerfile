# SadTalker requires Python 3.9 for best dependency compatibility
FROM python:3.9-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    wget \
    curl \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone SadTalker (pinned commit for reproducibility)
RUN git clone --depth=1 https://github.com/OpenTalker/SadTalker.git /sadtalker

# CPU-only PyTorch (avoids 2GB CUDA download, works on ARM and x86)
RUN pip install --no-cache-dir \
    torch==2.0.1+cpu \
    torchvision==0.15.2+cpu \
    torchaudio==2.0.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# SadTalker dependencies
RUN pip install --no-cache-dir -r /sadtalker/requirements.txt

# Our HTTP wrapper and helper scripts
COPY server.py .
COPY download_models.sh .

RUN chmod +x download_models.sh

# Create directories for models and outputs
RUN mkdir -p /app/checkpoints /app/gfpgan/weights /app/results

EXPOSE 8003

# Download models on first start, then launch server
CMD ["bash", "-c", "bash /app/download_models.sh && uvicorn server:app --host 0.0.0.0 --port 8003 --log-level info"]
