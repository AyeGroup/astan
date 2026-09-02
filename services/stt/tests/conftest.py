"""Builds real WebM/Opus and MP4/AAC clips so the decode path is tested
against what browsers actually upload, not against a synthetic WAV."""

import io
import math
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _pcm(seconds: float, freq: float = 220.0, amplitude: float = 0.35, rate: int = 48000):
    import numpy as np
    n = int(seconds * rate)
    t = np.arange(n, dtype=np.float32) / rate
    wave = np.sin(2 * math.pi * freq * t) * amplitude
    # a little amplitude movement so VAD-like gates see something speech-ish
    wave *= 0.6 + 0.4 * np.sin(2 * math.pi * 4.0 * t)
    return (wave * 32767).astype("<i2"), rate


def encode(seconds: float, container: str = "webm", codec: str = "libopus",
           amplitude: float = 0.35) -> bytes:
    import av
    import numpy as np

    pcm, rate = _pcm(seconds, amplitude=amplitude, rate=48000)
    buf = io.BytesIO()
    out = av.open(buf, mode="w", format=container)
    stream = out.add_stream(codec, rate=48000)
    stream.layout = "mono"

    frame_size = 960                       # 20 ms at 48 kHz, what Opus wants
    pts = 0
    for start in range(0, len(pcm) - frame_size, frame_size):
        chunk = pcm[start:start + frame_size].reshape(1, -1)
        frame = av.AudioFrame.from_ndarray(chunk, format="s16", layout="mono")
        frame.rate = rate
        frame.pts = pts
        pts += frame_size
        for packet in stream.encode(frame):
            out.mux(packet)
    for packet in stream.encode(None):
        out.mux(packet)
    out.close()
    return buf.getvalue()


@pytest.fixture(scope="session")
def webm_speechlike():
    return encode(1.6)


@pytest.fixture(scope="session")
def webm_silence():
    return encode(1.6, amplitude=0.0)


@pytest.fixture(scope="session")
def webm_short():
    return encode(0.15)
