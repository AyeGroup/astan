"""Whisper's worst museum failure is inventing a sentence out of silence.
These cases are the boilerplate it actually emits, plus the numeric
signals that catch inventions the blocklist has never seen."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.postprocess import clean, judge   # noqa: E402


def ok(text, **kw):
    kw.setdefault("duration", 3.0)
    return judge(text, **kw)


class TestClean:
    def test_folds_arabic_letters(self):
        # Whisper frequently emits Arabic yeh and kaf in Persian output
        assert clean("كتاب يادگار") == "کتاب یادگار"

    def test_collapses_whitespace(self):
        assert clean("سلام   دنیا\n\n") == "سلام دنیا"

    def test_strips_quotes_and_dangling_punctuation(self):
        assert clean("«سلام».") == "سلام"

    def test_empty_stays_empty(self):
        assert clean("") == ""


class TestRealSpeechSurvives:
    def test_ordinary_question_passes(self):
        v = ok("قدمت این اثر چقدر است؟")
        assert not v.rejected and v.text == "قدمت این اثر چقدر است؟"

    def test_short_question_passes(self):
        v = ok("ساعت کار موزه؟", duration=1.2)
        assert not v.rejected

    def test_long_answer_over_long_audio_passes(self):
        v = ok("می‌خواهم بدانم این کاسه متعلق به کدام دوره است و جنس بدنه‌اش چیست", duration=6.0)
        assert not v.rejected


class TestBoilerplateHallucinations:
    def test_persian_subtitle_credit(self):
        assert ok("زیرنویس از کانال ما").rejected

    def test_subscribe_plug(self):
        assert ok("لطفا کانال را دنبال کنید").rejected

    def test_english_thanks_for_watching(self):
        assert ok("Thanks for watching!").rejected

    def test_amara_credit(self):
        assert ok("Subtitles by the Amara.org community").rejected

    def test_url_only(self):
        assert ok("www.example.com").rejected

    def test_lone_payan(self):
        assert ok("پایان").rejected

    def test_a_real_sentence_containing_the_word_is_kept(self):
        # "زیرنویس" inside a genuine question must not trip the blocklist
        v = ok("آیا این ویترین زیرنویس انگلیسی هم دارد یا فقط فارسی است؟", duration=5.0)
        assert not v.rejected


class TestNumericSignals:
    def test_high_no_speech_probability_rejected(self):
        assert ok("یک جملهٔ کاملا معقول", no_speech_prob=0.9).rejected

    def test_low_confidence_rejected(self):
        assert ok("یک جملهٔ کاملا معقول", avg_logprob=-1.8).rejected

    def test_text_faster_than_human_speech_rejected(self):
        # 60 characters over half a second cannot have been spoken
        v = ok("این یک جملهٔ بسیار طولانی است که هرگز در نیم ثانیه گفته نمی‌شود", duration=0.5)
        assert v.rejected and "chars/second" in v.reason

    def test_clip_too_short_rejected(self):
        assert ok("سلام", duration=0.1).rejected

    def test_empty_transcript_rejected(self):
        assert ok("").rejected


class TestRepetitionLoops:
    def test_single_word_loop_rejected(self):
        assert ok("موزه موزه موزه موزه موزه موزه موزه", duration=8.0).rejected

    def test_phrase_loop_rejected(self):
        assert ok("خوش آمدید خوش آمدید خوش آمدید خوش آمدید", duration=8.0).rejected

    def test_natural_repetition_survives(self):
        v = ok("سلام سلام، حال شما چطور است و این اثر چیست", duration=5.0)
        assert not v.rejected


class TestReasonsAreActionable:
    def test_every_rejection_explains_itself(self):
        for text, kw in [
            ("", {}),
            ("سلام", {"duration": 0.1}),
            ("جمله", {"no_speech_prob": 0.99}),
            ("زیرنویس", {}),
        ]:
            v = ok(text, **kw)
            assert v.rejected and v.reason, f"no reason given for {text!r}"

    def test_rejected_text_is_always_empty(self):
        # the client treats empty as "nothing was said" and stays quiet
        assert ok("Thanks for watching!").text == ""
