"""Service configuration, all overridable by environment variable."""

from __future__ import annotations

import os


class Settings:
    db_path: str = os.getenv("ADMIN_DB", "./data/museum.sqlite3")

    # Guards every /api route. The event intake is deliberately public,
    # because it is called from the visitor's browser.
    admin_token: str = os.getenv("ADMIN_TOKEN", "")

    # Running without a token exposes every museum's objects and reports to
    # anyone who can reach the port. A warning is not enough for that, so
    # the service refuses to start unless the operator opts in explicitly.
    allow_open: bool = os.getenv("ADMIN_ALLOW_OPEN", "") == "1"

    # Where the visitor page is deployed. Used to build the QR link for
    # each object so an operator never assembles that URL by hand.
    viewer_url: str = os.getenv("VIEWER_URL", "https://museum.example.com/app/viewer.html")

    cors_origins: list = os.getenv("ADMIN_CORS", "*").split(",")
    max_event_bytes: int = int(os.getenv("ADMIN_MAX_EVENT_BYTES", "4096"))
    default_days: int = int(os.getenv("ADMIN_DEFAULT_DAYS", "30"))


settings = Settings()


class Misconfigured(RuntimeError):
    pass


def require_configuration(cfg: Settings = None) -> None:
    """Fail closed. Called at import, so a misconfigured service never
    reaches the point of serving a request."""
    cfg = cfg or settings
    if cfg.admin_token:
        if len(cfg.admin_token) < 16:
            raise Misconfigured(
                "ADMIN_TOKEN is shorter than 16 characters. Generate one with:\n"
                "    python3 -c \"import secrets; print(secrets.token_urlsafe(32))\""
            )
        return
    if cfg.allow_open:
        return
    raise Misconfigured(
        "ADMIN_TOKEN is not set, so the /api routes would be open to anyone who\n"
        "can reach this port. Generate a token with:\n"
        "    python3 -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
        "and set ADMIN_TOKEN. For a local machine only, set ADMIN_ALLOW_OPEN=1."
    )
