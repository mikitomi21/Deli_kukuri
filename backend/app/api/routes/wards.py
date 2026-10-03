import uuid
from datetime import UTC, datetime, timedelta
from datetime import time as time_of_day_type
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    CallTaskRead,
    CallTasksRead,
    Message,
    Routine,
    Ward,
    WardCreate,
    WardPublic,
    WardsPublic,
    WardUpdate,
)

router = APIRouter(prefix="/wards", tags=["wards"])

WEEKDAY_CODES = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")  # Monday = 0


def _next_occurrence(
    *,
    time_of_day: time_of_day_type,
    days_mask: str,
    tz: ZoneInfo,
    now: datetime,
) -> datetime:
    """Nearest future UTC datetime matching the routine's time and days mask
    (docs/03: materializer plans the nearest matching time)."""
    for day_offset in range(8):  # a full week must always contain a match
        local_day = (now + timedelta(days=day_offset)).astimezone(tz)
        if days_mask != "daily":
            if WEEKDAY_CODES[local_day.weekday()] not in days_mask.split(","):
                continue
        candidate = local_day.replace(
            hour=time_of_day.hour,
            minute=time_of_day.minute,
            second=0,
            microsecond=0,
        )
        if candidate > now:
            return candidate.astimezone(UTC)
    raise AssertionError("unreachable: weekly scan found no matching day")


def _scheduled_call_tasks(
    session: Any, ward: Ward, now: datetime
) -> list[CallTaskRead]:
    """Harmonogram połączeń liczony z zatwierdzonych rutyn (docs/03 CallTask).
    Bez dispatchera/Twilio nie ma retry-history, więc każde zadanie to
    najbliższe przyszłe wystąpienie rutyny z attempt_no = 1."""
    routines = session.exec(
        select(Routine)
        .where(Routine.ward_id == ward.id, Routine.status == "approved")
        .order_by(col(Routine.created_at).asc())
    ).all()
    tz = ZoneInfo(ward.tz)
    tasks = [
        CallTaskRead(
            id=f"{routine.id}-{occurrence.isoformat()}",
            ward_id=ward.id,
            routine_id=routine.id,
            routine_name=routine.name,
            scheduled_at=occurrence,
            status="pending",
            attempt_no=1,
        )
        for routine in routines
        if (
            occurrence := _next_occurrence(
                time_of_day=routine.time_of_day,
                days_mask=routine.days_mask,
                tz=tz,
                now=now,
            )
        )
    ]
    tasks.sort(key=lambda task: task.scheduled_at)
    return tasks


@router.get("/", response_model=WardsPublic)
def read_wards(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve wards of the current caregiver.
    """
    count_statement = (
        select(func.count())
        .select_from(Ward)
        .where(Ward.caregiver_id == current_user.id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(Ward)
        .where(Ward.caregiver_id == current_user.id)
        .order_by(col(Ward.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    wards = session.exec(statement).all()
    return WardsPublic(
        data=[WardPublic.model_validate(ward) for ward in wards], count=count
    )


@router.get("/{id}", response_model=WardPublic)
def read_ward(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get ward by ID.
    """
    ward = session.get(Ward, id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        # Obcy podopieczny = 404, nie ujawniamy istnienia cudzych zasobów (docs/05)
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward


@router.post("/", response_model=WardPublic)
def create_ward(
    *, session: SessionDep, current_user: CurrentUser, ward_in: WardCreate
) -> Any:
    """
    Create new ward (podopieczny) owned by the current caregiver.
    """
    ward = Ward.model_validate(ward_in, update={"caregiver_id": current_user.id})
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return ward


@router.patch("/{id}", response_model=WardPublic)
def update_ward(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    ward_in: WardUpdate,
) -> Any:
    """
    Update a ward.
    """
    ward = session.get(Ward, id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Ward not found")
    update_dict = ward_in.model_dump(exclude_unset=True)
    # Jawne null-e opcjonalnych pól = błąd klienta; bez tego NOT NULL wywali się 500
    null_fields = sorted(key for key, value in update_dict.items() if value is None)
    if null_fields:
        raise HTTPException(
            status_code=422,
            detail=f"Fields cannot be null: {', '.join(null_fields)}",
        )
    ward.sqlmodel_update(update_dict)
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return ward


@router.delete("/{id}")
def delete_ward(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Permanently delete a ward. Routines, call tasks and calls cascade
    via FK ondelete=CASCADE (docs/03-data-model.md).
    """
    ward = session.get(Ward, id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Ward not found")
    session.delete(ward)
    session.commit()
    return Message(message="Ward deleted successfully")


@router.get("/{ward_id}/call-tasks", response_model=CallTasksRead)
def read_ward_call_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: uuid.UUID,
    status: str = "pending",
) -> Any:
    """
    Planned calls for a ward, materialized on the fly from its approved
    routines (docs/05: GET /wards/{ward_id}/call-tasks?status=...).
    """
    ward = session.get(Ward, ward_id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        # Obcy zasób = 404, nie ujawniamy istnienia cudzych podopiecznych (docs/05)
        raise HTTPException(status_code=404, detail="Ward not found")
    tasks = _scheduled_call_tasks(session, ward, datetime.now(UTC))
    if status:
        tasks = [task for task in tasks if task.status == status]
    return CallTasksRead(data=tasks, count=len(tasks))
