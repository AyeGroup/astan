"""Persian TTS service for the museum avatar guide.

Contract, kept deliberately small:

  POST /speak      -> audio/wav, or JSON with audio + viseme timeline
  POST /prerender  -> warm the cache for a museum's frequent answers
  GET  /voices     -> what this instance can speak with
  GET  /health     -> readiness, backend in use, cache statistics

The browser client posts {text, voice, lang, rate} and, by default, gets
a WAV back, which is what the existing app/js/tts.js already expects.
Asking for JSON additionally returns the viseme timeline, which drives
lip-sync from real phonemes rather than from audio energy.
"""

from __future__ import annotations

import base64
import logging
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .cache import AudioCache
from .normalize import is_speakable, normalize
from .settings import VOICE_ALIASES, settings
from .synth import BackendUnavailable, make_backend

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tts")

app = FastAPI(title="Museum Avatar TTS", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

cache = AudioCache(settings.cache_dir, settings.cache_enabled, settings.cache_max_mb)
backend = make_backend(settings)


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: Optional[str] = None
    lang: Optional[str] = "fa-IR"
    rate: float = Field(1.0, ge=0.5, le=2.0)
    # JSON additionally carries the viseme timeline
    format: str = Field("wav", pattern="^(wav|json)$")


class PrerenderRequest(BaseModel):
    texts: List[str]
    voice: Optional[str] = None
    rate: float = Field(1.0, ge=0.5, le=2.0)


def _resolve_voice(requested: Optional[str]) -> Optional[str]:
    """Map the client's BCP-47 tag onto an actual voice model name."""
    if requested in VOICE_ALIASES:
        return VOICE_ALIASES[requested]
    return requested


def _synthesize(text: str, voice: Optional[str], rate: float):
    clean = normalize(text, max_chars=settings.max_chars)
    if not is_speakable(clean):
        raise HTTPException(status_code=422, detail="nothing speakable in the text")

    name = _resolve_voice(voice)
    try:
        resolved = backend.resolve(name)
    except BackendUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    key = AudioCache.key(clean, resolved, rate)
    hit = cache.get(key)
    if hit:
        audio, info = hit
        return audio, info, clean, True

    started = time.perf_counter()
    try:
        result = backend.synthesize(clean, name, rate)
    except BackendUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:                      # noqa: BLE001 - surfaced to the client
        log.exception("synthesis failed")
        raise HTTPException(status_code=500, detail=f"synthesis failed: {exc}") from exc

    info = {
        "sample_rate": result.sample_rate,
        "duration": round(result.duration, 3),
        "timeline": result.timeline,
        "voice": result.voice,
        "backend": result.backend,
        "synth_ms": round((time.perf_counter() - started) * 1000, 1),
    }
    cache.put(key, result.audio, info)
    return result.audio, info, clean, False


@app.post("/speak")
def speak(req: SpeakRequest):
    audio, info, clean, cached = _synthesize(req.text, req.voice, req.rate)

    if req.format == "json":
        return {
            "audio": base64.b64encode(audio).decode("ascii"),
            "mime": "audio/wav",
            "normalized": clean,
            "cached": cached,
            **info,
        }

    headers = {
        "X-Cache": "hit" if cached else "miss",
        "X-Voice": str(info.get("voice", "")),
        "X-Backend": str(info.get("backend", "")),
        "X-Duration": str(info.get("duration", "")),
        "Cache-Control": "public, max-age=86400",
    }
    return Response(content=audio, media_type="audio/wav", headers=headers)


@app.post("/prerender")
def prerender(req: PrerenderRequest):
    """Warm the cache for a museum's frequent answers.

    Run this nightly over the top questions per object. Those answers then
    play with no synthesis latency at all, which is where most of the
    perceived speed of the guide comes from.
    """
    done, failed = 0, []
    for text in req.texts:
        try:
            _synthesize(text, req.voice, req.rate)
            done += 1
        except HTTPException as exc:
            failed.append({"text": text[:60], "detail": exc.detail})
    return {"prerendered": done, "failed": failed, "cache": cache.stats()}


@app.get("/voices")
def voices():
    return {
        "backend": backend.name,
        "voices": backend.voices,
        "default": settings.default_voice,
        "aliases": sorted(k for k in VOICE_ALIASES if k),
    }


@app.get("/health")
def health():
    ready = backend.is_ready()
    return {
        "status": "ok" if ready else "degraded",
        "backend": backend.name,
        "production_ready": backend.name == "piper",
        "voices": backend.voices,
        "cache": cache.stats(),
    }
