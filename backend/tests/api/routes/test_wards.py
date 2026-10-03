import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Medication
from tests.utils.ward import create_random_ward

API = settings.API_V1_STR


def _create_ward(headers: dict[str, str], client: TestClient) -> str:
    response = client.post(
        f"{API}/wards/",
        headers=headers,
        json={"full_name": "Halina Kowalska", "phone_e164": "+48600100200"},
    )
    assert response.status_code == 200
    return response.json()["id"]


def _create_approved_routine(
    client: TestClient,
    headers: dict[str, str],
    db: Session,
    ward_id: str,
    *,
    time_of_day: str = "09:00",
    days: str = "daily",
    status: str = "approved",
) -> str:
    medication = Medication(name=f"Test med {uuid.uuid4()}", dosage="5 mg")
    db.add(medication)
    db.commit()
    db.refresh(medication)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=headers,
        json={
            "name": f"Rutyna {time_of_day}",
            "time_of_day": time_of_day,
            "days": days,
            "items": [
                {"medication_id": str(medication.id), "amount_label": "1"}
            ],
        },
    )
    assert response.status_code == 200
    routine_id = response.json()["id"]
    if status == "approved":
        response = client.post(
            f"{API}/routines/{routine_id}/approve", headers=headers
        )
        assert response.status_code == 200
    return routine_id


