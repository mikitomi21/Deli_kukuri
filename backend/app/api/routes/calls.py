import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    Call,
    CallOutcome,
    CallPublic,
    CallResult,
    CallResultPublic,
    CallsPublic,
    CallTask,
    CallTaskPublic,
    CallTasksPublic,
    CallTurn,
    CallTurnPublic,
    DailyStats,
    EscalationEvent,
    Message,
    Routine,
    RoutineItem,
    Ward,
    WardStatsPublic,
    User,
)
from app.twilio.sms import send_admin_sms
from app.worker.placing import voice_provider_ready
from app.worker.tasks import place_call

router = APIRouter(tags=["calls"])


def _get_owned_ward(
    session: SessionDep, current_user: CurrentUser, ward_id: uuid.UUID
) -> Ward:
    ward = session.get(Ward, ward_id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward


@router.post(
    "/wards/{ward_id}/test-call", response_model=CallTaskPublic, status_code=201
)
def create_test_call(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: uuid.UUID,
    routine_id: uuid.UUID | None = None,
) -> Any:
    """Queue an immediate call using an approved routine; the worker places it."""
    ward = _get_owned_ward(session, current_user, ward_id)
    if not ward.active:
        raise HTTPException(status_code=409, detail="Ward is deactivated")
    statement = select(Routine).where(
        Routine.ward_id == ward_id, Routine.status == "approved"
    )
    if routine_id:
        statement = statement.where(Routine.id == routine_id)
    candidates = session.exec(statement).all()
    local_now = datetime.now(ZoneInfo(ward.tz))

    def next_occurrence(routine: Routine) -> datetime:
        for offset in range(8):
            day = local_now.date() + timedelta(days=offset)
            weekday = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")[day.weekday()]
            at = datetime.combine(day, routine.time_of_day, tzinfo=ZoneInfo(ward.tz))
            if at >= local_now and (
                routine.days_mask == "daily" or weekday in routine.days_mask.split(",")
            ):
                return at
        return local_now + timedelta(days=8)

    routine = min(candidates, key=next_occurrence) if candidates else None
    if not routine:
        raise HTTPException(status_code=409, detail="No approved routine found")
    has_items = session.exec(
        select(func.count())
        .select_from(RoutineItem)
        .where(RoutineItem.routine_id == routine.id)
    ).one()
    if not has_items:
        raise HTTPException(status_code=409, detail="Routine has no medications")

    if not voice_provider_ready():
        raise HTTPException(status_code=503, detail="Voice provider is unavailable")

    call_task = CallTask(
        routine_id=routine.id,
        scheduled_at=datetime.now(UTC),
    )
    session.add(call_task)
    session.commit()
    session.refresh(call_task)
    try:
        place_call.delay(str(call_task.id))
    except Exception:
        # The persisted pending task remains available to Beat for recovery.
        raise HTTPException(status_code=503, detail="Call queue is unavailable")
    return call_task


@router.get("/wards/{ward_id}/call-tasks", response_model=CallTasksPublic)
def read_call_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: uuid.UUID,
    status: str | None = None,
    skip: int = 0,
    limit: int = 100,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
) -> Any:
    """List scheduled call tasks for a ward."""
    _get_owned_ward(session, current_user, ward_id)
    statement = select(CallTask).join(Routine).where(Routine.ward_id == ward_id)
    count_statement = (
        select(func.count())
        .select_from(CallTask)
        .join(Routine)
        .where(Routine.ward_id == ward_id)
    )
    if status:
        statement = statement.where(CallTask.status == status)
        count_statement = count_statement.where(CallTask.status == status)
    for timestamp, operator in ((from_, "from"), (to, "to")):
        if timestamp is not None:
            condition = (
                CallTask.scheduled_at >= timestamp
                if operator == "from"
                else CallTask.scheduled_at <= timestamp
            )
            statement = statement.where(condition)
            count_statement = count_statement.where(condition)
    count = session.exec(count_statement).one()
    tasks = session.exec(
        statement.order_by(col(CallTask.scheduled_at)).offset(skip).limit(limit)
    ).all()
    return CallTasksPublic(data=tasks, count=count)


def _call_to_public(session: SessionDep, call: Call) -> CallPublic:
    task = session.get(CallTask, call.call_task_id)
    routine = session.get(Routine, task.routine_id)
    result = session.exec(
        select(CallResult).where(CallResult.call_id == call.id)
    ).first()
    turns = session.exec(
        select(CallTurn).where(CallTurn.call_id == call.id).order_by(CallTurn.turn_no)
    ).all()
    return CallPublic(
        id=call.id,
        ward_id=routine.ward_id,
        call_task_id=task.id,
        routine_id=routine.id,
        routine={"name": routine.name, "time_of_day": routine.time_of_day.isoformat()},
        status=call.status,
        started_at=call.created_at,
        duration_sec=call.duration_sec,
        attempt_no=task.attempt_no,
        result=CallResultPublic.model_validate(result) if result else None,
        turns=[CallTurnPublic.model_validate(turn) for turn in turns],
    )


