import uuid
from collections.abc import Generator
from datetime import UTC, datetime, time, timedelta
from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, delete, select, update

from app.core.config import settings
from app.core.db import engine
from app.models import (
    Call,
    CallOutcome,
    CallResult,
    CallTask,
    CallTaskStatus,
    CallTurn,
    EscalationEvent,
    Routine,
    User,
    Ward,
)


@pytest.fixture
def session() -> Generator[Session]:
    # Keep these database constraint checks independent of API test data.
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection) as session:
            yield session
        transaction.rollback()


@pytest.fixture
def call_graph(session: Session) -> dict[str, Any]:
    user = User(email=f"calls-{uuid.uuid4()}@example.com", hashed_password="unused")
    session.add(user)
    session.flush()
    ward = Ward(caregiver_id=user.id, full_name="Test ward", phone_e164="+48600100200")
    session.add(ward)
    session.flush()
    routine = Routine(ward_id=ward.id, name="Morning", time_of_day=time(9))
    session.add(routine)
    session.flush()
    task = CallTask(routine_id=routine.id, scheduled_at=datetime.now(UTC))
    session.add(task)
    session.flush()
    call = Call(call_task_id=task.id, twilio_call_sid=f"CA{uuid.uuid4().hex}")
    session.add(call)
    session.flush()
    turn = CallTurn(call_id=call.id, turn_no=1, question="Have you taken it?")
    result = CallResult(call_id=call.id, outcome=CallOutcome.NOT_TAKEN)
    session.add_all([turn, result])
    session.flush()
    escalation = EscalationEvent(
        call_result_id=result.id,
        caregiver_id=user.id,
        payload={"body": "Please check in"},
    )
    session.add(escalation)
    session.flush()
    return {
        "user": user,
        "ward": ward,
        "routine": routine,
        "task": task,
        "call": call,
        "turn": turn,
        "result": result,
        "escalation": escalation,
    }


def test_call_graph_persists_utc_timestamps_and_json(
    session: Session, call_graph: dict[str, Any]
) -> None:
    for model in call_graph.values():
        session.refresh(model)
        assert model.created_at.utcoffset() == timedelta(0)
        assert model.updated_at.utcoffset() == timedelta(0)
    assert call_graph["task"].scheduled_at.utcoffset() == timedelta(0)
    assert call_graph["escalation"].payload == {"body": "Please check in"}


def test_attempt_limit_uses_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CALL_MAX_ATTEMPTS", 4)
    task = CallTask(routine_id=uuid.uuid4(), scheduled_at=datetime.now(UTC))
    assert task.max_attempts == 4


def test_dispatcher_update_advances_timestamp(
    session: Session, call_graph: dict[str, Any]
) -> None:
    task = call_graph["task"]
    before = task.updated_at
    session.exec(
        update(CallTask)
        .where(col(CallTask.id) == task.id)
        .values(status=CallTaskStatus.IN_PROGRESS)
    )
    session.refresh(task)
    assert task.updated_at > before
    assert task.created_at < task.updated_at


@pytest.mark.parametrize("duplicate", ["task", "call_task", "sid", "turn", "result"])
def test_duplicate_callbacks_and_tasks_are_rejected(
    session: Session, call_graph: dict[str, Any], duplicate: str
) -> None:
    task, call = call_graph["task"], call_graph["call"]
    if duplicate == "task":
        row = CallTask(routine_id=task.routine_id, scheduled_at=task.scheduled_at)
    elif duplicate == "call_task":
        row = Call(call_task_id=task.id)
    elif duplicate == "sid":
        other_task = CallTask(
            routine_id=task.routine_id,
            scheduled_at=task.scheduled_at + timedelta(hours=1),
        )
        session.add(other_task)
        session.flush()
        row = Call(call_task_id=other_task.id, twilio_call_sid=call.twilio_call_sid)
    elif duplicate == "turn":
        row = CallTurn(call_id=call.id, turn_no=1, question="Repeated callback")
    else:
        row = CallResult(call_id=call.id, outcome=CallOutcome.TOOK)
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(row)
        session.flush()


@pytest.mark.parametrize(
    ("model", "changes"),
    [
        ("routine", {"status": "unknown"}),
        ("task", {"status": "unknown"}),
        ("task", {"attempt_no": 0}),
        ("task", {"attempt_no": 3, "max_attempts": 2}),
        ("task", {"routine_id": uuid.UUID(int=0)}),
        ("call", {"status": "unknown"}),
        ("call", {"duration_sec": -1}),
        ("turn", {"turn_no": 0}),
        ("turn", {"confidence": -0.1}),
        ("turn", {"confidence": 1.1}),
        ("turn", {"parsed": "unknown"}),
        ("result", {"outcome": "unknown"}),
        ("result", {"confidence": 1.1}),
        ("escalation", {"channel": "unknown"}),
        ("escalation", {"status": "unknown"}),
    ],
)
def test_database_rejects_invalid_call_data(
    session: Session, call_graph: dict[str, Any], model: str, changes: dict[str, Any]
) -> None:
    row = call_graph[model]
    with pytest.raises(IntegrityError), session.begin_nested():
        for field, value in changes.items():
            setattr(row, field, value)
        session.add(row)
        session.flush()


def test_user_deletion_removes_call_graph(
    session: Session, call_graph: dict[str, Any]
) -> None:
    session.exec(delete(User).where(col(User.id) == call_graph["user"].id))
    for row in call_graph.values():
        model = type(row)
        assert (
            session.exec(select(model).where(col(model.id) == row.id)).first() is None
        )
