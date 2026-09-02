"""Audio decoding for browser-recorded utterances.

MediaRecorder in Chrome and Firefox produces WebM/Opus; Safari produces
MP4/AAC. Whisper wants 16 kHz mono float32. PyAV ships its own FFmpeg
libraries, so this works with no system ffmpeg to install and no
subprocess to supervise.

Decoding here rather than handing the blob straight to faster-whisper is
deliberate: it validates the container before a model is touched, and it
yields the duration up front, which the request limits and the
hallucination heuristics both need.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np

SAMPLE_RATE = 16000


class UndecodableAudio(ValueError):
    pass


@dataclass
class DecodedAudio:
    samples: np.ndarray      # float32, mono, 16 kHz, in [-1, 1]
    duration: float
    source_rate: int
    channels: int


def decode(data: bytes) -> DecodedAudio:
    """Decode any container PyAV understands into Whisper's input format."""
    if not data:
        raise UndecodableAudio("empty upload")

    import av

    try:
        container = av.open(io.BytesIO(data))
    except Exception as exc:                       # noqa: BLE001
        raise UndecodableAudio(f"unreadable container: {exc}") from exc

    try:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise UndecodableAudio("no audio stream in upload")

        source_rate = int(stream.rate or 0)
        channels = int(getattr(stream, "channels", 0) or 0)

        resampler = av.audio.resampler.AudioResampler(
            format="s16", layout="mono", rate=SAMPLE_RATE
        )

        chunks = []
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                chunks.append(resampled.to_ndarray().reshape(-1))
        # flush the resampler's internal buffer, otherwise the tail is lost
        for resampled in resampler.resample(None):
            chunks.append(resampled.to_ndarray().reshape(-1))
    finally:
        container.close()

    if not chunks:
        raise UndecodableAudio("no decodable audio frames")

    pcm16 = np.concatenate(chunks)
    samples = (pcm16.astype(np.float32) / 32768.0).clip(-1.0, 1.0)
    return DecodedAudio(
        samples=samples,
        duration=len(samples) / float(SAMPLE_RATE),
        source_rate=source_rate,
        channels=channels,
    )


def rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
