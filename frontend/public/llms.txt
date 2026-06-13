# OmniVoice Gateway API Documentation (Tài liệu API OmniVoice Gateway)

OmniVoice Gateway cung cấp hệ thống API RESTful bảo mật và mạnh mẽ, cho phép nhà phát triển và các AI agent tích hợp trực tiếp luồng sinh giọng nói nhân bản AI (AI Voice Cloning) vào ứng dụng bên ngoài.

---

## 📌 Thông tin Cơ bản (Core Information)

- **Giao thức (Protocol):** HTTPS REST API
- **Định dạng Dữ liệu (Data Format):** JSON (UTF-8)
- **Địa chỉ Máy chủ Production (Production Base URL):** `https://phucsd-omnivoice-gateway-backend.hf.space`
- **Địa chỉ Máy chủ Local (Local Base URL):** `http://localhost:7860`

---

## 🔑 Xác thực (Authentication)

Tất cả các API endpoint bảo mật yêu cầu đính kèm tiêu đề HTTP `Authorization` chứa mã API Key:

```http
Authorization: Bearer <YOUR_API_KEY>
```

---

## 📡 Danh sách API Endpoints (API Reference)

### 1. Tạo Yêu cầu Sinh Giọng Nói (Create TTS Job)

Gửi yêu cầu tạo tiến trình sinh giọng nói từ văn bản. Tiến trình này xử lý bất đồng bộ (asynchronous) qua GPU worker.

- **Phương thức (Method):** `POST`
- **Đường dẫn (Path):** `/v1/tts/jobs`
- **Yêu cầu Xác thực:** Có (Bearer Token)
- **Định dạng Body:** `application/json`

#### Tham số Yêu cầu (Request Body Parameters):

| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `mode` | `string` | **Có** | - | Chế độ sinh giọng. Giá trị hợp lệ: `clone_voice` (nhân bản), `auto_voice` (giọng tự động), `voice_design` (thiết kế giọng). |
| `text` | `string` | **Có** | - | Văn bản cần chuyển sang giọng nói. Khuyên dùng tối đa 500 ký tự. Có thể nhúng thẻ biểu cảm hoặc sửa phát âm. |
| `voice_sample_id` | `string` | **Có** (khi `clone_voice`) | - | ID của mẫu giọng nói tham chiếu (Ví dụ: `vs_xxxx`). |
| `ref_text` | `string` | Tùy chọn | - | Văn bản tương ứng với file ghi âm mẫu tham chiếu. Nếu để trống, hệ thống tự động nhận diện bằng Whisper ASR. |
| `speed` | `float` | Tùy chọn | `1.0` | Tốc độ đọc (giới hạn từ `0.5` đến `2.0`). |
| `num_step` | `integer` | Tùy chọn | `32` | Số bước suy diễn mạng nơ-ron (từ `16` đến `64`). Số bước lớn hơn cho chất lượng cao hơn nhưng thời gian xử lý lâu hơn. |
| `denoise` | `boolean` | Tùy chọn | `true` | Lọc nhiễu âm thanh đầu ra. |
| `with_alignment` | `boolean` | Tùy chọn | `false` | Đặt là `true` để nhận dữ liệu đồng bộ thời gian của từng từ (Word-level timestamps). |
| `guidance_scale` | `float` | Tùy chọn | `2.0` | Hệ số bám sát điều kiện mô tả (Classifier-free guidance). |
| `t_shift` | `float` | Tùy chọn | `0.1` | Độ dịch chuyển bước thời gian nhiễu (noise schedule). |
| `position_temperature` | `float` | Tùy chọn | `5.0` | Nhiệt độ chọn vị trí sinh (ngẫu nhiên hóa). |
| `class_temperature` | `float` | Tùy chọn | `0.0` | Nhiệt độ lấy mẫu mã âm thanh (0.0 là quyết định nhất). |
| `layer_penalty_factor` | `float` | Tùy chọn | `5.0` | Hệ số phạt độ sâu codebook, tăng tính ổn định bước đầu. |
| `duration` | `float` | Tùy chọn | - | Cố định độ dài âm thanh đầu ra bằng giây. |
| `preprocess_prompt` | `boolean` | Tùy chọn | `true` | Tiền xử lý âm thanh mẫu (cắt bớt khoảng lặng, chuẩn hóa). |
| `postprocess_output` | `boolean` | Tùy chọn | `true` | Hậu xử lý âm thanh đầu ra (cắt bớt khoảng lặng dư thừa). |
| `audio_chunk_duration` | `float` | Tùy chọn | `15.0` | Độ dài của mỗi phân đoạn âm thanh khi sinh văn bản dài (giây). |
| `audio_chunk_threshold` | `float` | Tùy chọn | `30.0` | Ngưỡng độ dài văn bản kích hoạt cơ chế tự động chia nhỏ (giây). |

