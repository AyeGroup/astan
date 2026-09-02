#!/usr/bin/env bash
# Downloads a faster-whisper model for offline use.
#
# Run this where huggingface.co is reachable, then copy ./models to the
# server. Keeping it out of the image build lets the service run on a
# network that cannot reach HuggingFace at all.
set -euo pipefail

MODEL="${1:-medium}"
DEST="${2:-./models}"

echo "fetching faster-whisper model: $MODEL -> $DEST"
python3 - "$MODEL" "$DEST" <<'PY'
import sys
from faster_whisper import WhisperModel

model, dest = sys.argv[1], sys.argv[2]
# Instantiating downloads into download_root and validates the files.
WhisperModel(model, device="cpu", compute_type="int8", download_root=dest)
print(f"\n{model} is ready in {dest}")
PY

cat <<'NOTE'

Model guidance for Persian:

  small     fastest, noticeably weaker on accented or noisy speech
  medium    the sensible CPU default: roughly 2-4x faster than real time
  large-v3  the most accurate, but wants a GPU to stay responsive

Start the service with:
  STT_BACKEND=whisper STT_MODEL=medium uvicorn app.main:app --port 8081
NOTE
