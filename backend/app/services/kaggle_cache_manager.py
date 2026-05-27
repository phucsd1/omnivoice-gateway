import os
import sys
import subprocess
import shutil
import json
import threading
from app.database import SessionLocal
from app.models import SystemSetting
from app.services.kaggle_orchestrator import KaggleOrchestrator

class KaggleCacheManager:
    _lock = threading.Lock()
    _is_running = False

    @classmethod
    def update_status(cls, value: str, message: str = "", progress: int = 0):
        db = SessionLocal()
        try:
            def save_setting(k, val):
                entry = db.query(SystemSetting).filter(SystemSetting.key == k).first()
                if not entry:
                    entry = SystemSetting(key=k, value=str(val))
                    db.add(entry)
                else:
                    entry.value = str(val)
            
            save_setting("kaggle_cache_status", value)
            if message:
                save_setting("kaggle_cache_message", message)
            save_setting("kaggle_cache_progress", progress)
            db.commit()
            print(f"[KaggleCacheManager] {value}: {message} ({progress}%)")
        except Exception as e:
            print(f"[KaggleCacheManager] Error saving status: {e}")
        finally:
            db.close()

    @classmethod
    def get_status(cls) -> dict:
        db = SessionLocal()
        try:
            status = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_cache_status").first()
            message = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_cache_message").first()
            progress = db.query(SystemSetting).filter(SystemSetting.key == "kaggle_cache_progress").first()
            
            return {
                "status": status.value if status else "idle",
                "message": message.value if message else "Chưa khởi tạo cache.",
                "progress": int(progress.value) if progress else 0
            }
        except Exception as e:
            return {"status": "error", "message": str(e), "progress": 0}
        finally:
            db.close()

    @classmethod
    def start_setup_cache(cls) -> bool:
        """Starts the setup cache process in a background thread."""
        with cls._lock:
            if cls._is_running:
                print("[KaggleCacheManager] Setup cache is already running.")
                return False
            cls._is_running = True
            
        thread = threading.Thread(target=cls._run_setup, daemon=True)
        thread.start()
        return True

    @classmethod
    def _run_setup(cls):
        try:
            cls._execute_setup()
        except Exception as e:
            import traceback
            error_details = f"{e}\n{traceback.format_exc()}"
            print(f"[KaggleCacheManager] Setup failed: {error_details}")
            cls.update_status("failed", f"Lỗi: {str(e)}", 100)
        finally:
            with cls._lock:
                cls._is_running = False

    @classmethod
    def _execute_setup(cls):
        cls.update_status("running", "Khởi động tiến trình đồng bộ Kaggle Cache...", 5)
        
        # 1. Load credentials
        username, key, _, _ = KaggleOrchestrator.get_credentials()
        if not username or not key:
            raise Exception("Chưa cấu hình Kaggle Username hoặc API Key. Vui lòng cập nhật cấu hình trước.")
            
        # Prepare environment for Kaggle CLI
        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = username
        env["KAGGLE_KEY"] = key
        env["PYTHONUTF8"] = "1"
        
        # Temp directories in backend/storage/temp_kaggle_cache
        from app.config import settings
        storage_dir = os.path.abspath(settings.STORAGE_DIR)
        temp_dir = os.path.join(storage_dir, "temp_kaggle_cache")
        os.makedirs(temp_dir, exist_ok=True)
        
        pip_dir = os.path.join(temp_dir, "omnivoice-pip-packages")
        model_dir = os.path.join(temp_dir, "omnivoice-model-weights")
        
        # ---------------------------------------------
        # STEP A: Create Pip Packages Cache Dataset
        # ---------------------------------------------
        cls.update_status("running", "Đang tải thư viện Python (wheels) cho OmniVoice...", 10)
        if os.path.exists(pip_dir):
            shutil.rmtree(pip_dir)
        os.makedirs(pip_dir, exist_ok=True)
        
        # Download wheels
        cmd_pip = [
            sys.executable, "-m", "pip", "download",
            "--dest", pip_dir,
            "--no-deps",
            "omnivoice", "hf-transfer"
        ]
        
        print(f"[KaggleCacheManager] Running pip download: {' '.join(cmd_pip)}")
        res_pip = subprocess.run(cmd_pip, capture_output=True, text=True)
        if res_pip.returncode != 0:
            raise Exception(f"Lỗi tải pip packages: {res_pip.stderr}")
            
        print("[KaggleCacheManager] Pip download success.")
        cls.update_status("running", "Tải pip packages hoàn tất. Đang chuẩn bị metadata cho Kaggle...", 25)
        
        # Write dataset-metadata.json
        pip_meta = {
            "title": "OmniVoice Pip Packages",
            "id": f"{username}/omnivoice-pip-packages",
            "licenses": [{"name": "CC0-1.0"}]
        }
        with open(os.path.join(pip_dir, "dataset-metadata.json"), "w") as f:
            json.dump(pip_meta, f, indent=2)
            
        cls.update_status("running", "Đang đẩy Pip Packages lên Kaggle Dataset...", 35)
        
        # Create or update Kaggle dataset for pip packages
        cls._upload_dataset_to_kaggle(pip_dir, env)
        cls.update_status("running", "Đẩy Pip Packages lên Kaggle thành công!", 45)
        
        # ---------------------------------------------
        # STEP B: Create Model Weights Cache Dataset
        # ---------------------------------------------
        cls.update_status("running", "Đang tải model weights OmniVoice từ Hugging Face (khoảng 3.25 GB)...", 50)
        if os.path.exists(model_dir):
            shutil.rmtree(model_dir)
        os.makedirs(model_dir, exist_ok=True)
        
        # Download model snapshot
        print("[KaggleCacheManager] Starting model snapshot download...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="k2-fsa/OmniVoice",
            local_dir=model_dir,
            local_dir_use_symlinks=False,
            ignore_patterns=[".git", ".gitattributes"]
        )
        print("[KaggleCacheManager] Model snapshot download success.")
        cls.update_status("running", "Tải model weights hoàn tất. Đang chuẩn bị metadata cho Kaggle...", 75)
        
        # Write dataset-metadata.json
        model_meta = {
            "title": "OmniVoice Model Weights",
            "id": f"{username}/omnivoice-model-weights",
            "licenses": [{"name": "CC0-1.0"}]
        }
        with open(os.path.join(model_dir, "dataset-metadata.json"), "w") as f:
            json.dump(model_meta, f, indent=2)
            
        cls.update_status("running", "Đang đẩy Model Weights lên Kaggle Dataset (khoảng 3.25 GB, quá trình này có thể mất vài phút)...", 80)
        
        # Create or update Kaggle dataset for model weights
        cls._upload_dataset_to_kaggle(model_dir, env)
        cls.update_status("running", "Đẩy Model Weights lên Kaggle thành công!", 95)
        
        # Clean up temp files to save space
        cls.update_status("running", "Đang dọn dẹp các tệp tạm thời...", 98)
        try:
            shutil.rmtree(temp_dir)
        except Exception as cleanup_err:
            print(f"[KaggleCacheManager] Error during cleanup: {cleanup_err}")
            
        cls.update_status("success", "Hoàn tất đồng bộ Kaggle Cache! Kaggle Worker của bạn sẽ tự động chạy ở chế độ offline siêu tốc.", 100)

    @classmethod
    def _upload_dataset_to_kaggle(cls, folder: str, env: dict):
        # We try to create the dataset first. If it already exists, we update it.
        # Run using python cli module to avoid PATH lookup issues
        cmd_create = [
            sys.executable, "-c", "from kaggle.cli import main; main()",
            "datasets", "create", "-p", folder, "-r", "zip"
        ]
        
        print(f"[KaggleCacheManager] Running dataset create: {' '.join(cmd_create)}")
        res_create = subprocess.run(cmd_create, capture_output=True, text=True, env=env)
        
        if res_create.returncode != 0:
            output_msg = res_create.stderr + "\n" + res_create.stdout
            print(f"[KaggleCacheManager] Dataset create output: {output_msg}")
            
            if "already exists" in output_msg.lower() or "duplicate" in output_msg.lower() or "403" in output_msg:
                # Try to create a new version instead
                cmd_version = [
                    sys.executable, "-c", "from kaggle.cli import main; main()",
                    "datasets", "version", "-p", folder, "-m", "Auto-update cache", "-r", "zip"
                ]
                print(f"[KaggleCacheManager] Running dataset version: {' '.join(cmd_version)}")
                res_version = subprocess.run(cmd_version, capture_output=True, text=True, env=env)
                
                if res_version.returncode != 0:
                    raise Exception(f"Lỗi cập nhật dataset Kaggle: {res_version.stderr or res_version.stdout}")
                print("[KaggleCacheManager] Dataset version update success.")
            else:
                raise Exception(f"Lỗi tạo dataset Kaggle: {res_create.stderr or res_create.stdout}")
        else:
            print("[KaggleCacheManager] Dataset create success.")