#### Phản hồi Mẫu (Response Example):

```json
{
  "job_id": "job_123456789",
  "status": "queued"
}
```

---

### 2. Kiểm tra Tiến độ và Trạng thái của Job (Get Job Status - Polling)

Do GPU worker xử lý bất đồng bộ, bạn cần thực hiện gọi API kiểm tra trạng thái lặp lại (Polling) mỗi **3-5 giây** một lần cho đến khi hoàn thành hoặc thất bại.

- **Phương thức (Method):** `GET`
- **Đường dẫn (Path):** `/v1/jobs/{job_id}`
- **Yêu cầu Xác thực:** Có (Bearer Token)

#### Phản hồi Mẫu khi Hoàn thành (Success Response Example):

```json
{
  "job_id": "job_123456789",
  "status": "completed",
  "progress": 100,
  "audio_url": "/v1/tts/jobs/job_123456789/audio",
  "alignment": [
    { "word": "Xin", "start": 0.12, "end": 0.45 },
    { "word": "chào", "start": 0.45, "end": 0.78 }
  ],
  "error_message": null
}
```

#### Phân tích các Trạng thái (`status`):
- `queued`: Đang nằm trong hàng đợi.
- `starting_worker`: Đang khởi động GPU Worker.
- `running`: Đang trong quá trình xử lý sinh âm thanh.
- `completed`: Hoàn thành thành công.
- `failed`: Xử lý lỗi. Bạn có thể đọc mô tả lỗi ở trường `error_message`.

---

### 3. Tải Tệp Âm thanh Kết quả (Download Audio File)

Lấy tệp âm thanh WAV kết quả sau khi Job đã chuyển trạng thái thành `completed`.

- **Phương thức (Method):** `GET`
- **Đường dẫn (Path):** `/v1/tts/jobs/{job_id}/audio`
- **Yêu cầu Xác thực:** Có (Bearer Token)
- **Định dạng Phản hồi:** `audio/wav` (Nhị phân - Binary stream)

> [!IMPORTANT]
> Bạn **bắt buộc** phải đính kèm Header Authorization chứa API Key khi gọi tải file này. Hoặc nếu tải trực tiếp qua thẻ `<audio>`, bạn có thể đính kèm tham số URL `?token=<YOUR_API_KEY>`.

---

### 4. Lấy Danh sách Giọng Nói Công Khai (Get Voice Library)

Lấy danh sách các mẫu giọng nói công khai trong Thư viện Giọng nói để tham chiếu khi sinh giọng.

- **Phương thức (Method):** `GET`
- **Đường dẫn (Path):** `/v1/voice-library`
- **Yêu cầu Xác thực:** Không (Public)

#### Tham số Truy vấn (Query Parameters):
- `tag` (Tùy chọn): Lọc theo nhãn (Ví dụ: `Miền Nam`, `Trẻ`, `Kể chuyện`...).
- `search` (Tùy chọn): Tìm kiếm tương đối theo tên giọng nói.
- `limit` (Mặc định `50`): Số lượng kết quả tối đa (`1` - `200`).
- `offset` (Mặc định `0`): Số lượng bỏ qua (Phân trang).

