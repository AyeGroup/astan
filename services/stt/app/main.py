"""Persian speech-to-text for the museum avatar guide.

Contract, matching what app/js/stt.js already sends:

  POST /transcribe   multipart with `audio` (and optional `lang`)
                     -> {"text": "..."}
  GET  /health       readiness, backend, model, concurrency headroom

An utterance that the filters reject comes back as an empty string with
200, not as an error. The client treats empty as "nothing was said" and
stays quiet, which is exactly the desired behaviour when a visitor
brushes the microphone button in a noisy hall.
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .audio import UndecodableAudio, decode
from .postprocess import judge
from .settings import settings
from .transcribe import BackendUnavailable, make_backend

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("stt")

app = FastAPI(title="Museum Avatar STT", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

backend = make_backend(settings)
_slots = asyncio.Semaphore(settings.max_concurrent)


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), lang: str = Form(default="fa-IR")):
    raw = await audio.read()

    limit = settings.max_upload_mb * 1024 * 1024
    if len(raw) > limit:
        raise HTTPException(413, f"upload larger than {settings.max_upload_mb} MB")

    try:
        decoded = decode(raw)
    except UndecodableAudio as exc:
        raise HTTPException(400, str(exc)) from exc

    if decoded.duration > settings.max_seconds:
        raise HTTPException(413, f"clip longer than {settings.max_seconds} seconds")

    # Reject rather than queue: a visitor waiting 20 seconds behind other
    # people's transcriptions has already given up and walked away.
    if _slots.locked() and _slots._value <= 0:
        raise HTTPException(429, "transcription capacity reached, retry shortly")

    started = time.perf_counter()
    async with _slots:
        try:
            result = await asyncio.to_thread(backend.transcribe, decoded)
        except BackendUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except Exception as exc:                    # noqa: BLE001
            log.exception("transcription failed")
            raise HTTPException(500, f"transcription failed: {exc}") from exc

    verdict = judge(
        result.text,
        duration=result.duration,
        no_speech_prob=result.no_speech_prob,
        avg_logprob=result.avg_logprob,
        no_speech_threshold=settings.no_speech_threshold,
        logprob_threshold=settings.logprob_threshold,
    )

    elapsed = time.perf_counter() - started
    if verdict.rejected:
        log.info("rejected (%s) after %.2fs, raw=%r", verdict.reason, elapsed, result.text[:80])

    return {
        "text": verdict.text,
        "language": result.language,
        "duration": round(result.duration, 3),
        "rejected": verdict.rejected,
        "reason": verdict.reason,
        "backend": result.backend,
        # real time factor: below 1.0 means faster than the audio it heard
        "rtf": round(elapsed / max(result.duration, 0.01), 3),
        "elapsed_ms": round(elapsed * 1000, 1),
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "backend": backend.name,
        "production_ready": backend.name == "whisper",
        "model": settings.model if backend.name == "whisper" else None,
        "device": settings.device,
        "language": settings.language,
        "free_slots": _slots._value,
        "max_concurrent": settings.max_concurrent,
    }
