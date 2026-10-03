import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.ward import create_random_ward


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


def test_delete_ward_deactivates(
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
    assert response.json()["message"] == "Ward deactivated successfully"

    response = client.get(
        f"{settings.API_V1_STR}/wards/{ward_id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["active"] is False


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