---

### 5. Cập nhật Thông tin Giọng Nói (Update Voice Sample)

Chỉnh sửa thông tin mô tả chi tiết của một mẫu giọng nói do chính bạn sở hữu.

- **Phương thức (Method):** `PUT`
- **Đường dẫn (Path):** `/v1/voice-samples/{voice_sample_id}`
- **Yêu cầu Xác thực:** Có (Bearer Token)
- **Định dạng Body:** `application/json`

#### Tham số Yêu cầu (Request Body Parameters):
```json
{
  "name": "Giọng Nam Bộ Trẻ Đọc Truyện",
  "tags": ["Miền Nam", "Trẻ", "Kể chuyện"],
  "ref_text": "Văn bản mẫu của giọng nói mới cập nhật...",
  "is_public": true
}
```

---

## 🎭 Điều khiển Tinh chỉnh Giọng Nói (Fine-grained Control)

OmniVoice cho phép bạn nhúng các ký tự điều khiển trực tiếp vào chuỗi văn bản đầu vào (`text`) để mô phỏng âm thanh tự nhiên hoặc sửa lỗi phát âm.

### A. Biểu cảm phi ngôn ngữ (Non-verbal Expressions)
Bạn hãy chèn các nhãn đặc biệt này vào câu:
- `[laughter]`: Tiếng cười tự nhiên.
- `[sigh]`: Tiếng thở dài.
- `[sniff]`: Tiếng sụt sịt.
- `[question-en]`, `[question-ah]`: Giọng điệu nghi vấn.
- `[surprise-ah]`, `[surprise-oh]`: Giọng điệu ngạc nhiên.

*Ví dụ:* `"[laughter] Xin chào các bạn! [sigh] Hôm nay tôi hơi mệt."`

### B. Sửa lỗi phát âm (Phonetic Overrides)
Nếu mô hình phát âm sai tên riêng hoặc thuật ngữ tiếng Anh, Trung, bạn có thể ép mô hình đọc chuẩn bằng cách viết phiên âm đặc biệt:
- **Tiếng Anh (CMU Dictionary):** Viết hoa và bọc trong ngoặc vuông.
  *Ví dụ:* `"Đây là [B EY1 S] của tôi."` (phát âm chuẩn giống từ "base").
- **Tiếng Trung (Pinyin + Tone):** Viết hoa chữ Pinyin kèm số thanh điệu.
  *Ví dụ:* `"Đang giảm giá 打ZHE2出售."` (phát âm chính xác chữ 折 thanh 2).

---

## 💻 Mã Nguồn Mẫu (Code Snippets)

### cURL

```bash
# 1. Tạo yêu cầu sinh giọng nói
curl -X POST "https://phucsd-omnivoice-gateway-backend.hf.space/v1/tts/jobs" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "clone_voice",
    "voice_sample_id": "vs_xxxx",
    "ref_text": "Mẫu văn bản của giọng ghi âm gốc",
    "text": "[laughter] Xin chào, đây là giọng đọc nhân bản kèm tiếng cười.",
    "speed": 1.0,
    "num_step": 32,
    "with_alignment": true
  }'

# Phản hồi trả về: {"job_id": "job_xxxx", "status": "queued"}

# 2. Polling kiểm tra trạng thái
curl -X GET "https://phucsd-omnivoice-gateway-backend.hf.space/v1/jobs/YOUR_JOB_ID" \
  -H "Authorization: Bearer YOUR_API_KEY"

# 3. Tải tệp âm thanh WAV
curl -o output.wav -X GET "https://phucsd-omnivoice-gateway-backend.hf.space/v1/tts/jobs/YOUR_JOB_ID/audio" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Python

```python
import time
import requests