@router.get("/wards/{ward_id}/calls", response_model=CallsPublic)
def read_calls(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> CallsPublic:
    """Return the ward's real call history and results."""
    _get_owned_ward(session, current_user, ward_id)
    query = select(Call).join(CallTask).join(Routine).where(Routine.ward_id == ward_id)
    count = session.exec(
        select(func.count())
        .select_from(Call)
        .join(CallTask)
        .join(Routine)
        .where(Routine.ward_id == ward_id)
    ).one()
    rows = session.exec(
        query.order_by(col(Call.created_at).desc()).offset(skip).limit(limit)
    ).all()
    return CallsPublic(
        data=[_call_to_public(session, row) for row in rows], count=count
    )


@router.get("/calls/{id}", response_model=CallPublic)
def read_call(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> CallPublic:
    """Return the call transcript, result and routine after checking ownership."""
    call = session.get(Call, id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    task = session.get(CallTask, call.call_task_id)
    routine = session.get(Routine, task.routine_id)
    _get_owned_ward(session, current_user, routine.ward_id)
    return _call_to_public(session, call)


@router.post("/calls/{id}/sms", response_model=Message)
def send_call_summary_sms(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """Manually send a call summary to the configured administrator."""
    call = session.get(Call, id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    task = session.get(CallTask, call.call_task_id)
    routine = session.get(Routine, task.routine_id)
    ward = _get_owned_ward(session, current_user, routine.ward_id)
    result = session.exec(
        select(CallResult).where(CallResult.call_id == call.id)
    ).first()
    if result is None:
        raise HTTPException(status_code=409, detail="Call summary is not available")

    admin = session.exec(
        select(User).where(
            User.is_superuser.is_(True),
            User.admin_phone_number.is_not(None),
        )
    ).first()
    if admin is None or admin.admin_phone_number is None:
        raise HTTPException(status_code=409, detail="Admin phone number is not set")
    if not all(
        (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.SMS_FROM)
    ):
        raise HTTPException(status_code=503, detail="SMS service is not configured")

    summary = result.notes.strip() if result.notes else ""
    lines = ["DzwoniLek — raport z połączenia", f"Podopieczny: {ward.full_name}"]
    if result.outcome == CallOutcome.TOOK:
        lines.extend(["", "Wszystkie leki zostały przyjęte. Wszystko jest w porządku."])
    elif summary:
        lines.extend(["", summary[:500]])
    else:
        outcome_messages = {
            CallOutcome.TOOK: "Wszystkie leki zostały przyjęte. Wszystko jest w porządku.",
            CallOutcome.NOT_TAKEN: "Niepotwierdzone przyjęcie co najmniej jednego leku.",
            CallOutcome.UNCLEAR: "Nie uzyskano jasnego potwierdzenia przyjęcia leków.",
            CallOutcome.NO_ANSWER: "Nie uzyskano odpowiedzi w rozmowie.",
        }
        lines.extend([
            "",
            outcome_messages.get(result.outcome, "Nie udało się ustalić wyniku rozmowy."),
        ])
    message = "\n".join(lines)
    notification = EscalationEvent(
        call_result_id=result.id,
        caregiver_id=ward.caregiver_id,
        channel="sms",
        payload={"to": admin.admin_phone_number, "message": message, "manual": True},
        status="pending",
    )
    session.add(notification)
    session.commit()

    try:
        send_admin_sms(admin.admin_phone_number, message)
    except (httpx.HTTPError, RuntimeError) as exc:
        notification.status = "failed"
        session.add(notification)
        session.commit()
        raise HTTPException(status_code=502, detail="Failed to send SMS") from exc

    notification.status = "sent"
    session.add(notification)
    session.commit()
    return Message(message="SMS sent")


@router.get("/wards/{ward_id}/stats", response_model=WardStatsPublic)
def read_stats(
    session: SessionDep, current_user: CurrentUser, ward_id: uuid.UUID
) -> WardStatsPublic:
    """Calculate routine outcomes using the ward's local calendar day."""
    ward = _get_owned_ward(session, current_user, ward_id)
    today = datetime.now(ZoneInfo(ward.tz)).date()
    rows = session.exec(
        select(CallTask, CallResult)
        .join(Call, Call.call_task_id == CallTask.id)
        .join(CallResult, CallResult.call_id == Call.id)
        .join(Routine, Routine.id == CallTask.routine_id)
        .where(Routine.ward_id == ward_id)
    ).all()
    daily = set()
    week_total = set()
    week_took = set()
    for task, result in rows:
        day = task.scheduled_at.replace(tzinfo=UTC).astimezone(ZoneInfo(ward.tz)).date()
        key = (task.routine_id, day)
        if today - timedelta(days=6) <= day <= today:
            week_total.add(key)
            if result.outcome == "took":
                week_took.add(key)
                if day == today:
                    daily.add(task.routine_id)
    total = session.exec(
        select(func.count())
        .select_from(Routine)
        .where(Routine.ward_id == ward_id, Routine.status == "approved")
    ).one()
    return WardStatsPublic(
        today=DailyStats(took=len(daily), total=total),
        week_pct=round(100 * len(week_took) / len(week_total)) if week_total else 0,
    )
