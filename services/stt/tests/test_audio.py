"""The decode path is the part most likely to break in production: the
browser chooses the container, and it differs by platform."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.audio import SAMPLE_RATE, UndecodableAudio, decode, rms   # noqa: E402
from conftest import encode                                        # noqa: E402


def test_decodes_chrome_webm_opus(webm_speechlike):
    out = decode(webm_speechlike)
    assert out.samples.dtype.name == "float32"
    assert 1.4 < out.duration < 1.8
    assert abs(out.samples).max() <= 1.0


def test_resamples_to_whisper_rate(webm_speechlike):
    out = decode(webm_speechlike)
    # 16 kHz mono is what Whisper expects; the browser records at 48 kHz
    assert abs(len(out.samples) / out.duration - SAMPLE_RATE) < 100
    assert out.source_rate == 48000


def test_decodes_safari_mp4_aac():
    data = encode(1.0, container="mp4", codec="aac")
    out = decode(data)
    assert 0.8 < out.duration < 1.3


def test_silence_decodes_but_is_quiet(webm_silence):
    out = decode(webm_silence)
    assert out.duration > 1.0
    assert rms(out.samples) < 0.01


def test_empty_upload_rejected():
    with pytest.raises(UndecodableAudio):
        decode(b"")


def test_garbage_upload_rejected():
    with pytest.raises(UndecodableAudio):
        decode(b"this is not audio at all" * 50)
