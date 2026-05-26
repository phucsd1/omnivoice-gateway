import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["APP_ENV"] = "testing"
os.environ["WORKER_MODE"] = "mock"
os.environ["DATABASE_URL"] = "sqlite:///./test_db.sqlite"
os.environ["WORKER_TOKEN"] = "test_secret_token"


from app.main import app
from app.database import Base, get_db, engine
from app.services.job_service import JobService

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    # Create tables
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    try:
        if os.path.exists("test_db.sqlite"):
            os.remove("test_db.sqlite")
    except Exception:
        pass



def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "OmniVoice" in data["app"]

def test_internal_worker_security():
    # Test register without token -> 401 or 403
    response = client.post("/v1/internal/workers/register", json={
        "worker_id": "test_worker",
        "status": "ready"
    })
    assert response.status_code == 403 or response.status_code == 401

    # Test register with invalid token -> 401
    headers = {"Authorization": "Bearer bad_token"}
    response = client.post("/v1/internal/workers/register", json={
        "worker_id": "test_worker",
        "status": "ready"
    }, headers=headers)
    assert response.status_code == 401

    # Test register with valid token -> 200
    headers = {"Authorization": "Bearer test_secret_token"}
    response = client.post("/v1/internal/workers/register", json={
        "worker_id": "test_worker",
        "status": "ready"
    }, headers=headers)
    assert response.status_code == 200

def test_vietnamese_mapping_instructs():
    # Test feminie mappings
    mapping = JobService.map_vietnamese_request_to_instruct("Giọng nữ trẻ, trầm ấm tự nhiên")
    assert "female" in mapping
    assert "young adult" in mapping
    assert "low pitch" in mapping

    # Test masculine mappings
    mapping = JobService.map_vietnamese_request_to_instruct("Giọng nam cao, nhẹ nhàng")
    assert "male" in mapping
    assert "high pitch" in mapping
    assert "whisper" in mapping

def test_kaggle_notebook_builder(tmp_path):
    from app.services.kaggle_notebook_builder import KaggleNotebookBuilder
    import json
    
    # Setup temp worker dir
    worker_dir = str(tmp_path / "kaggle_worker")
    
    # Test ensure_worker_dir
    abs_path = KaggleNotebookBuilder.ensure_worker_dir(worker_dir)
    assert os.path.exists(abs_path)
    
    # Test generate_metadata
    metadata_path = KaggleNotebookBuilder.generate_metadata(abs_path, "username", "slug", "title")
    assert os.path.exists(metadata_path)
    with open(metadata_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["id"] == "username/slug"
    assert data["title"] == "title"
    assert data["code_file"] == "worker.py"
    
    # Test generate_requirements
    req_path = KaggleNotebookBuilder.generate_requirements(abs_path)
    assert os.path.exists(req_path)
    with open(req_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "omnivoice" in content
    
    # Test generate_worker_code
    worker_path = KaggleNotebookBuilder.generate_worker_code(abs_path)
    assert os.path.exists(worker_path)
    with open(worker_path, "r", encoding="utf-8") as f:
        code = f.read()
    assert "ensure_dependencies()" in code

