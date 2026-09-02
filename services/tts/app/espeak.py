"""espeak-ng as a second synthesis backend.

Piper gives natural speech but needs a voice model from HuggingFace,
which a museum network inside Iran may not be able to reach at all. That
turns a download into a deployment blocker for the whole platform.

espeak-ng removes the blocker. It is a formant synthesiser, so it sounds
robotic, but it genuinely speaks Persian, it ships as a PyPI wheel with
its own data, and it needs no download of any kind. A museum can run the
guide end to end on the day it installs the service and swap in a Piper
voice later without touching anything else.

It also reports phoneme events carrying the real audio position of every
phoneme, so the viseme timeline from this backend is measured from the
synthesis rather than estimated — the same quality of alignment Piper's
alignments give.

The C API is a process-wide singleton with a synthesis callback, so every
call is serialised behind one lock.
"""

from __future__ import annotations

import ctypes
import logging
import threading
from typing import List, Tuple

log = logging.getLogger(__name__)

AUDIO_OUTPUT_RETRIEVAL = 1
INITIALIZE_PHONEME_EVENTS = 1
CHARS_UTF8 = 1

EVENT_LIST_TERMINATED = 0
EVENT_PHONEME = 7

PARAM_RATE = 1
PARAM_PITCH = 3

DEFAULT_WPM = 170


class _ID(ctypes.Union):
    _fields_ = [("number", ctypes.c_int),
                ("name", ctypes.c_char_p),
                ("string", ctypes.c_char * 8)]


class _EVENT(ctypes.Structure):
    _fields_ = [("type", ctypes.c_int),
                ("unique_identifier", ctypes.c_uint),
                ("text_position", ctypes.c_int),
                ("length", ctypes.c_int),
                ("audio_position", ctypes.c_int),
                ("sample", ctypes.c_int),
                ("user_data", ctypes.c_void_p),
                ("id", _ID)]


_CALLBACK = ctypes.CFUNCTYPE(ctypes.c_int,
                             ctypes.POINTER(ctypes.c_short),
                             ctypes.c_int,
                             ctypes.POINTER(_EVENT))


class EspeakUnavailable(RuntimeError):
    pass


class Espeak:
    """Thin, serialised wrapper over libespeak-ng."""

    def __init__(self):
        self._lock = threading.Lock()
        self._lib = None
        self.sample_rate = 0
        self._pcm = bytearray()
        self._phonemes: List[Tuple[float, str]] = []
        # the callback must outlive every call or the C side calls freed memory
        self._callback = _CALLBACK(self._on_audio)

    def _ensure(self):
        if self._lib is not None:
            return self._lib
        try:
            import espeakng_loader
        except ImportError as exc:
            raise EspeakUnavailable(
                "espeakng-loader is not installed; add it to requirements.txt"
            ) from exc

        lib = ctypes.CDLL(espeakng_loader.get_library_path())
        lib.espeak_Initialize.restype = ctypes.c_int
        rate = lib.espeak_Initialize(
            AUDIO_OUTPUT_RETRIEVAL, 0,
            str(espeakng_loader.get_data_path()).encode(),
            INITIALIZE_PHONEME_EVENTS,
        )
        if rate <= 0:
            raise EspeakUnavailable("espeak_Initialize failed")
        lib.espeak_SetSynthCallback(self._callback)
        self.sample_rate = rate
        self._lib = lib
        log.info("espeak-ng ready at %d Hz", rate)
        return lib

    def _on_audio(self, wav, num_samples, events):
        if wav and num_samples > 0:
            self._pcm.extend(ctypes.string_at(wav, num_samples * 2))
        i = 0
        while events and events[i].type != EVENT_LIST_TERMINATED:
            event = events[i]
            if event.type == EVENT_PHONEME:
                name = bytes(event.id.string).split(b"\x00")[0].decode("utf-8", "replace")
                # audio_position is milliseconds from the start of the utterance
                self._phonemes.append((event.audio_position / 1000.0, name))
            i += 1
        return 0

    def available(self) -> bool:
        try:
            self._ensure()
            return True
        except EspeakUnavailable:
            return False

    def voices(self) -> List[str]:
        return ["espeak-fa"] if self.available() else []

    def synthesize(self, text: str, language: str = "fa", rate: float = 1.0):
        """@returns (pcm_s16le, sample_rate, [(seconds, mnemonic), ...])"""
        with self._lock:
            lib = self._ensure()
            self._pcm = bytearray()
            self._phonemes = []

            if lib.espeak_SetVoiceByName(language.encode()) != 0:
                raise EspeakUnavailable(f"espeak has no voice for '{language}'")
            lib.espeak_SetParameter(PARAM_RATE, int(DEFAULT_WPM * max(rate, 0.1)), 0)

            data = text.encode("utf-8")
            lib.espeak_Synth(data, len(data), 0, 0, 0, CHARS_UTF8, None, None)
            lib.espeak_Synchronize()

            return bytes(self._pcm), self.sample_rate, list(self._phonemes)


ESPEAK = Espeak()