def test_create_ward(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    data = {
        "full_name": "Halina Kowalska",
        "phone_e164": "+48600100200",
        "tz": "Europe/Warsaw",
    }
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["full_name"] == data["full_name"]
    assert content["phone_e164"] == data["phone_e164"]
    assert content["tz"] == data["tz"]
    assert content["active"] is True
    assert "id" in content
    assert "caregiver_id" in content


def test_create_ward_default_timezone(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Jan Kowalski", "phone_e164": "+48600100201"},
    )
    assert response.status_code == 200
    assert response.json()["tz"] == "Europe/Warsaw"


def test_create_ward_invalid_phone_rejected(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    for phone in ["600100200", "+48", "+0600100200", "48600100200"]:
        response = client.post(
            f"{settings.API_V1_STR}/wards/",
            headers=normal_user_token_headers,
            json={"full_name": "Halina Kowalska", "phone_e164": phone},
        )
        assert response.status_code == 422, phone


def test_read_wards_returns_only_own_wards(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    create_random_ward(db)  # cudzy podopieczny
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Mój podopieczny", "phone_e164": "+48600100202"},
    )
    assert response.status_code == 200
    my_ward_id = response.json()["id"]

    response = client.get(
        f"{settings.API_V1_STR}/wards/", headers=normal_user_token_headers
    )
    assert response.status_code == 200
    content = response.json()
    assert content["count"] >= 1
    assert my_ward_id in [ward["id"] for ward in content["data"]]


def test_read_ward(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Halina Kowalska", "phone_e164": "+48600100200"},
    )
    ward_id = response.json()["id"]
    response = client.get(
        f"{settings.API_V1_STR}/wards/{ward_id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["id"] == ward_id
    assert content["full_name"] == "Halina Kowalska"


def test_read_ward_not_found(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/wards/{uuid.uuid4()}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Ward not found"


def test_read_foreign_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    # Obcy podopieczny = 404, nie ujawniamy istnienia cudzych zasobów (docs/05)
    ward = create_random_ward(db)
    response = client.get(
        f"{settings.API_V1_STR}/wards/{ward.id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404


def test_update_ward(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Halina Kowalska", "phone_e164": "+48600100200"},
    )
    ward_id = response.json()["id"]
    response = client.patch(
        f"{settings.API_V1_STR}/wards/{ward_id}",
        headers=normal_user_token_headers,
        json={"full_name": "Halina Nowak", "phone_e164": "+48600100999"},
    )
    assert response.status_code == 200
    content = response.json()
    assert content["full_name"] == "Halina Nowak"
    assert content["phone_e164"] == "+48600100999"
    assert content["tz"] == "Europe/Warsaw"


def test_update_ward_invalid_phone_rejected(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Halina Kowalska", "phone_e164": "+48600100200"},
    )
    ward_id = response.json()["id"]
    response = client.patch(
        f"{settings.API_V1_STR}/wards/{ward_id}",
        headers=normal_user_token_headers,
        json={"phone_e164": "not-a-phone"},
    )
    assert response.status_code == 422


def test_update_foreign_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward = create_random_ward(db)
    response = client.patch(
        f"{settings.API_V1_STR}/wards/{ward.id}",
        headers=normal_user_token_headers,
        json={"full_name": "Hijack"},
    )
    assert response.status_code == 404


def test_delete_ward_permanently_removes(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Halina Kowalska", "phone_e164": "+48600100200"},
    )
    ward_id = response.json()["id"]
    response = client.delete(
        f"{settings.API_V1_STR}/wards/{ward_id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Ward deleted successfully"

    # Hard delete: the ward is gone, not just deactivated
    response = client.get(
        f"{settings.API_V1_STR}/wards/{ward_id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404

    response = client.get(
        f"{settings.API_V1_STR}/wards/", headers=normal_user_token_headers
    )
    assert ward_id not in [ward["id"] for ward in response.json()["data"]]


def test_create_ward_blank_name_rejected(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "   ", "phone_e164": "+48600100200"},
    )
    assert response.status_code == 422


def test_create_ward_invalid_timezone_rejected(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/wards/",
        headers=normal_user_token_headers,
        json={
            "full_name": "Halina Kowalska",
            "phone_e164": "+48600100200",
            "tz": "Mars/Olympus",
        },
    )
    assert response.status_code == 422


def test_delete_foreign_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward = create_random_ward(db)
    response = client.delete(
        f"{settings.API_V1_STR}/wards/{ward.id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404


def test_superuser_can_read_foreign_ward(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    ward = create_random_ward(db)
    response = client.get(
        f"{settings.API_V1_STR}/wards/{ward.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(ward.id)


def test_update_ward_null_field_rejected(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    # Jawne null-e w PATCH to błąd klienta: 422, a nie 500 z NOT NULL
    response = client.post(
        f"{API}/wards/",
        headers=normal_user_token_headers,
        json={"full_name": "Halina Kowalska", "phone_e164": "+48600100200"},
    )
    ward_id = response.json()["id"]
    for payload in [{"full_name": None}, {"phone_e164": None}, {"tz": None}]:
        response = client.patch(
            f"{API}/wards/{ward_id}",
            headers=normal_user_token_headers,
            json=payload,
        )
        assert response.status_code == 422, payload


def test_call_tasks_schedules_approved_routines(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_ward(normal_user_token_headers, client)
    routine_id = _create_approved_routine(
        client, normal_user_token_headers, db, ward_id
    )
    now = datetime.now(UTC)

    response = client.get(
        f"{API}/wards/{ward_id}/call-tasks",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 1
    task = content["data"][0]
    assert task["routine_id"] == routine_id
    assert task["ward_id"] == ward_id
    assert task["status"] == "pending"
    assert task["attempt_no"] == 1
    scheduled_at = datetime.fromisoformat(task["scheduled_at"])
    assert scheduled_at > now
    # 09:00 Europe/Warsaw = 07:00 or 08:00 UTC depending on DST
    local = scheduled_at.astimezone(ZoneInfo("Europe/Warsaw"))
    assert (local.hour, local.minute) == (9, 0)


def test_call_tasks_skip_draft_and_paused(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_ward(normal_user_token_headers, client)
    _create_approved_routine(
        client, normal_user_token_headers, db, ward_id
    )
    _create_approved_routine(
        client, normal_user_token_headers, db, ward_id,
        time_of_day="10:00", status="draft",
    )
    paused_id = _create_approved_routine(
        client, normal_user_token_headers, db, ward_id, time_of_day="11:00"
    )
    response = client.post(
        f"{API}/routines/{paused_id}/pause", headers=normal_user_token_headers
    )
    assert response.status_code == 200

    response = client.get(
        f"{API}/wards/{ward_id}/call-tasks",
        headers=normal_user_token_headers,
    )
    content = response.json()
    assert content["count"] == 1
    assert content["data"][0]["routine_name"].startswith("Rutyna 09:00")


def test_call_tasks_respect_weekly_days_mask(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_ward(normal_user_token_headers, client)
    # All seven weekdays = daily equivalent, but exercises the mask parser
    _create_approved_routine(
        client, normal_user_token_headers, db, ward_id,
        days="MO,TU,WE,TH,FR,SA,SU",
    )
    response = client.get(
        f"{API}/wards/{ward_id}/call-tasks",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["count"] == 1
    scheduled_at = datetime.fromisoformat(response.json()["data"][0]["scheduled_at"])
    assert datetime.now(UTC) < scheduled_at <= datetime.now(UTC) + timedelta(days=7)


def test_call_tasks_status_filter(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
    db: Session,
) -> None:
    ward_id = _create_ward(normal_user_token_headers, client)
    _create_approved_routine(client, normal_user_token_headers, db, ward_id)
    response = client.get(
        f"{API}/wards/{ward_id}/call-tasks?status=completed",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["count"] == 0


def test_call_tasks_empty_for_ward_without_routines(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    ward_id = _create_ward(normal_user_token_headers, client)
    response = client.get(
        f"{API}/wards/{ward_id}/call-tasks",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["count"] == 0


def test_call_tasks_foreign_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward = create_random_ward(db)
    response = client.get(
        f"{API}/wards/{ward.id}/call-tasks",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404
