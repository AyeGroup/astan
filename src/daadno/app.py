"""نقطهٔ ورود FastAPI."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import close_pool, fetch_one, get_pool
from .guards import NO_CREDENTIALS_NOTICE
from .routers import (
    admin_routes,
    auth_routes,
    case_routes,
    catalog_routes,
    draft_routes,
    routing_routes,
)
from .web import routes as web_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("daadno")

API_PREFIX = "/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_pool()
    yield
    close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Daadno Judicial Services Navigator API",
        version="0.1.0",
        description=(
            "قرارداد کامل در api/openapi.yaml. سه قاعدهٔ سراسری: هیچ اعتبارنامهٔ "
            "سامانه دولتی، هیچ پاسخ بدون ارجاع، هیچ عدد مهلت خارج از موتور مواعد."
        ),
        lifespan=lifespan,
    )

    for module in (
        catalog_routes,
        routing_routes,
        auth_routes,
        case_routes,
        draft_routes,
    ):
        app.include_router(module.router, prefix=API_PREFIX)
    app.include_router(admin_routes.router, prefix=API_PREFIX)

    static_dir = Path(__file__).resolve().parent / "web" / "static"
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    app.include_router(web_routes.router)

    @app.get(f"{API_PREFIX}/health", tags=["ops"])
    def health():
        db_ok = True
        try:
            fetch_one("SELECT 1 AS ok")
        except Exception:
            log.exception("health: database unreachable")
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "database": db_ok,
            "embedding_provider": settings.embedding_provider,
            "llm_provider": settings.llm_provider,
            "notice": NO_CREDENTIALS_NOTICE,
        }

    @app.middleware("http")
    async def strip_sensitive_query(request: Request, call_next):
        """§۱ — اگر کسی اعتبارنامه را در کوئری‌استرینگ بفرستد، درخواست رد می‌شود
        تا آن مقدار در لاگ دسترسی سرور ننشیند."""
        # rules-ok(§1): فهرست سیاه است، نه ذخیره‌سازی
        forbidden = {"password", "sana_password", "sanapassword", "otp", "pin"}
        if forbidden & {k.lower() for k in request.query_params}:
            return JSONResponse(
                status_code=400,
                content={"error": "credentials must never be sent in a query string"},
            )
        return await call_next(request)

    return app


app = create_app()
