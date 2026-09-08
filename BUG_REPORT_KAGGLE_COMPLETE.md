# Báo cáo lỗi Omnivoice Gateway & Kaggle Boot Worker

**Ngày ghi nhận**: 2026-09-07
**Nguồn phát hiện**: AutoCode Video Pipeline (Project `dung-de-codex-lam-designer-no-khong-biet-tro-592488`)

---

## 1. Mô tả sự cố thực tế
Khi client AutoCode Video gửi tác vụ sinh giọng nói (TTS) cho Scene 1 tới Omnivoice Gateway (`https://voice.oloka.net`), tiến trình thất bại sau 16 giây với mã lỗi:
```text
Omnivoice scene job failed: Kaggle boot error: phcnguynhukendykerry/omnivoice-worker-1 has status "KernelWorkerStatus.COMPLETE"
```

## 2. Phân tích nguyên nhân kỹ thuật
- Worker `phcnguynhukendykerry/omnivoice-worker-1` trên Kaggle đã kết thúc phiên chạy trước đó (do đạt giới hạn thời gian chạy hoặc timeout khi idle) và chuyển sang trạng thái `KernelWorkerStatus.COMPLETE`.
- Khi Gateway nhận job mới từ client và kiểm tra trạng thái worker thông qua Kaggle API:
  - Nếu thấy kernel đang ở trạng thái `COMPLETE`, logic boot hiện tại của Gateway coi đây là lỗi và ném exception:
    `Kaggle boot error: ... has status "KernelWorkerStatus.COMPLETE"`
  - Lỗi này được gán vào `job.error_message` và chuyển trạng thái job thành `failed` ngay lập tức (chỉ sau 16 giây).
  - Kaggle API không cho phép khởi động lại một kernel đã `COMPLETE` bằng lệnh resume thông thường, mà **bắt buộc phải push một phiên bản mới (`kaggle kernels push`)** để spawn một phiên GPU mới.

## 3. Các yêu cầu cần khắc phục trên Gateway & Worker
1. **Xử lý trạng thái `COMPLETE` / `CANCELLED` / `ERROR` khi boot**:
   - Khi Gateway kiểm tra status kernel mà thấy `COMPLETE`, `CANCELLED` hoặc `ERROR`: Gateway phải tự động kích hoạt `kaggle.api.kernels_push_cli()` (hoặc logic build & push notebook mới) để tạo một phiên GPU mới.
   - Job của client phải tiếp tục được giữ ở trạng thái `starting_worker` (hoặc `queued_kaggle`), tuyệt đối không được đánh dấu `failed` và ném exception làm gián đoạn client.
2. **Cơ chế Failover sang Worker dự phòng**:
   - Nếu `omnivoice-worker-1` bị COMPLETE hoặc gặp lỗi boot, Gateway phải tự động chuyển job sang `omnivoice-worker-2` ngay lập tức trong khi tiến hành khởi động lại `worker-1`.
3. **Giữ Worker Alive (Keep-Alive)**:
   - Cân nhắc thêm cơ chế heartbeat / keep-alive định kỳ trên worker để tránh bị Kaggle ngắt kết nối do idle.
4. **Deploy & Kiểm thử**:
   - Chạy `pytest` đảm bảo các test case vượt qua.
   - Push bản cập nhật lên Kaggle và Hugging Face Space (`phucsd/oloka-voice-studio`).
