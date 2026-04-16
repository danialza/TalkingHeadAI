#!/bin/bash
# Download SadTalker model checkpoints if not already present.
# Models are stored in the sadtalker_models volume, so this only runs once.

set -e

CHECKPOINTS_DIR="/app/checkpoints"
GFPGAN_DIR="/app/gfpgan/weights"

# Check if models already exist
if [ -f "$CHECKPOINTS_DIR/SadTalker_V0.0.2_256.safetensors" ]; then
    echo "[download_models] Checkpoints already present, skipping download."
    exit 0
fi

echo "[download_models] Downloading SadTalker checkpoints..."

# Download from GitHub releases
BASE_URL="https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc"

wget -q --show-progress -O "$CHECKPOINTS_DIR/SadTalker_V0.0.2_256.safetensors" \
    "$BASE_URL/SadTalker_V0.0.2_256.safetensors"

wget -q --show-progress -O "$CHECKPOINTS_DIR/SadTalker_V0.0.2_512.safetensors" \
    "$BASE_URL/SadTalker_V0.0.2_512.safetensors"

echo "[download_models] Downloading GFPGAN face enhancement weights..."

wget -q --show-progress -O "$GFPGAN_DIR/GFPGANv1.4.pth" \
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth"

wget -q --show-progress -O "$GFPGAN_DIR/detection_Resnet50_Final.pth" \
    "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth"

wget -q --show-progress -O "$GFPGAN_DIR/parsing_parsenet.pth" \
    "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth"

echo "[download_models] All models downloaded ✓"
