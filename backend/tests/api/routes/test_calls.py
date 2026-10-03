import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.routes import calls
from app.core.config import settings
from app.models import Routine, RoutineItem
from tests.utils.routine import create_random_medication
from tests.utils.ward import create_random_ward

API = settings.API_V1_STR


@pytest.fixture(autouse=True)
def mock_voice_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calls, "voice_provider_ready", lambda: True)
    monkeypatch.setattr(calls.place_call, "delay", lambda task_id: None)


def _create_owned_ward(client: TestClient, headers: dict[str, str]) -> uuid.UUID:
    response = client.post(
        f"{API}/wards/",
        headers=headers,
        json={"full_name": "Call test ward", "phone_e164": "+48600100200"},
    )
    assert response.status_code == 200, response.text
    return uuid.UUID(response.json()["id"])


def _create_approved_routine(db: Session, ward_id: uuid.UUID) -> Routine:
    medication = create_random_medication(db)
    routine = Routine(
        ward_id=ward_id,
        name="Call test routine",
        time_of_day="09:00",
        status="approved",
    )
    db.add(routine)
    db.flush()
    db.add(
        RoutineItem(
            routine_id=routine.id,
            medication_id=medication.id,
            amount_label="1 tablet",
        )
    )
    db.commit()
    db.refresh(routine)
    return routine


def test_test_call_creates_immediate_task(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_owned_ward(client, normal_user_token_headers)
    routine = _create_approved_routine(db, ward_id)

    response = client.post(
        f"{API}/wards/{ward_id}/test-call",
        headers=normal_user_token_headers,
        params={"routine_id": str(routine.id)},
    )

    assert response.status_code == 201, response.text
    task = response.json()
    assert task["routine_id"] == str(routine.id)
    assert task["status"] == "pending"
    assert task["attempt_no"] == 1
    assert task["scheduled_at"]


def test_test_call_requires_approved_routine(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    ward_id = _create_owned_ward(client, normal_user_token_headers)

    response = client.post(
        f"{API}/wards/{ward_id}/test-call", headers=normal_user_token_headers
    )

    assert response.status_code == 409


def test_test_call_rejects_routine_from_another_ward(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_owned_ward(client, normal_user_token_headers)
    other_ward = create_random_ward(db)
    routine = _create_approved_routine(db, other_ward.id)

    response = client.post(
        f"{API}/wards/{ward_id}/test-call",
        headers=normal_user_token_headers,
        params={"routine_id": str(routine.id)},
    )

    assert response.status_code == 409


def test_call_task_list_is_scoped_to_ward(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_owned_ward(client, normal_user_token_headers)
    routine = _create_approved_routine(db, ward_id)
    create_response = client.post(
        f"{API}/wards/{ward_id}/test-call",
        headers=normal_user_token_headers,
        params={"routine_id": str(routine.id)},
    )
    assert create_response.status_code == 201, create_response.text

    response = client.get(
        f"{API}/wards/{ward_id}/call-tasks",
        headers=normal_user_token_headers,
        params={"status": "pending"},
    )

    assert response.status_code == 200, response.text
    content = response.json()
    assert content["count"] == 1
    assert len(content["data"]) == 1
    assert content["data"][0]["routine_id"] == str(routine.id)


def test_calls_endpoints_hide_foreign_ward(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    foreign_ward = create_random_ward(db)

    response = client.post(
        f"{API}/wards/{foreign_ward.id}/test-call",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 404
