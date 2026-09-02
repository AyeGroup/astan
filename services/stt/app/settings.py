"""Service configuration, all overridable by environment variable."""

from __future__ import annotations

import os
from pathlib import Path


class Settings:
    # "whisper" for real transcription, "dev" for the no-model backend
    backend: str = os.getenv("STT_BACKEND", "auto")

    # large-v3 is the most accurate on Persian but needs a GPU to keep up.
    # medium with int8 is the sensible CPU default for a museum: roughly
    # 2-4x faster than real time on a few cores.
    model: str = os.getenv("STT_MODEL", "medium")
    model_dir: Path = Path(os.getenv("STT_MODEL_DIR", "./models"))
    device: str = os.getenv("STT_DEVICE", "cpu")            # cpu | cuda | auto
    compute_type: str = os.getenv("STT_COMPUTE_TYPE", "int8")
    cpu_threads: int = int(os.getenv("STT_CPU_THREADS", "0"))   # 0 = let CT2 decide

    # Forced, never auto-detected. A short noisy utterance in a hall gets
    # mis-detected often enough to matter, and this guide is not
    # multilingual per utterance: the page already knows its language.
    language: str = os.getenv("STT_LANGUAGE", "fa")

    beam_size: int = int(os.getenv("STT_BEAM_SIZE", "5"))
    no_speech_threshold: float = float(os.getenv("STT_NO_SPEECH", "0.6"))
    logprob_threshold: float = float(os.getenv("STT_LOGPROB", "-1.0"))

    max_upload_mb: int = int(os.getenv("STT_MAX_UPLOAD_MB", "10"))
    max_seconds: float = float(os.getenv("STT_MAX_SECONDS", "30"))

    # Whisper is CPU-bound; unbounded concurrency turns one busy minute
    # into a queue nobody escapes. Reject instead, the client can retry.
    max_concurrent: int = int(os.getenv("STT_MAX_CONCURRENT", "2"))

    cors_origins: list = os.getenv("STT_CORS", "*").split(",")

    # Biases decoding toward museum vocabulary. Whisper is prone to
    # rendering domain words phonetically when it has no context.
    initial_prompt: str = os.getenv(
        "STT_PROMPT",
        "پرسش بازدیدکننده در موزه دربارهٔ آثار تاریخی، دوره‌های صفوی و قاجار، "
        "سفال، لعاب، کتیبه، ساعت کار موزه و راهنمایی مسیر.",
    )


settings = Settings()
