import uuid
from datetime import UTC, datetime, time

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import (
    CallTask,
    CallTaskStatus,
    Medication,
    Routine,
    RoutineItem,
    User,
    Ward,
)
from app.worker import scheduling, tasks


@pytest.fixture
def scheduling_db(monkeypatch: pytest.MonkeyPatch):
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)
    monkeypatch.setattr(scheduling, "engine", test_engine)
    yield test_engine
    test_engine.dispose()


def _add_routine(
    session: Session,
    *,
    status: str = "approved",
    active: bool = True,
    time_of_day: time = time(12),
) -> Routine:
    user = User(email=f"schedule-{uuid.uuid4()}@example.com", hashed_password="unused")
    session.add(user)
    session.flush()
    ward = Ward(
        caregiver_id=user.id,
        full_name="Scheduled ward",
        phone_e164="+48600100200",
        active=active,
        tz="Europe/Warsaw",
    )
    session.add(ward)
    session.flush()
    medication = Medication(name=f"Medication-{uuid.uuid4()}", dosage="5 mg")
    session.add(medication)
    session.flush()
    routine = Routine(
        ward_id=ward.id,
        name="Routine",
        time_of_day=time_of_day,
        status=status,
    )
    session.add(routine)
    session.flush()
    session.add(
        RoutineItem(
            routine_id=routine.id,
            medication_id=medication.id,
            amount_label="1 tablet",
        )
    )
    session.commit()
    session.refresh(routine)
    return routine


def test_materializer_creates_only_approved_active_tasks_and_is_idempotent(
    scheduling_db,
) -> None:
    with Session(scheduling_db) as session:
        approved = _add_routine(session)
        approved_id = approved.id
        _add_routine(session, status="paused")
        _add_routine(session, active=False)

    now = datetime(2026, 10, 3, 7, 0, tzinfo=UTC)
    assert scheduling.materialize_call_tasks(now) == 2
    assert scheduling.materialize_call_tasks(now) == 0

    with Session(scheduling_db) as session:
        rows = session.exec(select(CallTask)).all()
        assert len(rows) == 2
        assert {row.routine_id for row in rows} == {approved_id}
        assert {row.attempt_no for row in rows} == {1}
        assert {row.status for row in rows} == {CallTaskStatus.PENDING}


def test_dispatcher_claims_due_tasks_once_and_cancels_paused_routines(
    scheduling_db,
) -> None:
    now = datetime(2026, 10, 3, 10, 0, tzinfo=UTC)
    with Session(scheduling_db) as session:
        approved = _add_routine(session, time_of_day=time(9))
        paused = _add_routine(session, status="paused", time_of_day=time(9))
        claimed_task = CallTask(
            routine_id=approved.id,
            scheduled_at=now,
            status=CallTaskStatus.PENDING,
        )
        cancelled_task = CallTask(
            routine_id=paused.id,
            scheduled_at=now,
            status=CallTaskStatus.PENDING,
        )
        session.add_all([claimed_task, cancelled_task])
        session.commit()
        claimed_task_id = claimed_task.id
        cancelled_task_id = cancelled_task.id

    claimed = scheduling.claim_due_call_tasks(now=now)
    assert claimed == [str(claimed_task_id)]
    assert scheduling.claim_due_call_tasks(now=now) == []

    with Session(scheduling_db) as session:
        assert (
            session.get(CallTask, claimed_task_id).status == CallTaskStatus.IN_PROGRESS
        )
        assert (
            session.get(CallTask, cancelled_task_id).status == CallTaskStatus.CANCELLED
        )


def test_beat_tasks_call_the_scheduling_functions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(tasks, "voice_provider_ready", lambda: True)
    calls: list[tuple[str, object]] = []
    queued: list[str] = []
    monkeypatch.setattr(
        tasks,
        "materialize_call_tasks",
        lambda: calls.append(("materialize", None)) or 3,
    )
    monkeypatch.setattr(tasks, "claim_due_call_tasks", lambda: ["task-1", "task-2"])
    monkeypatch.setattr(
        tasks.place_call, "delay", lambda task_id: queued.append(task_id)
    )

    tasks.materializer_tick.run()
    tasks.dispatcher_tick.run()

    assert calls == [("materialize", None)]
    assert queued == ["task-1", "task-2"]
