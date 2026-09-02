#!/usr/bin/env bash
# Downloads the Persian Piper voices.
#
# Run this where huggingface.co is reachable, then copy ./voices to the
# server. Keeping the download out of the image build means the service
# can be deployed on a network that cannot reach HuggingFace at all.
set -euo pipefail

DEST="${1:-./voices}"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR"

# name:quality pairs available for Persian
VOICES=(
  "amir/medium/fa_IR-amir-medium"
  "gyro/medium/fa_IR-gyro-medium"
  "ganji/medium/fa_IR-ganji-medium"
  "ganji_adabi/medium/fa_IR-ganji_adabi-medium"
)

mkdir -p "$DEST"
for entry in "${VOICES[@]}"; do
  name="$(basename "$entry")"
  for ext in onnx onnx.json; do
    target="$DEST/$name.$ext"
    if [[ -f "$target" ]]; then
      echo "skip $name.$ext (already present)"
      continue
    fi
    echo "fetching $name.$ext"
    curl -fL --retry 3 -o "$target" "$BASE/$entry.$ext"
  done
done

echo
echo "voices in $DEST:"
ls -1sh "$DEST"
echo
echo "Start the service with:  TTS_BACKEND=piper TTS_VOICES_DIR=$DEST uvicorn app.main:app --port 8080"
