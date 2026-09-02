"""Synthesis backends.

PiperBackend gives natural speech, and is what a museum should run. It
needs a voice model from HuggingFace.

EspeakBackend is the fallback, and it is why the platform has no download
in its critical path. espeak-ng ships as a PyPI wheel with its own data,
genuinely speaks Persian (robotically, being a formant synthesiser), and
reports the real audio position of every phoneme, so its viseme timeline
is measured rather than estimated. A museum whose network cannot reach
HuggingFace — a real constraint, not a hypothetical one — can run the
guide end to end and swap in a Piper voice later with no other change.

'auto' prefers Piper and falls back to espeak. Neither is a stub: both
produce intelligible Persian speech and a real timeline.
"""

from __future__ import annotations

import io
import logging
import math
import struct
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from .espeak import ESPEAK, EspeakUnavailable
from .visemes import build_timeline, build_timeline_from_positions

log = logging.getLogger(__name__)


@dataclass
class Alignment:
    phoneme: str
    num_samples: int


@dataclass
class SynthResult:
    audio: bytes                 # a complete WAV file
    sample_rate: int
    duration: float
    timeline: List[dict]
    voice: str
    backend: str


class BackendUnavailable(RuntimeError):
    pass


# --------------------------------------------------------------------------
# Piper
# --------------------------------------------------------------------------

class PiperBackend:
    name = "piper"
    quality = "natural"

    def __init__(self, voices_dir: Path, default_voice: str, cfg):
        self.voices_dir = Path(voices_dir)
        self.default_voice = default_voice
        self.cfg = cfg
        self._voices = {}
        self._available = self._discover()

    def _discover(self) -> List[str]:
        if not self.voices_dir.exists():
            return []
        return sorted(p.stem for p in self.voices_dir.glob("*.onnx"))

    @property
    def voices(self) -> List[str]:
        return self._available

    def is_ready(self) -> bool:
        return bool(self._available)

    def resolve(self, requested: Optional[str]) -> str:
        if requested and requested in self._available:
            return requested
        if self.default_voice in self._available:
            return self.default_voice
        if self._available:
            return self._available[0]
        raise BackendUnavailable(
            f"no voice model found in {self.voices_dir}. "
            "Run scripts/fetch_voices.sh on a machine that can reach huggingface.co"
        )

    def _load(self, name: str):
        if name not in self._voices:
            from piper import PiperVoice
            self._voices[name] = PiperVoice.load(self.voices_dir / f"{name}.onnx")
        return self._voices[name]

    def synthesize(self, text: str, voice: Optional[str], rate: float) -> SynthResult:
        from piper import SynthesisConfig

        name = self.resolve(voice)
        piper_voice = self._load(name)

        syn = SynthesisConfig(
            # length_scale is inverse speed, so a faster rate is a smaller scale
            length_scale=self.cfg.base_length_scale / max(rate, 0.1),
            noise_scale=self.cfg.noise_scale,
            noise_w_scale=self.cfg.noise_w_scale,
            normalize_audio=True,
        )

        chunks = list(piper_voice.synthesize(text, syn_config=syn, include_alignments=True))
        if not chunks:
            raise RuntimeError("piper produced no audio")

        sample_rate = chunks[0].sample_rate
        sample_width = chunks[0].sample_width
        channels = chunks[0].sample_channels

        pcm = b"".join(c.audio_int16_bytes for c in chunks)

        alignments: List[Alignment] = []
        for chunk in chunks:
            for a in (chunk.phoneme_alignments or []):
                alignments.append(Alignment(a.phoneme, a.num_samples))

        timeline = build_timeline(alignments, sample_rate) if alignments else []
        audio = _wrap_wav(pcm, sample_rate, sample_width, channels)
        duration = len(pcm) / float(sample_rate * sample_width * channels)

        return SynthResult(audio, sample_rate, duration, timeline, name, self.name)


# --------------------------------------------------------------------------
# espeak-ng
# --------------------------------------------------------------------------

class EspeakBackend:
    name = "espeak"
    quality = "robotic"

    def __init__(self, cfg):
        self.cfg = cfg

    def is_ready(self) -> bool:
        return ESPEAK.available()

    @property
    def voices(self) -> List[str]:
        return ESPEAK.voices()

    def resolve(self, requested: Optional[str]) -> str:
        return "espeak-fa"

    def synthesize(self, text: str, voice: Optional[str], rate: float) -> SynthResult:
        language = (self.cfg.language or "fa") if hasattr(self.cfg, "language") else "fa"
        try:
            pcm, sample_rate, phonemes = ESPEAK.synthesize(text, language, rate)
        except EspeakUnavailable as exc:
            raise BackendUnavailable(str(exc)) from exc
        if not pcm:
            raise RuntimeError("espeak produced no audio")

        duration = len(pcm) / (2.0 * sample_rate)
        timeline = build_timeline_from_positions(phonemes, duration)
        return SynthResult(_wrap_wav(pcm, sample_rate, 2, 1), sample_rate,
                           duration, timeline, "espeak-fa", self.name)


def _wrap_wav(pcm: bytes, sample_rate: int, sample_width: int, channels: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def make_backend(cfg):
    """Pick a backend. 'auto' prefers Piper and falls back to espeak."""
    mode = cfg.backend
    if mode in ("piper", "auto"):
        piper = PiperBackend(cfg.voices_dir, cfg.default_voice, cfg)
        if piper.is_ready():
            log.info("tts backend: piper, voices=%s", piper.voices)
            return piper
        if mode == "piper":
            raise BackendUnavailable(f"no voice models in {cfg.voices_dir}")
        log.warning(
            "no Piper voice model in %s; using espeak-ng, which speaks Persian "
            "but sounds robotic. Run scripts/fetch_voices.sh for natural speech.",
            cfg.voices_dir,
        )

    espeak = EspeakBackend(cfg)
    if not espeak.is_ready():
        raise BackendUnavailable("neither a Piper voice nor espeak-ng is available")
    return espeak
