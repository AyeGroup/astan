"""Service configuration, all overridable by environment variable."""

from __future__ import annotations

import os


class Settings:
    db_path: str = os.getenv("ADMIN_DB", "./data/museum.sqlite3")

    # Guards every /api route. The event intake is deliberately public,
    # because it is called from the visitor's browser.
    admin_token: str = os.getenv("ADMIN_TOKEN", "")

    # Where the visitor page is deployed. Used to build the QR link for
    # each object so an operator never assembles that URL by hand.
    viewer_url: str = os.getenv("VIEWER_URL", "https://museum.example.com/app/viewer.html")

    cors_origins: list = os.getenv("ADMIN_CORS", "*").split(",")
    max_event_bytes: int = int(os.getenv("ADMIN_MAX_EVENT_BYTES", "4096"))
    default_days: int = int(os.getenv("ADMIN_DEFAULT_DAYS", "30"))


settings = Settings()
