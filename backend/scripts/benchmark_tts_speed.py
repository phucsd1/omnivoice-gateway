#!/usr/bin/env python3
"""
OMNIVOICE GATEWAY - 5 BÀI TEST ĐO TỐC ĐỘ COLD-START & TTS INFERENCE
------------------------------------------------------------------
Script này định nghĩa và tự động thực thi 5 kịch bản đo đạc tốc độ:
1. Test 1: Auto Voice (Câu ngắn chào hỏi) - Đo Cold Start tinh giản
2. Test 2: Auto Voice (Đoạn tin tức chuẩn) - Đo RTF / Warm Start
3. Test 3: Voice Clone (Sao chép chất giọng mẫu) - Đo mã hóa audio_tokenizer
4. Test 4: Voice Clone kèm Alignment (Khớp phụ đề từ Faster-Whisper) - Đo luồng background ASR
5. Test 5: Stress Test (Đoạn văn dài + 32 Steps) - Đo tải cao & độ ổn định GPU
"""

import os
import sys
import time
import json
import argparse
import wave
import requests
from datetime import datetime

# Configure UTF-8 for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Định nghĩa 5 bài test chuẩn hóa
TEST_CASES = [
    {
        "id": "test_1",
        "name": "Test 1: Auto Voice (Câu ngắn chào hỏi)",
        "description": "Đo thời gian Cold Start tinh giản và độ trễ First Audio Packet.",
        "payload": {
            "mode": "auto_voice",
            "text": "Xin chào, đây là bài kiểm tra đo tốc độ khởi động của hệ thống OmniVoice.",
            "speed": 1.0,
            "num_step": 16,
            "denoise": True,
            "with_alignment": False
        }
    },
    {
        "id": "test_2",
        "name": "Test 2: Auto Voice (Đoạn tin tức chuẩn)",
        "description": "Đo tốc độ suy luận khi worker đã sẵn sàng, tính tỉ số thời gian thực RTF.",
        "payload": {
            "mode": "auto_voice",
            "text": "Trí tuệ nhân tạo đang thay đổi nhanh chóng cách chúng ta sáng tạo nội dung số. Với công nghệ tổng hợp giọng nói OmniVoice, việc chuyển đổi văn bản thành âm thanh tự nhiên chỉ mất vài giây với độ chân thực cao.",
            "speed": 1.0,
            "num_step": 16,
            "denoise": True,
            "with_alignment": False
        }
    },
    {
        "id": "test_3",
        "name": "Test 3: Voice Clone (Sao chép chất giọng mẫu)",
        "description": "Đo thời gian nạp audio prompt tham chiếu và mã hóa qua audio_tokenizer offline.",
        "payload": {
            "mode": "clone_voice",
            "text": "Chào bạn, đây là giọng nói được sao chép trực tiếp từ mẫu âm thanh tham chiếu của bạn.",
            "speed": 1.0,
            "num_step": 16,
            "denoise": True,
            "with_alignment": False
        }
    },
    {
        "id": "test_4",
        "name": "Test 4: Voice Clone kèm Alignment (Khớp phụ đề từng từ)",
        "description": "Đo tốc độ sinh âm thanh kèm xuất timestamp phụ đề từ Faster-Whisper chạy ngầm.",
        "payload": {
            "mode": "clone_voice",
            "text": "Hệ thống tự động canh chỉnh thời gian phát âm từng từ để phục vụ cho việc làm phụ đề video.",
            "speed": 1.0,
            "num_step": 16,
            "denoise": True,
            "with_alignment": True
        }
    },
    {
        "id": "test_5",
        "name": "Test 5: Stress Test (Đoạn văn dài + 32 Steps)",
        "description": "Đo hiệu năng chịu tải, giới hạn VRAM và khả năng sinh chuỗi âm thanh dài với 32 diffusion steps.",
        "payload": {
            "mode": "auto_voice",
            "text": "Hôm nay chúng ta cùng đánh giá khả năng vận hành bền bỉ của máy chủ GPU trên Kaggle. Khi xử lý một đoạn văn bản dài với các tham số chất lượng cao như số bước khuếch tán ba mươi hai bước và tốc độ đọc tùy chỉnh, hệ thống vẫn duy trì được độ mượt mà, không bị giật lag hay tràn bộ nhớ GPU.",
            "speed": 1.05,
            "num_step": 32,
            "denoise": True,
            "with_alignment": False
        }
    }
]

