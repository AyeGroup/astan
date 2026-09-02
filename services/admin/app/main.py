"""Admin service: object management, QR links, and the questions report.

Runs alongside ragbuilder rather than inside it. ragbuilder already owns
content ingestion and the bot itself; what was missing is the layer that
knows which physical object a QR belongs to, and what visitors actually
asked in front of it.

Two audiences, two access rules:

  /api/*    the museum's operator, behind an admin token
  /events   the visitor's browser, public by necessity

The event intake accepts exactly the payload app/js/viewer.js already
sends, so no client change is needed to start collecting.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import Database
from .settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("admin")

app = FastAPI(title="Museum Avatar Admin", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

db = Database(settings.db_path)
WEB = Path(__file__).resolve().parent.parent / "web"


# ------------------------------------------------------------------ auth

def require_admin(x_admin_token: Optional[str] = Header(default=None),
                  authorization: Optional[str] = Header(default=None)) -> None:
    if not settings.admin_token:
        # An unset token means single-operator local use. Say so loudly at
        # startup rather than pretending the API is protected.
        return
    supplied = x_admin_token or (authorization or "").removeprefix("Bearer ").strip()
    if supplied != settings.admin_token:
        raise HTTPException(401, "admin token required")


if not settings.admin_token:
    log.warning("ADMIN_TOKEN is unset: the /api routes are open. Set it before exposing this service.")


# ----------------------------------------------------------------- models

class MuseumIn(BaseModel):
    slug: str = Field(..., pattern=r"^[a-z0-9][a-z0-9-]{1,40}$")
    name: str = Field(..., min_length=1)
    bot_uuid: str = Field(..., min_length=8)
    avatar: str = "mehrbanoo"
    langs: List[str] = ["fa"]


class ObjectIn(BaseModel):
    code: str = Field(..., pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$")
    title: str = Field(..., min_length=1)
    note: str = ""
    hall: str = ""
    avatar: str = ""


# --------------------------------------------------------------- museums

@app.get("/api/museums", dependencies=[Depends(require_admin)])
def list_museums():
    return {"museums": db.museums()}


@app.post("/api/museums", dependencies=[Depends(require_admin)])
def create_museum(body: MuseumIn):
    if db.museum(body.slug):
        raise HTTPException(409, f"museum '{body.slug}' already exists")
    if db.museum_by_bot(body.bot_uuid):
        raise HTTPException(409, "that bot is already bound to another museum")
    return db.create_museum(body.slug, body.name, body.bot_uuid, body.avatar, body.langs)


def _museum_or_404(slug: str):
    museum = db.museum(slug)
    if not museum:
        raise HTTPException(404, f"no museum '{slug}'")
    return museum


# ---------------------------------------------------------------- objects

@app.get("/api/museums/{slug}/objects", dependencies=[Depends(require_admin)])
def list_objects(slug: str):
    museum = _museum_or_404(slug)
    objects = db.objects(museum["id"])
    for obj in objects:
        obj["viewer_url"] = _viewer_url(museum, obj)
    return {"museum": museum, "objects": objects}


@app.put("/api/museums/{slug}/objects/{code}", dependencies=[Depends(require_admin)])
def put_object(slug: str, code: str, body: ObjectIn):
    museum = _museum_or_404(slug)
    if body.code != code:
        raise HTTPException(400, "code in the body must match the path")
    obj = db.upsert_object(museum["id"], body.code, body.title, body.note, body.hall, body.avatar)
    obj["viewer_url"] = _viewer_url(museum, obj)
    return obj


@app.delete("/api/museums/{slug}/objects/{code}", dependencies=[Depends(require_admin)])
def delete_object(slug: str, code: str):
    museum = _museum_or_404(slug)
    if not db.delete_object(museum["id"], code):
        raise HTTPException(404, f"no object '{code}'")
    return {"deleted": code}


@app.get("/api/museums/{slug}/qr.csv", dependencies=[Depends(require_admin)])
def qr_csv(slug: str):
    """The exact CSV tools/make_qr.py consumes, so printing labels is one
    command away rather than a spreadsheet assembled by hand."""
    museum = _museum_or_404(slug)
    lines = ["object_id,title,avatar,lang"]
    for obj in db.objects(museum["id"]):
        title = obj["title"].replace('"', "'")
        avatar = obj["avatar"] or museum["avatar"]
        lines.append(f'{obj["code"]},"{title}",{avatar},{museum["langs"][0]}')
    return Response("\n".join(lines) + "\n", media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{slug}-objects.csv"'})


# -------------------------------------------------------------- dashboard

@app.get("/api/museums/{slug}/dashboard", dependencies=[Depends(require_admin)])
def dashboard(slug: str, days: int = 0, limit: int = 20):
    museum = _museum_or_404(slug)
    data = db.dashboard(museum["id"], days or settings.default_days, limit)
    data["museum"] = museum
    return data


# ------------------------------------------------------------------ intake

@app.post("/events")
async def ingest(request: Request):
    """Public intake for the visitor page.

    Unknown bots get 204 rather than an error: this endpoint is reachable
    from any browser, and a 404 here would tell a prober which bot ids are
    real. Nothing is stored for them either way.
    """
    raw = await request.body()
    if len(raw) > settings.max_event_bytes:
        raise HTTPException(413, "event payload too large")
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(400, "invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(400, "event must be an object")

    museum = db.museum_by_bot(str(payload.get("bot") or ""))
    if not museum:
        return Response(status_code=204)

    db.record(museum["id"], payload)
    return Response(status_code=204)


# --------------------------------------------------------------- plumbing

@app.get("/health")
def health():
    museums = db.museums()
    return {
        "status": "ok",
        "museums": len(museums),
        "db": settings.db_path,
        "auth": "token" if settings.admin_token else "open",
    }


def _viewer_url(museum, obj) -> str:
    params = {
        "bot": museum["bot_uuid"],
        "obj": obj["code"],
        "t": obj["title"],
        "av": obj.get("avatar") or museum["avatar"],
        "lang": museum["langs"][0],
    }
    return f"{settings.viewer_url}?{urlencode(params)}"


if WEB.exists():
    @app.get("/")
    def index():
        return FileResponse(WEB / "index.html")

    app.mount("/", StaticFiles(directory=str(WEB)), name="web")
