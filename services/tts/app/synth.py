"""Synthesis backends.

PiperBackend is the real one: Piper with an fa_IR voice, running on CPU,
self-hosted, with no external dependency at request time.

DevBackend exists because a voice model is a few tens of megabytes that
CI and a fresh checkout should not need. It runs the *real* espeak-ng
Persian phonemiser, so the phoneme sequence and the viseme timeline it
produces are genuine; only the waveform is synthetic. That makes the
whole pipeline, including the client's lip-sync, testable end to end
without a model. Its audio is a formant-less buzz and is not intelligible
speech, so it must never be used in production.
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

from .visemes import build_timeline, phoneme_to_mouth

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
# Development backend
# --------------------------------------------------------------------------

# Rough Persian segment durations. Only the relative ratios matter here.
_DUR = {"vowel": 0.095, "consonant": 0.062, "stop": 0.045, "pause": 0.13}
_VOWELS = set("ɑaæɐeɛəoɔiɪuʊy")
_STOPS = set("ptkbdɡgqʔ")


class DevBackend:
    name = "dev"

    def __init__(self, sample_rate: int = 22050):
        self.sample_rate = sample_rate
        self._phonemizer = None

    def is_ready(self) -> bool:
        return True

    @property
    def voices(self) -> List[str]:
        return ["dev-fa"]

    def resolve(self, requested: Optional[str]) -> str:
        return "dev-fa"

    def _phonemes(self, text: str) -> List[str]:
        if self._phonemizer is None:
            from piper.phonemize_espeak import EspeakPhonemizer
            self._phonemizer = EspeakPhonemizer()
        out: List[str] = []
        for sentence in self._phonemizer.phonemize("fa", text):
            out.extend(sentence)
            out.append(" ")
        return out

    def synthesize(self, text: str, voice: Optional[str], rate: float) -> SynthResult:
        phonemes = self._phonemes(text)
        sr = self.sample_rate
        alignments: List[Alignment] = []

        for ph in phonemes:
            if ph in " \n\t":
                seconds = _DUR["pause"]
            elif ph in _VOWELS:
                seconds = _DUR["vowel"]
            elif ph in _STOPS:
                seconds = _DUR["stop"]
            elif ph in "ːˈˌ":
                seconds = 0.02
            elif ph in ".,!?؟؛:":
                seconds = _DUR["pause"] * 1.6
            else:
                seconds = _DUR["consonant"]
            alignments.append(Alignment(ph, int(seconds / max(rate, 0.1) * sr)))

        pcm = self._buzz(alignments, sr)
        timeline = build_timeline(alignments, sr)
        audio = _wrap_wav(pcm, sr, 2, 1)
        return SynthResult(audio, sr, len(pcm) / (2.0 * sr), timeline, "dev-fa", self.name)

    def _buzz(self, alignments: List[Alignment], sr: int) -> bytes:
        """A voiced buzz whose loudness tracks mouth openness.

        Shaping amplitude by the viseme keeps the energy envelope roughly
        honest, so the client's audio-driven fallback path is exercised
        too, not just the timeline path.
        """
        samples = bytearray()
        phase = 0.0
        f0 = 118.0
        for a in alignments:
            shape = phoneme_to_mouth(a.phoneme)
            amp = 0.0 if shape is None else 0.06 + 0.34 * shape[0]
            for i in range(a.num_samples):
                phase += 2 * math.pi * f0 / sr
                # two harmonics is enough to look like speech to an analyser
                v = math.sin(phase) * 0.7 + math.sin(2 * phase) * 0.3
                # short fade at both edges to avoid clicks between segments
                edge = min(i, a.num_samples - i - 1, 64) / 64.0 if a.num_samples > 4 else 0.0
                samples += struct.pack("<h", int(max(-1, min(1, v * amp * edge)) * 32767))
        return bytes(samples)


def _wrap_wav(pcm: bytes, sample_rate: int, sample_width: int, channels: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def make_backend(cfg):
    """Pick a backend. 'auto' prefers Piper and falls back to dev."""
    mode = cfg.backend
    if mode in ("piper", "auto"):
        piper = PiperBackend(cfg.voices_dir, cfg.default_voice, cfg)
        if piper.is_ready():
            log.info("tts backend: piper, voices=%s", piper.voices)
            return piper
        if mode == "piper":
            raise BackendUnavailable(f"no voice models in {cfg.voices_dir}")
        log.warning(
            "no Piper voice model found in %s; falling back to the DEV backend, "
            "which does not produce intelligible speech", cfg.voices_dir
        )
    return DevBackend()
