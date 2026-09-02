# CPU-only by default. faster-whisper with int8 on a few cores runs
# faster than real time on the medium model, which is enough for
# utterance-at-a-time transcription.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STT_MODEL_DIR=/models \
    OMP_NUM_THREADS=4

WORKDIR /srv

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# The model is mounted, not baked in: it is hundreds of megabytes and a
# museum may want to switch size to trade accuracy against latency.
VOLUME ["/models"]

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fsS http://127.0.0.1:8081/health || exit 1

# One worker per model copy: each worker loads its own, and memory adds up.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081", "--workers", "1"]
