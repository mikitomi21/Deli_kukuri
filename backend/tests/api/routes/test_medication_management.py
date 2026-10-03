from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.routine import create_random_medication, create_random_routine
from tests.utils.ward import create_random_ward


def test_superuser_updates_and_deletes_unreferenced_medication(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    medication = create_random_medication(db)
    url = f"{settings.API_V1_STR}/medications/{medication.id}"
    response = client.patch(
        url, headers=superuser_token_headers, json={"dosage": "10 mg"}
    )
    assert response.status_code == 200
    assert response.json()["dosage"] == "10 mg"
    assert client.get(url, headers=superuser_token_headers).json()["dosage"] == "10 mg"
    assert client.delete(url, headers=superuser_token_headers).status_code == 200
    assert client.get(url, headers=superuser_token_headers).status_code == 404


def test_caregiver_cannot_modify_shared_medications(
    client: TestClient, db: Session, normal_user_token_headers: dict[str, str]
) -> None:
    medication = create_random_medication(db)
    url = f"{settings.API_V1_STR}/medications/{medication.id}"
    assert (
        client.patch(
            url, headers=normal_user_token_headers, json={"dosage": "10 mg"}
        ).status_code
        == 403
    )
    assert client.delete(url, headers=normal_user_token_headers).status_code == 403


def test_duplicate_edit_and_referenced_delete_preserve_routine_medication(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    medication = create_random_medication(db)
    other = create_random_medication(db)
    ward = create_random_ward(db)
    create_random_routine(db, ward=ward, medications=[medication])
    url = f"{settings.API_V1_STR}/medications/{medication.id}"
    duplicate = client.patch(
        url,
        headers=superuser_token_headers,
        json={"name": other.name, "dosage": other.dosage},
    )
    assert duplicate.status_code == 409
    assert client.delete(url, headers=superuser_token_headers).status_code == 409
    assert (
        client.get(url, headers=superuser_token_headers).json()["name"]
        == medication.name
    )