API_URL = "https://phucsd-omnivoice-gateway-backend.hf.space"
API_KEY = "YOUR_API_KEY"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# 1. Gửi văn bản sinh giọng nói
payload = {
    "mode": "clone_voice",
    "voice_sample_id": "vs_xxxx",
    "ref_text": "Mẫu văn bản của giọng ghi âm gốc",
    "text": "Xin chào, đây là mã tích hợp mẫu bằng ngôn ngữ Python.",
    "speed": 1.0,
    "num_step": 32,
    "with_alignment": True
}

print("Đang gửi yêu cầu TTS...")
response = requests.post(f"{API_URL}/v1/tts/jobs", json=payload, headers=headers)
response.raise_for_status()
job_id = response.json()["job_id"]
print(f"Yêu cầu được chấp nhận. Job ID: {job_id}")

# 2. Vòng lặp kiểm tra tiến độ (Polling)
while True:
    status_res = requests.get(f"{API_URL}/v1/jobs/{job_id}", headers=headers)
    status_res.raise_for_status()
    job_data = status_res.json()
    status = job_data["status"]
    
    print(f"Trạng thái: {status} • Tiến trình: {job_data['progress']}%")
    
    if status == "completed":
        print("Xử lý âm thanh hoàn tất!")
        if "alignment" in job_data and job_data["alignment"]:
            print("\nDữ liệu đồng bộ từ ngữ (timestamps):")
            for item in job_data["alignment"]:
                print(f"  [{item['start']:.2f}s - {item['end']:.2f}s] {item['word']}")
        break
    elif status == "failed":
        raise Exception(f"Job thất bại: {job_data['error_message']}")
        
    time.sleep(3)

# 3. Tải tệp âm thanh WAV
print("Đang tải file âm thanh...")
audio_res = requests.get(f"{API_URL}/v1/tts/jobs/{job_id}/audio", headers=headers)
audio_res.raise_for_status()

with open("output.wav", "wb") as f:
    f.write(audio_res.content)
print("Đã lưu tệp âm thanh thành công dưới tên: output.wav")
```

### NodeJS

```javascript
const fetch = require('node-fetch'); // Cần thiết đối với Node.js < 18
const fs = require('fs');

const API_URL = 'https://phucsd-omnivoice-gateway-backend.hf.space';
const API_KEY = 'YOUR_API_KEY';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function generateSpeech() {
  try {
    // 1. Tạo Job
    console.log("Đang tạo Job sinh giọng nói...");
    const res = await fetch(`${API_URL}/v1/tts/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'clone_voice',
        voice_sample_id: 'vs_xxxx',
        ref_text: 'Mẫu văn bản của giọng ghi âm gốc',
        text: 'Xin chào, đây là mã nguồn nhúng bằng Node.js.',
        speed: 1.0,
        num_step: 32,
        with_alignment: true
      })
    });
    
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const { job_id } = await res.json();
    console.log(`Job ID đã tạo: ${job_id}`);

    // 2. Poll kiểm tra trạng thái
    while (true) {
      console.log("Đang kiểm tra trạng thái...");
      const statusRes = await fetch(`${API_URL}/v1/jobs/${job_id}`, { headers });
      const jobData = await statusRes.json();
      
      console.log(`Trạng thái: ${jobData.status} (${jobData.progress}%)`);
      
      if (jobData.status === 'completed') {
        if (jobData.alignment) {
          console.log("\nDữ liệu đồng bộ từ ngữ:", jobData.alignment);
        }
        break;
      } else if (jobData.status === 'failed') {
        throw new Error(`TTS Job thất bại: ${jobData.error_message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 3. Tải tệp âm thanh
    console.log("Đang tải tệp WAV về...");
    const audioRes = await fetch(`${API_URL}/v1/tts/jobs/${job_id}/audio`, { headers });
    const buffer = await audioRes.buffer();
    
    fs.writeFileSync('output.wav', buffer);
    console.log("Tệp âm thanh WAV đã được lưu thành công: output.wav");
  } catch (error) {
    console.error("Lỗi tích hợp:", error);
  }
}

generateSpeech();
```
