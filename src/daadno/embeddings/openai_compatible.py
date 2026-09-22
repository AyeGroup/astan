"""ارائه‌دهندهٔ HTTP سازگار با OpenAI (شامل سرویس‌های داخلی self-hosted)."""

from __future__ import annotations

import httpx

from . import EmbeddingProvider


class OpenAICompatibleProvider(EmbeddingProvider):
    name = "openai_compatible"

    def __init__(self, dim: int, api_base: str, api_key: str, model: str) -> None:
        super().__init__(dim)
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = httpx.post(
            f"{self.api_base}/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "input": texts, "dimensions": self.dim},
            timeout=30.0,
        )
        response.raise_for_status()
        data = sorted(response.json()["data"], key=lambda d: d["index"])
        vectors = [d["embedding"] for d in data]
        for v in vectors:
            if len(v) != self.dim:
                raise ValueError(
                    f"provider returned dim={len(v)}, schema expects VECTOR({self.dim})"
                )
        return vectors
