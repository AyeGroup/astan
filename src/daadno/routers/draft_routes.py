"""‏/drafts — پیش‌نویس سند."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import drafts
from ..config import get_settings
from ..deps import current_user
from ..schemas import DraftCreate

router = APIRouter(tags=["drafts"])


@router.post("/drafts", status_code=201)
def create_draft(body: DraftCreate, user: dict = Depends(current_user)):
    try:
        return drafts.create(
            user["sub"],
            body.template_code,
            body.fields,
            body.case_id,
            get_settings().draft_daily_quota,
        )
    except drafts.QuotaExceededError as exc:
        raise HTTPException(429, "daily draft quota exceeded") from exc
    except drafts.MissingFieldsError as exc:
        raise HTTPException(422, {"error": "missing_fields", "fields": exc.missing}) from exc
    except drafts.UnknownTemplateError as exc:
        raise HTTPException(400, "unknown template") from exc


@router.get("/drafts/templates")
def list_templates():
    return {
        "items": [
            {"code": code, "title": t["title"], "required": t["required"], "labels": t["labels"]}
            for code, t in drafts.TEMPLATES.items()
        ]
    }
