"""Proves the normaliser improves what espeak-ng actually produces.

Testing the normaliser's output string only proves it rewrote the text.
These tests run the real phonemiser on both the raw and the normalised
input and assert the specific garbage is gone, which is the property we
actually care about.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.normalize import normalize   # noqa: E402

espeak = pytest.importorskip("piper.phonemize_espeak")


@pytest.fixture(scope="module")
def phonemize():
    p = espeak.EspeakPhonemizer()

    def run(text):
        return " ".join("".join(s) for s in p.phonemize("fa", text))
    return run


def test_bold_markers_are_spoken_without_normalisation(phonemize):
    raw = phonemize("**کاسهٔ صفوی** یک اثر است")
    assert "setˈɑreː" in raw or "setɑrˌeː" in raw, "expected espeak to speak the asterisks"


def test_normalisation_removes_the_spoken_asterisks(phonemize):
    clean = phonemize(normalize("**کاسهٔ صفوی** یک اثر است"))
    assert "setˈɑreː" not in clean and "setɑrˌeː" not in clean


def test_heading_hash_is_not_spoken_after_normalisation(phonemize):
    assert "hˈaʃ" in phonemize("## دورهٔ صفوی")
    assert "hˈaʃ" not in phonemize(normalize("## دورهٔ صفوی"))


def test_citation_number_no_longer_appears(phonemize):
    raw = phonemize("این اثر صفوی است [۱] و لعاب دارد")
    assert "jˈek" in raw, "expected the citation to be read as the number one"
    assert "jˈek" not in phonemize(normalize("این اثر صفوی است [۱] و لعاب دارد"))


def test_time_no_longer_says_colon(phonemize):
    assert "noq1teː" in phonemize("ساعت 9:30 باز است").replace("ˈ", "").replace("ˌ", "")
    cleaned = phonemize(normalize("ساعت 9:30 باز است")).replace("ˈ", "").replace("ˌ", "")
    assert "noq1teː" not in cleaned


def test_date_no_longer_says_slash(phonemize):
    assert "slˈaʃ" in phonemize("تاریخ ۱۴۰۳/۵/۲")
    assert "slˈaʃ" not in phonemize(normalize("تاریخ ۱۴۰۳/۵/۲"))


def test_url_no_longer_read_aloud(phonemize):
    raw = phonemize("به سایت museum.example.com مراجعه کنید")
    assert "noq1teː" in raw.replace("ˈ", "").replace("ˌ", "")
    clean = phonemize(normalize("به سایت museum.example.com مراجعه کنید"))
    assert "noq1teː" not in clean.replace("ˈ", "").replace("ˌ", "")


def test_ezafe_survives_normalisation(phonemize):
    """The regression that the harakat rule originally introduced."""
    assert phonemize(normalize("موزهٔ ملی")) == phonemize("موزهٔ ملی")
    assert "je" in phonemize(normalize("موزهٔ ملی")), "ezafe linking must be preserved"


def test_normalisation_does_not_change_clean_persian(phonemize):
    text = "این اثر ۴۰۰ سال قدمت دارد و جنس بدنه سفال لعاب‌دار است."
    assert phonemize(normalize(text)) == phonemize(text)
