"""The espeak backend is what a museum runs before it can fetch a Piper
voice, so it has to be real speech with real timing, not a placeholder."""

import io
import os
import sys
import wave
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.espeak import ESPEAK                              # noqa: E402
from app.settings import settings                          # noqa: E402
from app.synth import EspeakBackend                        # noqa: E402
from app.visemes import espeak_mnemonic_to_ipa             # noqa: E402

pytestmark = pytest.mark.skipif(not ESPEAK.available(), reason="espeak-ng not installed")


@pytest.fixture(scope="module")
def backend():
    return EspeakBackend(settings)


def rms(pcm: bytes) -> float:
    import array
    samples = array.array("h")
    samples.frombytes(pcm)
    if not samples:
        return 0.0
    return (sum(float(s) * s for s in samples) / len(samples)) ** 0.5 / 32768.0


class TestAudio:
    def test_produces_audible_speech_not_silence(self, backend):
        out = backend.synthesize("سلام، به موزه خوش آمدید.", None, 1.0)
        with wave.open(io.BytesIO(out.audio)) as wf:
            pcm = wf.readframes(wf.getnframes())
        assert out.duration > 0.8
        assert rms(pcm) > 0.02, "the backend must actually speak, not emit silence"

    def test_longer_text_takes_longer(self, backend):
        short = backend.synthesize("سلام", None, 1.0)
        long = backend.synthesize("سلام، به موزهٔ آستان قدس رضوی خوش آمدید.", None, 1.0)
        assert long.duration > short.duration * 2

    def test_rate_changes_duration(self, backend):
        slow = backend.synthesize("این کاسه صفوی است", None, 0.7)
        fast = backend.synthesize("این کاسه صفوی است", None, 1.6)
        assert slow.duration > fast.duration


class TestTimeline:
    def test_timeline_is_measured_against_the_audio(self, backend):
        out = backend.synthesize("سلام، به موزه خوش آمدید.", None, 1.0)
        assert out.timeline
        times = [e["t"] for e in out.timeline]
        assert times == sorted(times)
        # every phoneme position must fall inside the audio it belongs to
        assert times[-1] <= out.duration + 0.05

    def test_bilabials_close_the_mouth(self, backend):
        out = backend.synthesize("مامان بابا", None, 1.0)
        assert min(e["o"] for e in out.timeline) < 0.1

    def test_open_vowels_open_the_mouth(self, backend):
        out = backend.synthesize("آآآ", None, 1.0)
        assert max(e["o"] for e in out.timeline) > 0.7

    def test_timeline_ends_closed(self, backend):
        out = backend.synthesize("سلام", None, 1.0)
        assert out.timeline[-1]["o"] == 0.0


class TestMnemonicMapping:
    def test_known_phonemes_map_to_ipa(self):
        assert espeak_mnemonic_to_ipa("m") == "m"
        assert espeak_mnemonic_to_ipa("A") == "ɑ"
        assert espeak_mnemonic_to_ipa("tS") == "tʃ"

    def test_stress_marks_are_stripped(self):
        assert espeak_mnemonic_to_ipa("'A") == "ɑ"
        assert espeak_mnemonic_to_ipa(",e") == "e"

    def test_silence_is_distinguishable_from_unknown(self):
        assert espeak_mnemonic_to_ipa("_") == ""
        assert espeak_mnemonic_to_ipa("_:") == ""
        assert espeak_mnemonic_to_ipa("!!nonsense") is None
