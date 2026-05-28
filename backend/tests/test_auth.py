import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["APP_ENV"] = "testing"
os.environ["WORKER_MODE"] = "mock"
os.environ["DATABASE_URL"] = "sqlite:///./test_auth_db.sqlite"
os.environ["WORKER_TOKEN"] = "test_secret_token"

from app.main import app
from app.database import Base, engine, get_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    try:
        if os.path.exists("test_auth_db.sqlite"):
            os.remove("test_auth_db.sqlite")
    except Exception:
        pass

def test_auth_flow():
    # 1. Register a user
    response = client.post("/v1/auth/register", json={
        "username": "auth_test_user",
        "password": "strong_password_123"
    })
    assert response.status_code == 201
    assert response.json()["status"] == "success"

    # 2. Register same user -> should fail (400)
    response = client.post("/v1/auth/register", json={
        "username": "auth_test_user",
        "password": "strong_password_123"
    })
    assert response.status_code == 400

    # 3. Login with wrong password -> should fail (401)
    response = client.post("/v1/auth/login", json={
        "username": "auth_test_user",
        "password": "wrong_password"
    })
    assert response.status_code == 401

    # 4. Login successfully
    response = client.post("/v1/auth/login", json={
        "username": "auth_test_user",
        "password": "strong_password_123"
    })
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # 5. Get current profile
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/v1/auth/me", headers=headers)
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["username"] == "auth_test_user"
    assert user_data["has_api_key"] is True  # Auto-generated on registration
    initial_api_key = user_data["api_key"]
    assert initial_api_key is not None

    # 6. Generate new API key
    response = client.post("/v1/auth/apikey", headers=headers)
    assert response.status_code == 200
    new_key_data = response.json()
    assert new_key_data["status"] == "success"
    new_api_key = new_key_data["api_key"]
    assert new_api_key != initial_api_key

    # 7. Check profile again to see new key
    response = client.get("/v1/auth/me", headers=headers)
    user_data = response.json()
    assert user_data["api_key"] == new_api_key

    # 8. Test using API key to fetch user endpoint (should succeed)
    api_key_headers = {"Authorization": f"Bearer {new_api_key}"}
    response = client.get("/v1/jobs", headers=api_key_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

    # 9. Revoke API key
    response = client.delete("/v1/auth/apikey", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # 10. Check profile again -> has_api_key should be False, api_key should be None
    response = client.get("/v1/auth/me", headers=headers)
    user_data = response.json()
    assert user_data["has_api_key"] is False
    assert user_data["api_key"] is None

    # 11. Test using revoked API key (should fail 401)
    response = client.get("/v1/jobs", headers=api_key_headers)
    assert response.status_code == 401
