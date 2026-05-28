import os
import pytest
from fastapi.testclient import TestClient

os.environ["APP_ENV"] = "testing"
os.environ["WORKER_MODE"] = "mock"
os.environ["DATABASE_URL"] = "sqlite:///./test_admin_db.sqlite"
os.environ["WORKER_TOKEN"] = "test_secret_token"

from app.main import app
from app.database import Base, engine

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    # Seed admin user manually for testing
    from app.database import SessionLocal
    from app.models import User
    from app.utils.auth import get_password_hash
    import secrets
    db = SessionLocal()
    hashed_pwd = get_password_hash("admin_password_2026")
    api_key = f"ovg_live_{secrets.token_hex(24)}"
    admin_user = User(
        id="usr_admin_test_123",
        username="admin",
        email="admin@omnivoice.local",
        hashed_password=hashed_pwd,
        is_verified=True,
        is_admin=True,
        api_key=api_key
    )
    db.add(admin_user)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    try:
        if os.path.exists("test_admin_db.sqlite"):
            os.remove("test_admin_db.sqlite")
    except Exception:
        pass

def test_admin_seeding_and_access():
    # 1. Login as default seeded admin
    login_res = client.post("/v1/auth/login", json={
        "username": "admin",
        "password": "admin_password_2026"
    })
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Verify admin profile
    me_res = client.get("/v1/auth/me", headers=admin_headers)
    assert me_res.status_code == 200
    assert me_res.json()["is_admin"] is True
    assert me_res.json()["is_verified"] is True

    # 2. Register a normal user and login
    reg_res = client.post("/v1/auth/register", json={
        "username": "normal_guy",
        "password": "password_123",
        "email": "normal@example.com"
    })
    assert reg_res.status_code == 201
    otp_code = reg_res.json()["debug_code"]

    # Verify normal user
    verify_res = client.post("/v1/auth/verify-email", json={
        "username": "normal_guy",
        "code": otp_code
    })
    assert verify_res.status_code == 200

    login_guy = client.post("/v1/auth/login", json={
        "username": "normal_guy",
        "password": "password_123"
    })
    guy_token = login_guy.json()["access_token"]
    guy_headers = {"Authorization": f"Bearer {guy_token}"}

    # 3. Test normal user blocked from admin endpoints -> 403
    stats_res = client.get("/v1/admin/stats", headers=guy_headers)
    assert stats_res.status_code == 403

    users_res = client.get("/v1/admin/users", headers=guy_headers)
    assert users_res.status_code == 403

    # 4. Test admin can access stats -> 200
    stats_res = client.get("/v1/admin/stats", headers=admin_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_users"] >= 2  # admin + normal_guy
    assert stats["verified_users"] >= 2

    # 5. Test admin can list users -> 200
    users_res = client.get("/v1/admin/users", headers=admin_headers)
    assert users_res.status_code == 200
    users = users_res.json()
    assert len(users) >= 2
    normal_user_obj = next(u for u in users if u["username"] == "normal_guy")
    assert normal_user_obj["is_admin"] is False

    # 6. Test middleware logging
    # Fire a generic api call that is loggable
    client.get("/v1/jobs", headers=guy_headers)

    # Check admin logs to see if that request got recorded
    logs_res = client.get("/v1/admin/logs", headers=admin_headers)
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) > 0
    # There should be a log record for /v1/jobs with normal_guy's username
    jobs_log = next((l for l in logs if l["endpoint"] == "/v1/jobs"), None)
    assert jobs_log is not None
    assert jobs_log["username"] == "normal_guy"
    assert jobs_log["method"] == "GET"

    # 7. Test admin update user
    update_res = client.put(f"/v1/admin/users/{normal_user_obj['id']}", json={
        "is_admin": True
    }, headers=admin_headers)
    assert update_res.status_code == 200
    assert update_res.json()["is_admin"] is True

    # 8. Test admin delete user
    del_res = client.delete(f"/v1/admin/users/{normal_user_obj['id']}", headers=admin_headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # Verify user is deleted
    users_res = client.get("/v1/admin/users", headers=admin_headers)
    assert not any(u["username"] == "normal_guy" for u in users_res.json())
