# CPU-only. Piper needs no GPU, which is what makes one modest VM enough
# to serve a museum's whole visitor load.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TTS_VOICES_DIR=/voices \
    TTS_CACHE_DIR=/cache

WORKDIR /srv

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Voice models are mounted rather than baked in: they are tens of
# megabytes each and a museum may want a different voice per persona.
VOLUME ["/voices", "/cache"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
