import uuid
from datetime import UTC, datetime, time, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.api.routes import calls
from app.core.config import settings
from app.models import Call, CallResult, CallTask, Routine, RoutineItem
from app.worker import placing, tasks
from tests.utils.routine import create_random_medication


@pytest.fixture
def voice_pipeline(monkeypatch: pytest.MonkeyPatch):
    requests = []
    monkeypatch.setattr(settings, "VOICE_SERVICE_TOKEN", "test-voice-token")
    monkeypatch.setattr(calls, "voice_provider_ready", lambda: True)
    monkeypatch.setattr(tasks, "voice_provider_ready", lambda: True)

    def provider(url, **kwargs):
        requests.append(kwargs["json"])
        return httpx.Response(
            201,
            json={"sid": f"CA{uuid.uuid4().hex}", "status": "queued"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(placing.httpx, "post", provider)
    monkeypatch.setattr(
        tasks.place_call, "delay", lambda task_id: tasks.place_call.run(task_id)
    )
    return requests


def _routine(client, headers, db):
    ward_response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=headers,
        json={"full_name": "Pipeline ward", "phone_e164": "+48600100200"},
    )
    assert ward_response.status_code == 200
    ward_id = uuid.UUID(ward_response.json()["id"])
    medication = create_random_medication(db)
    routine = Routine(
        ward_id=ward_id,
        name="Pipeline routine",
        time_of_day=time(12),
        status="approved",
    )
    db.add(routine)
    db.flush()
    db.add(
        RoutineItem(
            routine_id=routine.id, medication_id=medication.id, amount_label="1 tablet"
        )
    )
    db.commit()
    db.refresh(routine)
    return ward_id, routine


def test_manual_call_provider_result_and_history(
    client: TestClient,
    db: Session,
    normal_user_token_headers,
    voice_pipeline,
) -> None:
    ward_id, _ = _routine(client, normal_user_token_headers, db)
    response = client.post(
        f"{settings.API_V1_STR}/wards/{ward_id}/test-call",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 201, response.text
    task_id = response.json()["id"]
    assert voice_pipeline[0]["to"] == "+48600100200"
    assert voice_pipeline[0]["ward_name"] == "Pipeline ward"
    assert voice_pipeline[0]["scheduled_time"] == "12:00"
    assert voice_pipeline[0]["medications"]
    placing.place_task_call(task_id)
    assert len(voice_pipeline) == 1  # Worker replays must not dial twice.
    db.expire_all()
    call = db.exec(select(Call).where(Call.call_task_id == uuid.UUID(task_id))).one()
    headers = {"Authorization": "Bearer test-voice-token"}
    url = f"{settings.API_V1_STR}/internal/calls/{task_id}/events"
    event = {
        "event": "summary",
        "sid": call.twilio_call_sid,
        "medications": {"Test medication": 1},
        "transcript": "[09:00:01] AI: Have you taken it?\n[09:00:03] USER: Yes.",
        "notes": "Taken",
    }
    assert client.post(url, headers=headers, json=event).status_code == 200
    terminal = {
        "event": "terminal",
        "sid": call.twilio_call_sid,
        "status": "completed",
        "duration_sec": 34,
    }
    assert client.post(url, headers=headers, json=terminal).status_code == 200
    assert client.post(url, headers=headers, json=terminal).status_code == 200
    history = client.get(
        f"{settings.API_V1_STR}/wards/{ward_id}/calls",
        headers=normal_user_token_headers,
    ).json()
    assert history["count"] == 1
    assert history["data"][0]["result"]["outcome"] == "took"
    assert history["data"][0]["result"]["notes"] == "Taken"
    assert history["data"][0]["duration_sec"] == 34
    detail = client.get(
        f"{settings.API_V1_STR}/calls/{call.id}", headers=normal_user_token_headers
    )
    assert "USER: Yes" in detail.json()["result"]["transcript_full"]
    assert detail.json()["result"]["notes"] == "Taken"
    assert detail.json()["turns"][0]["speech_result"] == "Yes."
    db.expire_all()
    assert db.get(CallTask, uuid.UUID(task_id)).status == "completed"


def test_due_routine_is_dispatched_and_no_answer_retries_once(
    client: TestClient,
    db: Session,
    normal_user_token_headers,
    voice_pipeline,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "CALL_RETRY_DELAY_MIN", 7)
    _, routine = _routine(client, normal_user_token_headers, db)
    task = CallTask(
        routine_id=routine.id, scheduled_at=datetime.now(UTC) - timedelta(minutes=1)
    )
    db.add(task)
    db.commit()
    task_id = task.id
    tasks.dispatcher_tick.run()
    assert any(request["task_id"] == str(task_id) for request in voice_pipeline)
    db.expire_all()
    call = db.exec(select(Call).where(Call.call_task_id == task_id)).one()
    url = f"{settings.API_V1_STR}/internal/calls/{task_id}/events"
    event = {"event": "terminal", "sid": call.twilio_call_sid, "status": "no-answer"}
    headers = {"Authorization": "Bearer test-voice-token"}
    assert client.post(url, headers=headers, json=event).status_code == 200
    assert client.post(url, headers=headers, json=event).status_code == 200
    db.expire_all()
    retries = db.exec(
        select(CallTask).where(
            CallTask.routine_id == routine.id, CallTask.attempt_no == 2
        )
    ).all()
    assert len(retries) == 1
    assert retries[0].status == "pending"
    retry_delay = retries[0].scheduled_at.replace(tzinfo=UTC) - datetime.now(UTC)
    assert timedelta(minutes=6, seconds=50) < retry_delay <= timedelta(minutes=7)
    assert (
        db.exec(select(CallResult).where(CallResult.call_id == call.id)).one().outcome
        == "no_answer"
    )


def test_provider_events_require_authentication(client: TestClient) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/internal/calls/{uuid.uuid4()}/events",
        json={"event": "terminal", "sid": "CAfake", "status": "completed"},
    )
    assert response.status_code == 401


@pytest.mark.usefixtures("voice_pipeline")
def test_ambiguous_provider_timeout_does_not_redial(
    client: TestClient,
    db: Session,
    normal_user_token_headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, routine = _routine(client, normal_user_token_headers, db)
    task = CallTask(routine_id=routine.id, scheduled_at=datetime.now(UTC))
    db.add(task)
    db.commit()
    task_id = task.id

    def timeout(_url, **_kwargs):
        raise httpx.ReadTimeout("Provider response timed out")

    monkeypatch.setattr(placing.httpx, "post", timeout)
    with pytest.raises(httpx.ReadTimeout):
        placing.place_task_call(str(task_id))
    db.expire_all()
    assert db.get(CallTask, task_id).status == "failed"
    assert (
        len(db.exec(select(CallTask).where(CallTask.routine_id == routine.id)).all())
        == 1
    )
    placing.place_task_call(str(task_id))
    call = db.exec(select(Call).where(Call.call_task_id == task_id)).one()
    url = f"{settings.API_V1_STR}/internal/calls/{task_id}/events"
    headers = {"Authorization": "Bearer test-voice-token"}
    assert (
        client.post(
            url,
            headers=headers,
            json={"event": "summary", "sid": "CAlate", "medications": {"Medicine": 1}},
        ).status_code
        == 200
    )
    assert (
        client.post(
            url,
            headers=headers,
            json={"event": "terminal", "sid": "CAlate", "status": "completed"},
        ).status_code
        == 200
    )
    db.expire_all()
    assert db.get(Call, call.id).status == "completed"
    assert db.get(CallTask, task_id).status == "completed"


def test_approve_pause_and_resume_update_the_real_schedule(
    client: TestClient,
    db: Session,
    normal_user_token_headers,
) -> None:
    ward_id, routine = _routine(client, normal_user_token_headers, db)
    routine.status = "draft"
    db.add(routine)
    db.commit()
    routine_id = routine.id
    headers = normal_user_token_headers
    base = f"{settings.API_V1_STR}/routines/{routine_id}"
    assert client.post(f"{base}/approve", headers=headers).status_code == 200
    pending_url = f"{settings.API_V1_STR}/wards/{ward_id}/call-tasks?status=pending"
    assert client.get(pending_url, headers=headers).json()["count"] > 0
    assert client.post(f"{base}/pause", headers=headers).status_code == 200
    assert client.get(pending_url, headers=headers).json()["count"] == 0
    assert client.post(f"{base}/approve", headers=headers).status_code == 200
    assert client.get(pending_url, headers=headers).json()["count"] > 0
