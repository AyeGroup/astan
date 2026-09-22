"""پیکربندی سراسری. همه‌چیز از متغیر محیطی، هیچ مقدار حساسی در کد."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DAADNO_", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@127.0.0.1:5432/daadno"
    db_pool_min: int = 1
    db_pool_max: int = 8

    # §6 — شماره موبایل فقط به صورت HMAC ذخیره می‌شود. این کلید هرگز نباید
    # مقدار پیش‌فرض بماند؛ check_config در CI جلوی رفتن آن به پرودکشن را می‌گیرد.
    phone_hmac_key: str = "dev-only-change-me"
    jwt_secret: str = "dev-only-change-me"
    jwt_ttl_seconds: int = 60 * 60 * 12
    environment: str = "dev"

    embedding_provider: str = "hashing"  # hashing | openai_compatible
    embedding_dim: int = 1024
    embedding_api_base: str | None = None
    embedding_api_key: str | None = None
    embedding_model: str = "text-embedding-3-large"

    llm_provider: str = "heuristic"  # heuristic | anthropic
    llm_api_key: str | None = None
    llm_model: str = "claude-opus-5"
    llm_timeout_seconds: float = 20.0

    # دروازهٔ pre-flight — prompts/02_answer.md. روی golden set کالیبره می‌شود.
    threshold_ask: float = 0.016
    threshold_route: float = 0.008
    # سقف فاصلهٔ کسینوسی. بدون این، آستانهٔ امتیاز بی‌اثر است — توضیح در
    # retrieval.passes_gate و README. مثل آستانه‌ها روی golden set کالیبره شود.
    # مقدار زیر از scripts/calibrate_thresholds.py روی provider «hashing» و
    # مجموعهٔ نمونه آمده و آماری نیست. با تعویض provider یا رسیدن مجموعهٔ
    # طلایی به ۲۰۰ ردیف، دوباره کالیبره شود.
    max_distance_ask: float = 0.75
    max_distance_route: float = 0.82
    retrieval_limit: int = 30
    answer_chunk_limit: int = 8

    review_period_days: int = 90
    draft_daily_quota: int = 5

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"prod", "production"}


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production:
        for field in ("phone_hmac_key", "jwt_secret"):
            if getattr(s, field) == "dev-only-change-me":
                raise RuntimeError(f"DAADNO_{field.upper()} must be set in production")
    return s
