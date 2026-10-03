import uuid

from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_lower_string


def test_read_medications_requires_auth(client: TestClient) -> None:
    response = client.get(f"{settings.API_V1_STR}/medications/")
    assert response.status_code == 401


def test_read_medications_seeded_catalog(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    # Katalog zasilany seedem przy starcie aplikacji (20–50 leków, docs/05)
    response = client.get(
        f"{settings.API_V1_STR}/medications/",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    # >= 20 seeded meds (docs/05); the shared dev DB also accumulates meds
    # created by other tests, so no upper bound here
    assert content["count"] >= 20
    assert len(content["data"]) == content["count"]
    for medication in content["data"]:
        assert "id" in medication
        assert medication["name"]
        assert medication["dosage"]


def test_search_medications_by_name_ilike(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/medications/",
        params={"q": "aspi"},
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["count"] >= 1
    for medication in content["data"]:
        assert "aspi" in medication["name"].lower()


def test_search_medications_case_insensitive(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/medications/",
        headers=normal_user_token_headers,
    )
    medications = response.json()["data"]
    assert medications

    name = medications[0]["name"]
    response_lower = client.get(
        f"{settings.API_V1_STR}/medications/",
        params={"q": name.lower()},
        headers=normal_user_token_headers,
    )
    response_upper = client.get(
        f"{settings.API_V1_STR}/medications/",
        params={"q": name.upper()},
        headers=normal_user_token_headers,
    )
    assert response_lower.status_code == 200
    assert response_upper.status_code == 200
    count_lower = response_lower.json()["count"]
    count_upper = response_upper.json()["count"]
    assert count_lower >= 1
    assert count_lower == count_upper


def test_search_medications_no_match(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/medications/",
        params={"q": random_lower_string()},
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 0
    assert content["data"] == []


def test_read_medication(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/medications/",
        headers=normal_user_token_headers,
    )
    medications = response.json()["data"]
    assert medications

    medication_id = medications[0]["id"]
    response = client.get(
        f"{settings.API_V1_STR}/medications/{medication_id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["id"] == medication_id
    assert content["name"] == medications[0]["name"]
    assert content["dosage"] == medications[0]["dosage"]


def test_read_medication_not_found(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/medications/{uuid.uuid4()}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Medication not found"
