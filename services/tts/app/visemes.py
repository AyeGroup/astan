"""IPA phonemes to mouth shapes for Persian.

The client renders a mouth in a continuous two-dimensional space rather
than as discrete viseme sprites:

    open   how far the jaw drops
    spread how wide the lips are, from rounded (0) to spread (1)

Driving that space from real phoneme alignments instead of from audio
energy buys one thing energy analysis can never give: the lips actually
close on the bilabials م، ب، پ. Energy is still high during those
closures, so an amplitude-driven mouth stays open through them, which is
the single most obvious tell that lip-sync is fake.

The espeak-ng Persian phoneme inventory was read off the phonemiser
directly rather than assumed; unknown symbols fall back to a neutral
half-open shape, so a voice with a slightly different inventory
degrades instead of breaking.
"""

from __future__ import annotations

from typing import Iterable, List, Dict, Any

# (open, spread)
_VISEME: Dict[str, tuple] = {
    # open vowels
    "ɑ": (0.95, 0.42), "a": (0.85, 0.50), "æ": (0.85, 0.62), "ɐ": (0.80, 0.55),
    # mid vowels
    "e": (0.58, 0.72), "ɛ": (0.62, 0.70), "ə": (0.45, 0.52),
    "o": (0.55, 0.20), "ɔ": (0.60, 0.22),
    # close vowels
    "i": (0.32, 0.95), "ɪ": (0.35, 0.88), "y": (0.30, 0.30),
    "u": (0.28, 0.05), "ʊ": (0.32, 0.10),
    # glides
    "j": (0.30, 0.90), "w": (0.25, 0.05),
    # bilabials: lips closed. the whole reason for using alignments.
    "m": (0.02, 0.42), "b": (0.03, 0.42), "p": (0.02, 0.40),
    # labiodentals
    "f": (0.16, 0.52), "v": (0.18, 0.52),
    # sibilants and affricates: narrow aperture, spread lips
    "s": (0.22, 0.78), "z": (0.24, 0.76), "ʃ": (0.28, 0.42), "ʒ": (0.28, 0.42),
    "tʃ": (0.30, 0.45), "dʒ": (0.32, 0.45),
    # coronals
    "t": (0.28, 0.58), "d": (0.30, 0.58), "n": (0.24, 0.55),
    "l": (0.34, 0.60), "r": (0.32, 0.58), "ɾ": (0.30, 0.58),
    # dorsals, uvulars, glottals
    "k": (0.40, 0.48), "ɡ": (0.42, 0.48), "g": (0.42, 0.48),
    "q": (0.42, 0.40), "ɢ": (0.42, 0.40), "χ": (0.40, 0.40), "x": (0.40, 0.40),
    "ɣ": (0.40, 0.42), "h": (0.45, 0.50), "ʔ": (0.20, 0.48),
}

# Length, stress and tone markers modify a neighbour, they are not sounds.
_MODIFIERS = set("ːˈˌ'ˑ̃ʰ0123456789")
_SILENCE = set(" .,،؛;:!?؟\n\t-–—()[]«»\"")

_NEUTRAL = (0.35, 0.5)
_CLOSED = (0.0, 0.5)

# A phoneme shorter than this is a transition, not a target the mouth can
# reach; merging it into its neighbour avoids visible jitter.
_MIN_SEGMENT_S = 0.035


def phoneme_to_mouth(phoneme: str) -> tuple:
    if not phoneme:
        return _NEUTRAL
    if phoneme in _VISEME:
        return _VISEME[phoneme]
    if phoneme in _SILENCE:
        return _CLOSED
    # strip modifiers and retry, e.g. "ɑː" -> "ɑ"
    base = "".join(c for c in phoneme if c not in _MODIFIERS)
    if base in _VISEME:
        return _VISEME[base]
    if base and base[0] in _VISEME:
        return _VISEME[base[0]]
    if not base:
        return None            # pure modifier: carries no shape of its own
    return _NEUTRAL


def build_timeline(alignments: Iterable, sample_rate: int) -> List[Dict[str, Any]]:
    """Turn Piper phoneme alignments into a mouth timeline.

    Each entry is {"t": seconds from start, "o": open, "s": spread}.
    The client interpolates between entries, so the timeline stays small
    even for a long sentence.
    """
    timeline: List[Dict[str, Any]] = []
    cursor = 0.0
    pending = 0.0                    # duration absorbed from modifier symbols

    for a in alignments:
        duration = a.num_samples / float(sample_rate) if sample_rate else 0.0
        shape = phoneme_to_mouth(a.phoneme)

        if shape is None:
            # a length or stress mark: give its time to the previous sound
            pending += duration
            continue

        duration += pending
        pending = 0.0

        if timeline and duration < _MIN_SEGMENT_S:
            # too short to be seen; extend the previous target instead
            cursor += duration
            continue

        timeline.append({"t": round(cursor, 4), "o": shape[0], "s": shape[1]})
        cursor += duration

    timeline.append({"t": round(cursor, 4), "o": 0.0, "s": 0.5})   # close at the end
    return timeline
