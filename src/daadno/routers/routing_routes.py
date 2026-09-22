"""‏/route و /ask."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import ask_service, router_service
from ..deps import optional_user
from ..schemas import AskRequest, RouteRequest

router = APIRouter(tags=["routing"])


@router.post("/route")
def route(body: RouteRequest, user: dict | None = Depends(optional_user)):
    return router_service.route(
        body.text,
        persona=body.persona,
        answers=body.answers,
        session_id=body.session_id,
        user_id=user.get("sub") if user else None,
    )


@router.post("/ask")
def ask(body: AskRequest, user: dict | None = Depends(optional_user)):
    return ask_service.ask(
        body.text,
        session_id=body.session_id,
        persona=body.persona,
        user_id=user.get("sub") if user else None,
    )
