"""Cleaning and hallucination filtering for Whisper output.

Whisper's single worst failure mode in a museum is not mis-hearing a
word: it is inventing a sentence out of silence or crowd noise. The
model was trained on subtitle data, so when there is nothing to
transcribe it emits subtitle boilerplate — channel plugs, translator
credits, "thanks for watching". A visitor who taps the microphone by
accident then gets the avatar earnestly answering a question nobody
asked, which is worse than getting nothing.

Two independent lines of defence:

  numeric   Whisper's own no_speech_prob and avg_logprob, plus a
            characters-per-second sanity check, since a hallucination is
            usually a long fluent sentence over a very short clip.

  lexical   a blocklist of the boilerplate the model actually emits, and
            a repetition detector for the other classic failure, where
            the decoder falls into a loop and repeats one phrase.

Both are needed. The numeric checks miss a confident hallucination over
crowd noise; the lexical ones miss novel inventions.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

_CHAR_FOLD = {
    "ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه",
    "‏": "", "‎": "", "﻿": "", "ـ": "",
}

# Boilerplate Whisper emits on silence. Matched on the normalised text,
# case-insensitively, as a whole-utterance or leading-phrase match.
_BOILERPLATE = [
    "زیرنویس",
    "ترجمه و زیرنویس",
    "کانال را دنبال کنید",
    "کانال ما را دنبال کنید",
    "سابسکرایب",
    "لطفا لایک و سابسکرایب",
    "ادامه دارد",
    "پایان",
    "subtitles by",
    "subtitle by",
    "amara.org",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "like and subscribe",
    "www.",
    "http",
]

# A hallucination over a short clip is usually long and fluent. Persian
# speech runs at roughly 12 to 18 characters per second; well above that
# means text appeared without audio to justify it.
_MAX_CHARS_PER_SECOND = 28.0
_MIN_DURATION_FOR_TEXT = 0.35


@dataclass
class Verdict:
    text: str
    rejected: bool
    reason: Optional[str] = None


def clean(text: str) -> str:
    """Normalise a transcript for use as a retrieval query."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = "".join(_CHAR_FOLD.get(ch, ch) for ch in text)
    text = re.sub(r"[«»\"'`]", " ", text)
    text = re.sub(r"\s+", " ", text)
    # Whisper likes to end an uncertain clip with a lone period or ellipsis
    text = re.sub(r"^[\s.،,]+|[\s.،]+$", "", text)
    return text.strip()


def _collapse_repeats(text: str) -> tuple[str, bool]:
    """Trim a decoder loop down to a single instance of the repeated span."""
    words = text.split()
    if len(words) < 6:
        return text, False

    for size in range(1, 6):
        if len(words) < size * 3:
            continue
        head = words[:size]
        repeats = 1
        while words[repeats * size: (repeats + 1) * size] == head:
            repeats += 1
        if repeats >= 3:
            remainder = words[repeats * size:]
            return " ".join(head + remainder), True

    # the same word over and over, anywhere in the utterance
    if len(set(words)) <= max(2, len(words) // 6):
        return " ".join(dict.fromkeys(words)), True

    return text, False


def judge(
    text: str,
    *,
    duration: float,
    no_speech_prob: float = 0.0,
    avg_logprob: float = 0.0,
    no_speech_threshold: float = 0.6,
    logprob_threshold: float = -1.0,
) -> Verdict:
    """Decide whether a transcript is real speech worth acting on."""
    cleaned = clean(text)

    if not cleaned:
        return Verdict("", True, "empty")

    if duration < _MIN_DURATION_FOR_TEXT:
        return Verdict("", True, "clip too short to contain speech")

    if no_speech_prob >= no_speech_threshold:
        return Verdict("", True, f"no_speech_prob {no_speech_prob:.2f}")

    if avg_logprob < logprob_threshold:
        return Verdict("", True, f"avg_logprob {avg_logprob:.2f}")

    cps = len(cleaned) / max(duration, 0.01)
    if cps > _MAX_CHARS_PER_SECOND:
        return Verdict("", True, f"{cps:.0f} chars/second is faster than speech")

    lowered = cleaned.lower()
    for phrase in _BOILERPLATE:
        if lowered == phrase or lowered.startswith(phrase) or (
            phrase in lowered and len(lowered) < len(phrase) + 25
        ):
            return Verdict("", True, f"boilerplate: {phrase}")

    collapsed, looped = _collapse_repeats(cleaned)
    if looped:
        # a loop means the decoder lost the audio; the surviving span is
        # rarely a real question, so drop it rather than half-trust it
        return Verdict("", True, "decoder repetition loop")

    return Verdict(collapsed, False)
