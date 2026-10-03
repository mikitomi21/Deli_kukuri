import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.routine import (
    create_random_medication,
    create_random_routine,
)
from tests.utils.ward import create_random_ward

API = settings.API_V1_STR


def create_ward_via_api(
    client: TestClient, headers: dict[str, str], name: str = "Halina Kowalska"
) -> str:
    response = client.post(
        f"{API}/wards/",
        headers=headers,
        json={"full_name": name, "phone_e164": "+48600100200"},
    )
    assert response.status_code == 200
    return response.json()["id"]


def routine_payload(
    medication_ids: list[str],
    *,
    name: str = "Poranne leki",
    time_of_day: str = "09:00",
    days: str | None = "daily",
    depends_on: list[str] | None = None,
) -> dict:
    payload: dict = {
        "name": name,
        "time_of_day": time_of_day,
        "items": [
            {"medication_id": medication_id, "amount_label": "1"}
            for medication_id in medication_ids
        ],
    }
    if days is not None:
        payload["days"] = days
    if depends_on is not None:
        payload["depends_on"] = depends_on
    return payload


def create_routine_via_api(
    client: TestClient,
    headers: dict[str, str],
    ward_id: str,
    medication_ids: list[str],
    **kwargs,
) -> dict:
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=headers,
        json=routine_payload(medication_ids, **kwargs),
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_medication_via_factory(db: Session, count: int = 1) -> list[str]:
    return [str(create_random_medication(db).id) for _ in range(count)]


def test_create_routine_requires_auth(client: TestClient) -> None:
    response = client.post(
        f"{API}/wards/{uuid.uuid4()}/routines", json=routine_payload([])
    )
    assert response.status_code == 401


def test_create_routine_draft_with_items(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    medication_ids = create_medication_via_factory(db, 2)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=normal_user_token_headers,
        json=routine_payload(medication_ids),
    )
    assert response.status_code == 200
    content = response.json()
    assert content["status"] == "draft"
    assert content["name"] == "Poranne leki"
    assert content["time_of_day"] == "09:00:00"
    assert content["days"] == "daily"
    assert content["ward_id"] == ward_id
    assert len(content["items"]) == 2
    for item, medication_id in zip(content["items"], medication_ids, strict=True):
        assert item["medication_id"] == medication_id
        assert item["amount_label"] == "1"
        assert item["medication"]["id"] == medication_id
        assert item["medication"]["dosage"] == "5 mg"
    assert content["depends_on"] == []


def test_create_routine_negative_amount_rejected(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    medication_ids = create_medication_via_factory(db, 1)
    payload = routine_payload(medication_ids)
    payload["items"][0]["amount_label"] = "-1"
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=normal_user_token_headers,
        json=payload,
    )
    assert response.status_code == 422


def test_create_routine_without_items_is_draft(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    # C2: rutyna bez leków zapisuje się jako draft, ale nie może zostać zatwierdzona
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=normal_user_token_headers,
        json=routine_payload([]),
    )
    assert response.status_code == 200
    content = response.json()
    assert content["status"] == "draft"
    assert content["items"] == []


def test_create_routine_with_dependency(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    # C3: „Wieczór 19:00" wymaga „Rano 9:00"
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    medication_ids = create_medication_via_factory(db, 1)
    morning = create_routine_via_api(
        client, normal_user_token_headers, ward_id, medication_ids, name="Rano"
    )
    evening = create_routine_via_api(
        client,
        normal_user_token_headers,
        ward_id,
        medication_ids,
        name="Wieczór",
        time_of_day="19:00",
        depends_on=[morning["id"]],
    )
    assert len(evening["depends_on"]) == 1
    dependency = evening["depends_on"][0]
    assert dependency["id"] == morning["id"]
    assert dependency["name"] == "Rano"
    assert dependency["status"] == "draft"


def test_create_routine_on_foreign_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward = create_random_ward(db)
    medication_ids = create_medication_via_factory(db, 1)
    response = client.post(
        f"{API}/wards/{ward.id}/routines",
        headers=normal_user_token_headers,
        json=routine_payload(medication_ids),
    )
    assert response.status_code == 404


def test_create_routine_unknown_medication_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=normal_user_token_headers,
        json=routine_payload([str(uuid.uuid4())]),
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Medication not found"


def test_create_routine_unknown_dependency_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    medication_ids = create_medication_via_factory(db, 1)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=normal_user_token_headers,
        json=routine_payload(medication_ids, depends_on=[str(uuid.uuid4())]),
    )
    assert response.status_code == 404


