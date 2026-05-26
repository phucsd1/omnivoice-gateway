---
title: OmniVoice Gateway Backend
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# OmniVoice On-Demand Gateway

OmniVoice On-Demand Gateway is an MVP system that connects a CPU-bound web application and FastAPI gateway running on Lightning AI with a GPU-bound OmniVoice TTS model running on Kaggle.

It implements a **pull-based worker architecture** where the GPU worker polls the gateway for jobs, processes them sequentially, and pushes the outputs back.

---

## Key Features

1. **Voice Sample Upload**: Upload an audio file (`WAV/MP3/FLAC`) to clone a voice.
2. **Voice Design Preview**: Describe a voice in natural Vietnamese (e.g. *"giọng nữ trẻ trầm ấm"*), generate a 3-second preview, and listen.
3. **Voice Acceptance**: Accept the preview to convert it into a standard reference sample for future TTS jobs.
4. **TTS Generation**: Generate high-fidelity text-to-speech outputs using either `clone_voice`, `auto_voice`, or direct `voice_design` prompts.
5. **Real-time Status Polling**: Tracks progress stages (`queued`, `starting_worker`, `booting_kaggle`, `loading_model`, `generating_audio`, `exporting_wav`, etc.).
6. **Bearer Token Authentication**: Secures worker communication APIs.

---

## Directory Structure

```text
omnivoice-gateway/
├─ backend/             # FastAPI Gateway, SQLite DB, Mock Services
│  ├─ app/
│  │  ├─ main.py        # App Lifespan & Routing Configuration
│  │  ├─ config.py      # Pydantic Settings
│  │  ├─ database.py    # SQLite / SQLAlchemy Init
│  │  ├─ models.py      # DB Models (VoiceSample, TTSJob, WorkerSession...)
│  │  ├─ routers/       # Modular Endpoints (health, jobs, tts...)
│  │  └─ services/      # Job, Audio, and Kaggle Orchestrator Services
├─ frontend/            # React + Vite + TS + Tailwind CSS Dashboard
│  ├─ src/
│  │  ├─ api/client.ts  # HTTP Fetch Client for Gateway
│  │  └─ components/    # Custom Dashboard Panels
└─ kaggle_worker/       # GPU Polling script running OmniVoice
   └─ worker.py         # Polling execution script
```

---

## A. Running Local Mock Mode

In Mock mode, the gateway runs a background thread simulating the transitions and outputs of a GPU worker. It generates standard WAV files containing a pleasant tone.

### 1. Run Backend
1. Open a terminal in `backend/`:
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate
   
   pip install -r requirements.txt
   ```
2. Create `.env` from `.env.example`:
   ```bash
   copy .env.example .env
   ```
3. Set `WORKER_MODE=mock`.
4. Start the server:
   ```bash
   uvicorn app.main:app --reload
   ```
   The backend will be available at `http://localhost:8000`.

### 2. Run Frontend
1. Open a terminal in `frontend/`:
   ```bash
   cd frontend
   npm install
   ```
2. Create `.env` from `.env.example`:
   ```bash
   copy .env.example .env
   ```
   *Ensure `VITE_API_BASE_URL=http://localhost:8000`*.
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open your browser at `http://localhost:5173`.

---

## B. Production Deployment (Lightning AI + Kaggle GPU)

In production, the backend runs on a Lightning AI CPU instance, and the worker runs on a Kaggle GPU notebook.