def get_audio_duration_wav(file_path: str) -> float:
    """Calculates duration of a WAV file in seconds."""
    try:
        with wave.open(file_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return round(frames / float(rate), 2)
    except Exception:
        return 0.0

def run_single_test(base_url: str, token: str, test_info: dict, out_dir: str, voice_sample_id: str = None) -> dict:
    test_name = test_info["name"]
    payload = test_info["payload"].copy()
    
    if payload.get("mode") == "clone_voice":
        if voice_sample_id:
            payload["voice_sample_id"] = voice_sample_id
        else:
            print(f"[*] Lưu ý: {test_name} yêu cầu voice_sample_id. Nếu không có mẫu, tự động fallback sang auto_voice.")
            payload["mode"] = "auto_voice"

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    print(f"\n{'='*70}")
    print(f" BẮT ĐẦU {test_name}")
    print(f" Mục tiêu: {test_info['description']}")
    print(f" Văn bản ({len(payload['text'].split())} từ): \"{payload['text']}\"")
    print(f"{'='*70}")

    t0 = time.time()
    endpoint = f"{base_url.rstrip('/')}/v1/tts/jobs"
    
    try:
        res = requests.post(endpoint, json=payload, headers=headers, timeout=30)
    except Exception as e:
        print(f"[!] Lỗi kết nối gửi job: {e}")
        return {"name": test_name, "status": "failed", "error": str(e)}

    if res.status_code not in [200, 201]:
        print(f"[!] Lỗi gửi job (Status {res.status_code}): {res.text}")
        return {"name": test_name, "status": "failed", "error": res.text}

    job_data = res.json()
    job_id = job_data.get("job_id")
    print(f"[+] Tạo job thành công! Job ID: {job_id}")

    # Polling job status
    poll_url = f"{base_url.rstrip('/')}/v1/tts/jobs/{job_id}"
    last_status = None
    boot_start_time = None
    ready_time = None
    t_complete = None
    
    while True:
        elapsed = round(time.time() - t0, 1)
        try:
            r = requests.get(poll_url, headers=headers, timeout=15)
            if r.status_code == 200:
                data = r.json()
                status_str = data.get("status")
                msg = data.get("message") or ""
                progress = data.get("progress", 0)

                if status_str != last_status or progress % 25 == 0:
                    print(f"  [{elapsed:5.1f}s] Trạng thái: {status_str} ({progress}%) | {msg}")
                    last_status = status_str

                if status_str in ["starting_worker", "queued_kaggle"] and not boot_start_time:
                    boot_start_time = time.time()

                if status_str == "busy" and not ready_time:
                    ready_time = time.time()

                if status_str == "completed":
                    t_complete = time.time()
                    print(f"[+] Job {job_id} hoàn thành sau {round(t_complete - t0, 2)}s!")
                    break

                if status_str == "failed":
                    err = data.get("error_message") or msg or "Unknown error"
                    print(f"[!] Job {job_id} thất bại: {err}")
                    return {"name": test_name, "status": "failed", "error": err, "total_time": elapsed}

            time.sleep(1.0)
        except Exception as poll_err:
            print(f"[!] Lỗi khi thăm dò trạng thái: {poll_err}")
            time.sleep(2.0)

    # Download output audio
    audio_file = os.path.join(out_dir, f"{test_info['id']}_{job_id}.wav")
    audio_endpoint = f"{base_url.rstrip('/')}/v1/tts/jobs/{job_id}/audio"
    audio_duration = 0.0
    try:
        ares = requests.get(audio_endpoint, headers=headers, timeout=30)
        if ares.status_code == 200:
            with open(audio_file, "wb") as f:
                f.write(ares.content)
            audio_duration = get_audio_duration_wav(audio_file)
            print(f"[+] Đã tải tệp âm thanh: {audio_file} (Thời lượng: {audio_duration}s, Kích thước: {len(ares.content):,} bytes)")
    except Exception as a_err:
        print(f"[!] Không thể tải audio: {a_err}")

    total_time = round(t_complete - t0, 2)
    boot_time = round(ready_time - boot_start_time, 2) if (ready_time and boot_start_time) else 0.0
    infer_time = round(t_complete - (ready_time or boot_start_time or t0), 2)
    rtf = round(infer_time / audio_duration, 2) if audio_duration > 0 else 0.0

    return {
        "name": test_name,
        "job_id": job_id,
        "status": "completed",
        "total_time": total_time,
        "boot_time": boot_time,
        "infer_time": infer_time,
        "audio_duration": audio_duration,
        "rtf": rtf
    }

def print_summary_table(results: list):
    print("\n" + "="*85)
    print(" BẢNG TỔNG KẾT KẾT QUẢ ĐO ĐẠC HIỆU NĂNG 5 BÀI TEST TTS")
    print("="*85)
    print(f"{'Tên bài test':<35} | {'Tổng E2E':<10} | {'Cold Start':<11} | {'Inference':<10} | {'Độ dài WAV':<10} | {'RTF':<6}")
    print("-" * 85)
    for r in results:
        if r["status"] == "completed":
            print(f"{r['name']:<35} | {r['total_time']:>8.2f}s | {r['boot_time']:>9.2f}s | {r['infer_time']:>8.2f}s | {r['audio_duration']:>8.2f}s | {r['rtf']:>5.2f}x")
        else:
            print(f"{r['name']:<35} | {'THẤT BẠI':>10} | {'-':>11} | {'-':>10} | {'-':>10} | {'-':>6}")
    print("="*85)
    print("Ghi chú RTF (Real-Time Factor = Inference / Duration): Càng nhỏ hơn 1.0x thì tốc độ sinh càng nhanh hơn giọng người thật.")

def print_manual_guide():
    print("""
=============================================================================
 HƯỚNG DẪN THỰC HIỆN 5 BÀI TEST TRÊN GIAO DIỆN WEB (https://voice.oloka.net)
=============================================================================

Bạn có thể copy trực tiếp từng văn bản mẫu bên dưới vào giao diện Studio:

--- [Bài Test 1: Auto Voice - Câu ngắn chào hỏi] ---
* Chế độ: Auto Voice (Giọng ngẫu nhiên)
* Văn bản:
  "Xin chào, đây là bài kiểm tra đo tốc độ khởi động của hệ thống OmniVoice."
* Mục tiêu kiểm tra: Đo thời gian khởi động máy chủ (Cold Start) khi máy đang tắt.

--- [Bài Test 2: Auto Voice - Đoạn tin tức tiêu chuẩn] ---
* Chế độ: Auto Voice
* Văn bản:
  "Trí tuệ nhân tạo đang thay đổi nhanh chóng cách chúng ta sáng tạo nội dung số. Với công nghệ tổng hợp giọng nói OmniVoice, việc chuyển đổi văn bản thành âm thanh tự nhiên chỉ mất vài giây với độ chân thực cao."
* Mục tiêu kiểm tra: Đo tốc độ sinh khi máy chủ đã ấm (Warm-start inference).

--- [Bài Test 3: Voice Clone - Sao chép chất giọng mẫu] ---
* Chế độ: Clone Voice (Chọn 1 mẫu giọng bất kỳ có sẵn trong thư viện)
* Văn bản:
  "Chào bạn, đây là giọng nói được sao chép trực tiếp từ mẫu âm thanh tham chiếu của bạn."
* Mục tiêu kiểm tra: Đo tốc độ nạp audio reference prompt và trích xuất đặc trưng giọng nói.

--- [Bài Test 4: Voice Clone kèm Alignment phụ đề] ---
* Chế độ: Clone Voice (Bật tùy chọn: "Xuất kèm phụ đề đồng bộ / Alignment")
* Văn bản:
  "Hệ thống tự động canh chỉnh thời gian phát âm từng từ để phục vụ cho việc làm phụ đề video."
* Mục tiêu kiểm tra: Xác nhận luồng Faster-Whisper ngầm trả kết quả tức thì không gây nghẽn.

--- [Bài Test 5: Stress Test - Đoạn văn dài + 32 Diffusion Steps] ---
* Chế độ: Auto Voice hoặc Clone Voice
* Cấu hình nâng cao: Số bước khuếch tán = 32 bước (mặc định 16), Tốc độ = 1.05
* Văn bản:
  "Hôm nay chúng ta cùng đánh giá khả năng vận hành bền bỉ của máy chủ GPU trên Kaggle. Khi xử lý một đoạn văn bản dài với các tham số chất lượng cao như số bước khuếch tán ba mươi hai bước và tốc độ đọc tùy chỉnh, hệ thống vẫn duy trì được độ mượt mà, không bị giật lag hay tràn bộ nhớ GPU."
* Mục tiêu kiểm tra: Đo độ ổn định, khả năng chịu tải và không bị tràn bộ nhớ VRAM.
=============================================================================
""")

def main():
    parser = argparse.ArgumentParser(description="OmniVoice 5-Test Benchmark Suite")
    parser.add_argument("--url", default="https://voice.oloka.net", help="Gateway URL (mặc định: https://voice.oloka.net)")
    parser.add_argument("--token", default=None, help="Mã Token Bearer hoặc API Key")
    parser.add_argument("--voice-sample-id", default=None, help="Voice sample ID cho các bài test clone voice")
    parser.add_argument("--out-dir", default="./benchmark_results", help="Thư mục lưu kết quả audio")
    parser.add_argument("--guide", action="store_true", help="Chỉ in hướng dẫn test thủ công trên Web UI")
    parser.add_argument("--test", type=str, default="all", help="Chọn test cụ thể (test_1, test_2, ... hoặc all)")
    args = parser.parse_args()

    if args.guide:
        print_manual_guide()
        return

    os.makedirs(args.out_dir, exist_ok=True)
    
    # Select tests to run
    tests_to_run = TEST_CASES if args.test == "all" else [t for t in TEST_CASES if t["id"] == args.test]
    if not tests_to_run:
        print(f"Không tìm thấy bài test '{args.test}'. Hãy chọn test_1 đến test_5 hoặc 'all'.")
        return

    results = []
    for t_info in tests_to_run:
        res = run_single_test(
            base_url=args.url,
            token=args.token,
            test_info=t_info,
            out_dir=args.out_dir,
            voice_sample_id=args.voice_sample_id
        )
        results.append(res)

    print_summary_table(results)

if __name__ == "__main__":
    main()
