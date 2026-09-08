import os
import unittest.mock as mock
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import TTSJob, WorkerSession
from app.services.kaggle_orchestrator import KaggleOrchestrator

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    # Reset KaggleOrchestrator class states
    KaggleOrchestrator._boot_attempts.clear()
    KaggleOrchestrator._complete_grace_count.clear()
    KaggleOrchestrator._unknown_status_count.clear()
    KaggleOrchestrator._consecutive_poll_failures.clear()
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

def create_mock_job(db, job_id="test_job_1", status="starting_worker", worker_id="worker_1"):
    job = TTSJob(
        id=job_id,
        user_id="test_user",
        job_type="tts",
        text="Hello world test audio",
        status=status,
        worker_id=worker_id,
        message="Starting..."
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

@patch.object(KaggleOrchestrator, "get_credentials")
def test_poll_queued_status(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.QUEUED"'
        )
        KaggleOrchestrator._poll_booting_worker(db, job)
        db.refresh(job)

        assert job.status == "queued_kaggle"
        assert "xếp hàng" in job.message
        assert job.progress == 15

@patch.object(KaggleOrchestrator, "get_credentials")
def test_poll_running_status(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="queued_kaggle", worker_id="worker_1")

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.RUNNING"'
        )
        KaggleOrchestrator._poll_booting_worker(db, job)
        db.refresh(job)

        assert job.status == "starting_worker"
        assert "tải môi trường" in job.message
        assert job.progress == 25

@patch.object(KaggleOrchestrator, "get_credentials")
def test_poll_complete_grace_period(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.COMPLETE"'
        )
        
        # Check 1, 2, 3 should stay in starting_worker (grace period)
        for i in range(1, 4):
            KaggleOrchestrator._poll_booting_worker(db, job)
            db.refresh(job)
            assert job.status == "starting_worker"
            assert job.status != "failed"
            assert KaggleOrchestrator._complete_grace_count[job.id] == i

@patch.object(KaggleOrchestrator, "get_credentials")
def test_poll_complete_exceeds_grace_failover_to_worker_2(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    # Set grace count to 3 so next check (4th) exceeds grace
    KaggleOrchestrator._complete_grace_count[job.id] = 3

    with patch("subprocess.run") as mock_run, \
         patch.object(KaggleOrchestrator, "_trigger_daemon_worker") as mock_trigger:
        
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.COMPLETE"'
        )
        
        KaggleOrchestrator._poll_booting_worker(db, job)
        db.refresh(job)

        # Must NOT be failed!
        assert job.status != "failed"
        # Must failover to worker_2
        assert job.worker_id == "worker_2"
        # Must call trigger daemon worker for the new worker
        assert mock_trigger.called

@patch.object(KaggleOrchestrator, "get_credentials")
def test_poll_error_immediate_failover(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    with patch("subprocess.run") as mock_run, \
         patch.object(KaggleOrchestrator, "_trigger_daemon_worker") as mock_trigger:
        
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.ERROR"'
        )
        
        KaggleOrchestrator._poll_booting_worker(db, job)
        db.refresh(job)

        assert job.status != "failed"
        assert job.worker_id == "worker_2"
        assert mock_trigger.called

@patch.object(KaggleOrchestrator, "get_credentials")
def test_poll_cancelled_immediate_failover(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    with patch("subprocess.run") as mock_run, \
         patch.object(KaggleOrchestrator, "_trigger_daemon_worker") as mock_trigger:
        
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.CANCELLED"'
        )
        
        KaggleOrchestrator._poll_booting_worker(db, job)
        db.refresh(job)

        assert job.status != "failed"
        assert job.worker_id == "worker_2"
        assert mock_trigger.called

@patch.object(KaggleOrchestrator, "get_credentials")
def test_trigger_push_failure_failover(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    with patch("subprocess.Popen") as mock_popen, \
         patch("app.services.kaggle_notebook_builder.KaggleNotebookBuilder.prepare_all"):
        
        # Simulate CLI failure on push for worker_1, then success on worker_2
        process_fail = MagicMock()
        process_fail.communicate.return_value = ("", "Push rejected by Kaggle API")
        process_fail.returncode = 1

        process_success = MagicMock()
        process_success.communicate.return_value = ("Kernel pushed successfully", "")
        process_success.returncode = 0

        mock_popen.side_effect = [process_fail, process_success]

        KaggleOrchestrator._trigger_daemon_worker(db, job)
        db.refresh(job)

        # After failover, worker_id became worker_2 and status became queued_kaggle
        assert job.worker_id == "worker_2"
        assert job.status == "queued_kaggle"

@patch.object(KaggleOrchestrator, "get_credentials")
def test_max_boot_attempts_exhausted(mock_creds, db):
    mock_creds.return_value = ("testuser", "testkey", "testuser/omnivoice-worker-1", "/tmp/worker")
    job = create_mock_job(db, status="starting_worker", worker_id="worker_1")

    # Set boot attempts to 4 (max attempts reached)
    KaggleOrchestrator._boot_attempts[job.id] = 4

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='testuser/omnivoice-worker-1 has status "KernelWorkerStatus.ERROR"'
        )
        
        KaggleOrchestrator._poll_booting_worker(db, job)
        db.refresh(job)

        # Now it should be marked failed
        assert job.status == "failed"
        assert "Không thể khởi động Kaggle Worker sau nhiều lần thử" in job.message
        assert job.id not in KaggleOrchestrator._boot_attempts

def test_ensure_worker_running():
    # Should not raise exception
    KaggleOrchestrator.ensure_worker_running()