### Why Ngrok is Not Needed
Since FastAPI runs on Lightning AI, which exposes ports on a public URL, the Kaggle Worker (running inside Kaggle's environment with internet enabled) can call the gateway directly via its public URL. No Ngrok tunnel is needed!

### 1. Deploy Gateway on Lightning AI
1. Create a CPU/RAM Studio in Lightning AI.
2. Clone this repo into the Studio.
3. Open a terminal in `backend/` and install requirements:
   ```bash
   pip install -r requirements.txt
   ```
4. Create the `.env` file:
   - Set `WORKER_MODE=kaggle`.
   - Set `WORKER_TOKEN=<generate-a-secure-random-token-here>`.
   - Configure Kaggle Credentials:
     ```ini
     KAGGLE_USERNAME=your_kaggle_username
     KAGGLE_KEY=your_kaggle_api_key
     KAGGLE_KERNEL_REF=your_kaggle_username/omnivoice-worker
     KAGGLE_WORKER_DIR=../kaggle_worker
     ```
5. Run the server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
6. Expose port `8000` in Lightning AI. Copy the generated **Public URL** (e.g., `https://xxxx-8000.p.lightning.ai`).
7. Update the `.env` file on Lightning AI:
   - Set `PUBLIC_API_BASE_URL` to your Public URL (without trailing slash).
   - Set `FRONTEND_ORIGINS` to allow your deployed frontend or localhost.
8. Restart uvicorn.

### 2. Configure and Push Kaggle Worker
1. Install Kaggle CLI locally or on the machine you push from:
   ```bash
   pip install kaggle
   ```
2. Copy `kernel-metadata.json.example` in `kaggle_worker/` to `kernel-metadata.json` and change `id` to your username.
3. Push the kernel to Kaggle:
   ```bash
   kaggle kernels push -p ./kaggle_worker
   ```
4. Ensure the Kaggle kernel has the following environment variables injected (or set them at the top of the notebook script):
   - `PUBLIC_API_BASE_URL=<Your Lightning AI Public URL>`
   - `WORKER_TOKEN=<Your secure worker token>`

Once pushed, the worker will boot up, install `requirements.txt`, load OmniVoice, register with the gateway, and pull jobs!

---

## C. Tự tạo và đẩy Kaggle Worker

Hệ thống hỗ trợ cơ chế tự động xây dựng thư mục và mã nguồn worker dựa trên các tham số cấu hình hệ thống (nhập qua .env hoặc bảng Settings trên Web Dashboard). Điều này giúp chạy worker headless ổn định mà không cần thao tác qua giao diện Kaggle Notebook.

### Quy trình các bước thực hiện:

1. **Thiết lập biến môi trường**: Đảm bảo điền đầy đủ các thông tin trong file `.env` hoặc cập nhật thông qua panel cấu hình hệ thống trên Web Dashboard:
   - `KAGGLE_USERNAME`: Tên đăng nhập Kaggle
   - `KAGGLE_KEY`: Kaggle API Key
   - `KAGGLE_KERNEL_SLUG`: ID đường dẫn kernel (Mặc định: `omnivoice-worker`)
   - `KAGGLE_KERNEL_TITLE`: Tiêu đề hiển thị (Mặc định: `OmniVoice Worker`)
   - `PUBLIC_API_BASE_URL`: Public URL của FastAPI Gateway (chạy trên Lightning AI)
   - `WORKER_TOKEN`: Mã bảo mật Bearer token chung giữa worker và gateway

2. **Tự động sinh mã nguồn (Prepare Worker)**:
   ```bash
   python backend/scripts/prepare_kaggle_worker.py
   ```
   Lệnh này sẽ tự tạo thư mục `kaggle_worker` (nếu chưa có), tự sinh file `kernel-metadata.json`, `requirements.txt` và file script chạy headless `worker.py` tích hợp sẵn bộ kiểm tra dependencies tự cài đặt `ensure_dependencies()`.

3. **Đẩy Worker lên Kaggle (Push Worker)**:
   ```bash
   python backend/scripts/push_kaggle_worker.py
   ```
   Lệnh này sẽ gọi Kaggle CLI để đẩy mã nguồn lên Kaggle Kernel với cấu hình Accelerator mặc định là GPU `NvidiaTeslaT4` (hoặc thông số cấu hình khác từ env). 
   Sau khi push thành công, Kaggle sẽ tự khởi động instance GPU và chạy worker.

4. **Tự động kích hoạt (Automated push)**:
   Nếu chạy backend ở chế độ `WORKER_MODE=kaggle` và hiện tại chưa có worker nào hoạt động, FastAPI gateway sẽ tự động kích hoạt tiến trình prepare và push này khi nhận được job TTS đầu tiên từ người dùng.

