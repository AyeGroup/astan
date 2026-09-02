"""Service configuration, all overridable by environment variable."""

from __future__ import annotations

import os
from pathlib import Path


class Settings:
    # "piper" (natural, needs a voice model) or "espeak" (robotic, no
    # download). "auto" prefers piper and falls back to espeak.
    backend: str = os.getenv("TTS_BACKEND", "auto")
    language: str = os.getenv("TTS_LANGUAGE", "fa")

    voices_dir: Path = Path(os.getenv("TTS_VOICES_DIR", "./voices"))
    default_voice: str = os.getenv("TTS_DEFAULT_VOICE", "fa_IR-amir-medium")

    cache_dir: Path = Path(os.getenv("TTS_CACHE_DIR", "./cache"))
    cache_enabled: bool = os.getenv("TTS_CACHE", "1") != "0"
    cache_max_mb: int = int(os.getenv("TTS_CACHE_MAX_MB", "2048"))

    max_chars: int = int(os.getenv("TTS_MAX_CHARS", "2000"))
    # CORS origins for the museum front-end; "*" is fine for a public guide
    cors_origins: list = os.getenv("TTS_CORS", "*").split(",")

    # Piper prosody. length_scale is inverse speed: larger is slower.
    noise_scale: float = float(os.getenv("TTS_NOISE_SCALE", "0.667"))
    noise_w_scale: float = float(os.getenv("TTS_NOISE_W", "0.8"))
    base_length_scale: float = float(os.getenv("TTS_LENGTH_SCALE", "1.0"))


settings = Settings()

# Aliases the browser client sends. tts.js falls back to the BCP-47 tag
# when no explicit voice is configured, so those must resolve.
VOICE_ALIASES = {
    "": None,
    "fa": None,
    "fa-IR": None,
    "fa_IR": None,
    "default": None,
}
