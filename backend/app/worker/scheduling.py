import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.core.config import settings
from app.core.db import engine
from app.models import CallTask, CallTaskStatus, Routine, Ward


def materialize_call_tasks(
    now: datetime | None = None, routine_id: uuid.UUID | None = None
) -> int:
    """Materialize approved routines within the configured scheduling horizon."""
    now = now or datetime.now(UTC)
    horizon = now + timedelta(hours=settings.MATERIALIZER_HORIZON_H)
    created = 0
    with Session(engine) as session:
        query = (
            select(Routine, Ward)
            .join(Ward, Routine.ward_id == Ward.id)
            .where(Routine.status == "approved", Ward.active.is_(True))
        )
        if routine_id:
            query = query.where(Routine.id == routine_id)
        routines = session.exec(query).all()
        for routine, ward in routines:
            zone = ZoneInfo(ward.tz)
            local_now = now.astimezone(zone)
            first_day = local_now.date()
            last_day = horizon.astimezone(zone).date()
            day = first_day
            while day <= last_day:
                scheduled = datetime.combine(day, routine.time_of_day, tzinfo=zone)
                scheduled_utc = scheduled.astimezone(UTC)
                weekday = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")[day.weekday()]
                matches_day = (
                    routine.days_mask == "daily"
                    or weekday in routine.days_mask.split(",")
                )
                if matches_day and now <= scheduled_utc <= horizon:
                    existing = session.exec(
                        select(CallTask).where(
                            CallTask.routine_id == routine.id,
                            CallTask.scheduled_at == scheduled_utc,
                            CallTask.attempt_no == 1,
                        )
                    ).first()
                    if existing is None:
                        try:
                            with session.begin_nested():
                                session.add(
                                    CallTask(
                                        routine_id=routine.id,
                                        scheduled_at=scheduled_utc,
                                        attempt_no=1,
                                    )
                                )
                            created += 1
                        except IntegrityError:
                            pass  # A concurrent materializer inserted the occurrence.
                    elif existing.status == CallTaskStatus.CANCELLED:
                        existing.status = CallTaskStatus.PENDING
                        session.add(existing)
                day += timedelta(days=1)
        session.commit()
    return created


def claim_due_call_tasks(limit: int = 20, now: datetime | None = None) -> list[str]:
    """Atomically claim due tasks and queue the provider integration task."""
    now = now or datetime.now(UTC)
    claimed: list[str] = []
    with Session(engine) as session:
        due_ids = session.exec(
            select(CallTask.id)
            .where(
                CallTask.status == CallTaskStatus.PENDING,
                CallTask.scheduled_at <= now,
            )
            .order_by(col(CallTask.scheduled_at))
            .limit(limit)
        ).all()
        for task_id in due_ids:
            routine_and_ward = session.exec(
                select(Routine, Ward)
                .join(Ward, Routine.ward_id == Ward.id)
                .join(CallTask, CallTask.routine_id == Routine.id)
                .where(CallTask.id == task_id)
            ).first()
            if (
                routine_and_ward is None
                or routine_and_ward[0].status != "approved"
                or not routine_and_ward[1].active
            ):
                session.exec(
                    update(CallTask)
                    .where(
                        CallTask.id == task_id,
                        CallTask.status == CallTaskStatus.PENDING,
                    )
                    .values(status=CallTaskStatus.CANCELLED)
                )
                continue
            result = session.exec(
                update(CallTask)
                .where(
                    CallTask.id == task_id,
                    CallTask.status == CallTaskStatus.PENDING,
                )
                .values(status=CallTaskStatus.IN_PROGRESS)
            )
            if result.rowcount == 1:
                claimed.append(str(task_id))
        session.commit()
    return claimed
