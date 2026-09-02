"""Disk cache for synthesised audio.

In a museum most questions repeat, so most sentences repeat. Caching by
the normalised text means "ساعت کار موزه چیست؟" asked a hundred times
costs one synthesis, and the hundredth visitor gets the answer with no
synthesis latency at all.

The key is built from the normalised text, so two inputs that differ only
in markdown or whitespace share one entry.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import time
from pathlib import Path
from typing import Optional, Tuple


class AudioCache:
    def __init__(self, directory: Path, enabled: bool = True, max_mb: int = 2048):
        self.dir = Path(directory)
        self.enabled = enabled
        self.max_bytes = max_mb * 1024 * 1024
        self.hits = 0
        self.misses = 0
        if self.enabled:
            self.dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def key(text: str, voice: str, rate: float) -> str:
        raw = f"{voice}|{rate:.3f}|{text}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:32]

    def _paths(self, key: str) -> Tuple[Path, Path]:
        return self.dir / f"{key}.wav", self.dir / f"{key}.json"

    def get(self, key: str) -> Optional[Tuple[bytes, dict]]:
        if not self.enabled:
            return None
        wav, meta = self._paths(key)
        if not (wav.exists() and meta.exists()):
            self.misses += 1
            return None
        try:
            data = wav.read_bytes()
            info = json.loads(meta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.misses += 1
            return None
        self.hits += 1
        # touch for LRU eviction
        try:
            wav.touch()
        except OSError:
            pass
        return data, info

    def put(self, key: str, audio: bytes, info: dict) -> None:
        if not self.enabled:
            return
        wav, meta = self._paths(key)
        try:
            wav.write_bytes(audio)
            meta.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        except OSError:
            return
        self._evict()

    def _evict(self) -> None:
        files = sorted(self.dir.glob("*.wav"), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        while total > self.max_bytes and files:
            victim = files.pop(0)
            total -= victim.stat().st_size
            victim.unlink(missing_ok=True)
            victim.with_suffix(".json").unlink(missing_ok=True)

    def stats(self) -> dict:
        entries = list(self.dir.glob("*.wav")) if self.enabled and self.dir.exists() else []
        return {
            "enabled": self.enabled,
            "entries": len(entries),
            "bytes": sum(p.stat().st_size for p in entries),
            "hits": self.hits,
            "misses": self.misses,
        }

    def clear(self) -> None:
        if self.enabled and self.dir.exists():
            shutil.rmtree(self.dir, ignore_errors=True)
            self.dir.mkdir(parents=True, exist_ok=True)
