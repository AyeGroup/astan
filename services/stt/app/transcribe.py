"""Transcription backends.

WhisperBackend is the real one: faster-whisper on CPU, self-hosted, with
Silero VAD in front of it.

DevBackend exists so CI and a fresh checkout need no model. It performs
the real decode and the real post-processing, and returns a fixed
transcript, so everything except the acoustic model is exercised.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from .audio import DecodedAudio, rms

log = logging.getLogger(__name__)


@dataclass
class Transcript:
    text: str
    language: str
    duration: float
    no_speech_prob: float = 0.0
    avg_logprob: float = 0.0
    segments: List[dict] = field(default_factory=list)
    backend: str = "dev"


class BackendUnavailable(RuntimeError):
    pass


class WhisperBackend:
    name = "whisper"

    def __init__(self, cfg):
        self.cfg = cfg
        self._model = None
        self._load_error: Optional[str] = None

    def is_ready(self) -> bool:
        return self._model is not None or self._load_error is None

    def warmup(self) -> None:
        """Load the model at startup so the first visitor does not pay for it."""
        try:
            self._ensure_model()
        except Exception as exc:                   # noqa: BLE001
            self._load_error = str(exc)
            log.warning("whisper model not loaded: %s", exc)

    def _ensure_model(self):
        if self._model is not None:
            return self._model
        from faster_whisper import WhisperModel

        # local_files_only keeps a museum server from reaching out to
        # HuggingFace at request time, which may be blocked or slow.
        self._model = WhisperModel(
            self.cfg.model,
            device=self.cfg.device,
            compute_type=self.cfg.compute_type,
            cpu_threads=self.cfg.cpu_threads,
            download_root=str(self.cfg.model_dir),
            local_files_only=Path(self.cfg.model_dir).exists(),
        )
        return self._model

    def transcribe(self, audio: DecodedAudio) -> Transcript:
        try:
            model = self._ensure_model()
        except Exception as exc:                   # noqa: BLE001
            raise BackendUnavailable(
                f"whisper model '{self.cfg.model}' unavailable: {exc}. "
                "Run scripts/fetch_model.sh where huggingface.co is reachable."
            ) from exc

        from faster_whisper.vad import VadOptions

        segments, info = model.transcribe(
            audio.samples,
            language=self.cfg.language,
            beam_size=self.cfg.beam_size,
            # Each utterance is independent, and carrying context across
            # them is the main driver of Whisper's repetition loops.
            condition_on_previous_text=False,
            no_speech_threshold=self.cfg.no_speech_threshold,
            log_prob_threshold=self.cfg.logprob_threshold,
            # A bounded ladder: some fallback helps on hard audio, but a
            # long one mostly buys more confident hallucination.
            temperature=[0.0, 0.2, 0.4],
            initial_prompt=self.cfg.initial_prompt or None,
            vad_filter=True,
            vad_parameters=VadOptions(
                # a hall is never silent, so the gate has to sit high
                threshold=0.5,
                min_speech_duration_ms=200,
                min_silence_duration_ms=400,
                speech_pad_ms=200,
            ),
        )

        collected, texts = [], []
        no_speech, logprob = 0.0, 0.0
        for seg in segments:
            texts.append(seg.text)
            collected.append({
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "no_speech_prob": round(seg.no_speech_prob, 4),
                "avg_logprob": round(seg.avg_logprob, 4),
            })
            no_speech = max(no_speech, seg.no_speech_prob)
            logprob = min(logprob, seg.avg_logprob) if collected else seg.avg_logprob

        return Transcript(
            text="".join(texts).strip(),
            language=getattr(info, "language", self.cfg.language),
            duration=audio.duration,
            no_speech_prob=no_speech,
            avg_logprob=logprob,
            segments=collected,
            backend=self.name,
        )


class DevBackend:
    name = "dev"
    CANNED = "قدمت این اثر چقدر است"

    def __init__(self, cfg):
        self.cfg = cfg

    def is_ready(self) -> bool:
        return True

    def warmup(self) -> None:
        return None

    def transcribe(self, audio: DecodedAudio) -> Transcript:
        level = rms(audio.samples)
        # Report silence as silence so the hallucination filter is
        # exercised rather than bypassed in tests.
        text = self.CANNED if level > 0.001 else ""
        return Transcript(
            text=text,
            language=self.cfg.language,
            duration=audio.duration,
            no_speech_prob=0.0 if text else 0.95,
            avg_logprob=-0.2,
            segments=[],
            backend=self.name,
        )


def make_backend(cfg):
    mode = cfg.backend
    if mode in ("whisper", "auto"):
        backend = WhisperBackend(cfg)
        backend.warmup()
        if backend._model is not None:
            log.info("stt backend: whisper model=%s device=%s", cfg.model, cfg.device)
            return backend
        if mode == "whisper":
            raise BackendUnavailable(backend._load_error or "model unavailable")
        log.warning("whisper unavailable, falling back to the DEV backend "
                    "(returns a fixed transcript, never deploy it)")
    return DevBackend(cfg)
