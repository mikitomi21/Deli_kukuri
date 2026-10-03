import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token


@pytest.mark.parametrize("path", ["/users/me", "/wards/"])
def test_deleted_user_session_requires_authentication(
    client: TestClient, path: str
) -> None:
    token = create_access_token(uuid.uuid4(), expires_delta=timedelta(minutes=5))
    response = client.get(
        f"{settings.API_V1_STR}{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