def test_create_routine_dependency_of_other_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    other_ward_id = create_ward_via_api(client, headers, name="Drugi podopieczny")
    medication_ids = create_medication_via_factory(db, 1)
    other_ward_routine = create_routine_via_api(
        client, headers, other_ward_id, medication_ids
    )
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=headers,
        json=routine_payload(medication_ids, depends_on=[other_ward_routine["id"]]),
    )
    assert response.status_code == 404


def test_create_routine_foreign_dependency_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    # Rutyna wymagała rutyny cudzego podopiecznego = 404 (nie ujawniamy istnienia)
    headers = normal_user_token_headers
    foreign_ward = create_random_ward(db)
    medications = [create_random_medication(db)]
    foreign_routine = create_random_routine(
        db, ward=foreign_ward, medications=medications
    )
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=headers,
        json=routine_payload(medication_ids, depends_on=[str(foreign_routine.id)]),
    )
    assert response.status_code == 404


def test_create_routine_invalid_days_returns_422(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    for days in ["PON", "daily,MO", "MO,", "codziennie"]:
        response = client.post(
            f"{API}/wards/{ward_id}/routines",
            headers=normal_user_token_headers,
            json=routine_payload([], days=days),
        )
        assert response.status_code == 422, days


def test_create_routine_invalid_time_returns_422(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    response = client.post(
        f"{API}/wards/{ward_id}/routines",
        headers=normal_user_token_headers,
        json=routine_payload([], time_of_day="25:00"),
    )
    assert response.status_code == 422


def test_read_routines_for_ward(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 2)
    first = create_routine_via_api(
        client, headers, ward_id, medication_ids[:1], name="Rano", time_of_day="09:00"
    )
    second = create_routine_via_api(
        client,
        headers,
        ward_id,
        medication_ids[1:],
        name="Wieczór",
        time_of_day="19:00",
    )
    response = client.get(f"{API}/wards/{ward_id}/routines", headers=headers)
    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 2
    # posortowane po godzinie
    assert [routine["id"] for routine in content["data"]] == [first["id"], second["id"]]
    assert content["data"][0]["items"][0]["medication"]["id"] == medication_ids[0]


def test_read_routines_empty_ward(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    ward_id = create_ward_via_api(client, normal_user_token_headers)
    response = client.get(
        f"{API}/wards/{ward_id}/routines", headers=normal_user_token_headers
    )
    assert response.status_code == 200
    assert response.json() == {"data": [], "count": 0}


def test_read_routines_foreign_ward_returns_404(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    ward = create_random_ward(db)
    response = client.get(
        f"{API}/wards/{ward.id}/routines", headers=normal_user_token_headers
    )
    assert response.status_code == 404


def test_patch_routine_updates_fields(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    response = client.patch(
        f"{API}/routines/{routine['id']}",
        headers=headers,
        json={"name": "Wieczorne leki", "time_of_day": "21:30", "days": "MO,TU"},
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == "Wieczorne leki"
    assert content["time_of_day"] == "21:30:00"
    assert content["days"] == "MO,TU"


def test_patch_approved_routine_resets_to_draft(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    # C4/D10: edycja approved rutyny wraca do draft
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    response = client.post(f"{API}/routines/{routine['id']}/approve", headers=headers)
    assert response.status_code == 200
    response = client.patch(
        f"{API}/routines/{routine['id']}",
        headers=headers,
        json={"name": "Zmieniona rutyna"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "draft"


def test_patch_routine_replaces_items(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 2)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    response = client.patch(
        f"{API}/routines/{routine['id']}",
        headers=headers,
        json={
            "items": [
                {"medication_id": medication_ids[0], "amount_label": "2"}
            ]
        },
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["medication_id"] == medication_ids[0]
    assert items[0]["amount_label"] == "2"


def test_patch_routine_invalid_medication_404_keeps_old_items(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    response = client.patch(
        f"{API}/routines/{routine['id']}",
        headers=headers,
        json={
            "items": [
                {"medication_id": str(uuid.uuid4()), "amount_label": "1"}
            ]
        },
    )
    assert response.status_code == 404
    response = client.get(f"{API}/wards/{ward_id}/routines", headers=headers)
    assert response.json()["data"][0]["items"][0]["medication_id"] == medication_ids[0]


def test_patch_routine_self_dependency_returns_409(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    response = client.patch(
        f"{API}/routines/{routine['id']}",
        headers=headers,
        json={"depends_on": [routine["id"]]},
    )
    assert response.status_code == 409


def test_patch_routine_replaces_dependencies(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    morning = create_routine_via_api(
        client, headers, ward_id, medication_ids, name="Rano"
    )
    noon = create_routine_via_api(
        client, headers, ward_id, medication_ids, name="Południe", time_of_day="13:00"
    )
    evening = create_routine_via_api(
        client,
        headers,
        ward_id,
        medication_ids,
        name="Wieczór",
        time_of_day="19:00",
        depends_on=[morning["id"]],
    )
    response = client.patch(
        f"{API}/routines/{evening['id']}",
        headers=headers,
        json={"depends_on": [noon["id"]]},
    )
    assert response.status_code == 200
    depends_on = response.json()["depends_on"]
    assert [dependency["id"] for dependency in depends_on] == [noon["id"]]


def test_patch_routine_deduplicates_dependencies(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    morning = create_routine_via_api(
        client, headers, ward_id, medication_ids, name="Rano"
    )
    evening = create_routine_via_api(
        client, headers, ward_id, medication_ids, name="Wieczór", time_of_day="19:00"
    )
    response = client.patch(
        f"{API}/routines/{evening['id']}",
        headers=headers,
        json={"depends_on": [morning["id"], morning["id"]]},
    )
    assert response.status_code == 200
    assert len(response.json()["depends_on"]) == 1


def test_patch_empty_payload_keeps_status(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    client.post(f"{API}/routines/{routine['id']}/approve", headers=headers)
    response = client.patch(f"{API}/routines/{routine['id']}", headers=headers, json={})
    assert response.status_code == 200
    assert response.json()["status"] == "approved"


def test_delete_draft_routine(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    response = client.delete(f"{API}/routines/{routine['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Routine deleted successfully"
    response = client.get(f"{API}/wards/{ward_id}/routines", headers=headers)
    assert response.json()["count"] == 0


def test_delete_routine_cleans_up_dependency_edges(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    # Usunięcie wymaganego draftu czyści krawędź zależności u zależnego
    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    morning = create_routine_via_api(
        client, headers, ward_id, medication_ids, name="Rano"
    )
    evening = create_routine_via_api(
        client,
        headers,
        ward_id,
        medication_ids,
        name="Wieczór",
        time_of_day="19:00",
        depends_on=[morning["id"]],
    )
    response = client.delete(f"{API}/routines/{morning['id']}", headers=headers)
    assert response.status_code == 200
    response = client.get(f"{API}/wards/{ward_id}/routines", headers=headers)
    evening_data = next(r for r in response.json()["data"] if r["id"] == evening["id"])
    assert evening_data["depends_on"] == []


def test_delete_approved_routine_cascades_call_tasks(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    # Product decision: any routine can be deleted; its persisted call tasks
    # cascade via FK ondelete=CASCADE (docs/03-data-model.md)
    from app.models import CallTask

    headers = normal_user_token_headers
    ward_id = create_ward_via_api(client, headers)
    medication_ids = create_medication_via_factory(db, 1)
    routine = create_routine_via_api(client, headers, ward_id, medication_ids)
    client.post(f"{API}/routines/{routine['id']}/approve", headers=headers)
    task = CallTask(
        routine_id=routine["id"], scheduled_at=datetime.now(UTC)
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    response = client.delete(f"{API}/routines/{routine['id']}", headers=headers)
    assert response.status_code == 200
    # the API session performed a bulk SQL delete; refresh this session's
    # identity map before checking the cascade
    db.expire_all()
    remaining = db.exec(
        select(func.count()).select_from(CallTask).where(CallTask.id == task.id)
    ).one()
    assert remaining == 0
