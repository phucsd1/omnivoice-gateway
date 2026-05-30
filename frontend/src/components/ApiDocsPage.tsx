import React, { useState, useEffect } from "react";
import { Terminal, FileCode, Check, Play, Copy, ArrowLeft, KeyRound, BookOpen, Cpu, Code, Volume2 } from "lucide-react";
import { api, getApiBaseUrl } from "../api/client";
import type { ApiKeyResponse } from "../api/client";

interface ApiDocsPageProps {
  onBack: () => void;
  isLoggedIn: boolean;
}

export const ApiDocsPage: React.FC<ApiDocsPageProps> = ({ onBack, isLoggedIn }) => {
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [docTab, setDocTab] = useState<"curl" | "python" | "nodejs">("curl");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      setLoadingKeys(true);
      api.getUserApiKeys()
        .then((res) => setApiKeys(res))
        .catch((err) => console.error("Lỗi lấy API Keys cho tài liệu:", err))
        .finally(() => setLoadingKeys(false));
    }
  }, [isLoggedIn]);

  const activeKey = apiKeys[0]?.key || "YOUR_API_KEY";
  const baseUrl = getApiBaseUrl();

  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const codeSnippets = {
    curl: `# 1. Tạo yêu cầu sinh giọng nói (TTS)
curl -X POST "${baseUrl}/v1/tts/jobs" \\
  -H "Authorization: Bearer ${activeKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "clone_voice",
    "voice_sample_id": "vs_xxxx",
    "ref_text": "Mẫu văn bản của giọng ghi âm gốc",
    "text": "[laughter] Xin chào, đây là giọng đọc nhân bản kèm tiếng cười.",
    "speed": 1.0,
    "num_step": 32
  }'

# Phản hồi sẽ trả về {"job_id": "job_xxxx", "status": "queued"}

# 2. Kiểm tra tiến độ và trạng thái của Job (gọi lặp mỗi 3-5s)
curl -X GET "${baseUrl}/v1/jobs/YOUR_JOB_ID" \\
  -H "Authorization: Bearer ${activeKey}"

# 3. Tải tệp âm thanh WAV (khi status đạt "completed")
curl -o output.wav -X GET "${baseUrl}/v1/tts/jobs/YOUR_JOB_ID/audio" \\
  -H "Authorization: Bearer ${activeKey}"`,

    python: `import time
import requests

API_URL = "${baseUrl}"
API_KEY = "${activeKey}"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# 1. Gửi văn bản sinh giọng nói (Clone voice với tiếng cười nhúng sẵn)
payload = {
    "mode": "clone_voice",
    "voice_sample_id": "vs_xxxx",
    "ref_text": "Mẫu văn bản của giọng ghi âm gốc",
    "text": "[laughter] Xin chào, đây là mã tích hợp mẫu bằng ngôn ngữ Python.",
    "speed": 1.0,
    "num_step": 32
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
        break
    elif status == "failed":
        raise Exception(f"Job thất bại: {job_data['error_message']}")
        
    time.sleep(3)

# 3. Tải tệp âm thanh WAV về máy
print("Đang tải file âm thanh...")
audio_res = requests.get(f"{API_URL}/v1/tts/jobs/{job_id}/audio", headers=headers)
audio_res.raise_for_status()

with open("output.wav", "wb") as f:
    f.write(audio_res.content)
print("Đã lưu tệp âm thanh thành công dưới tên: output.wav")`,

    nodejs: `const fetch = require('node-fetch'); // Yêu cầu node-fetch đối với Node.js < 18
const fs = require('fs');

const API_URL = '${baseUrl}';
const API_KEY = '${activeKey}';

const headers = {
  'Authorization': \`Bearer \${API_KEY}\`,
  'Content-Type': 'application/json'
};

async function generateSpeech() {
  try {
    // 1. Tạo Job (Clone voice với tiếng cười nhúng sẵn)
    console.log("Đang tạo Job sinh giọng nói...");
    const res = await fetch(\`\${API_URL}/v1/tts/jobs\`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'clone_voice',
        voice_sample_id: 'vs_xxxx',
        ref_text: 'Mẫu văn bản của giọng ghi âm gốc',
        text: '[laughter] Xin chào, đây là mã nguồn nhúng bằng Node.js.',
        speed: 1.0,
        num_step: 32
      })
    });
    
    if (!res.ok) throw new Error(\`HTTP error! status: \${res.status}\`);
    const { job_id } = await res.json();
    console.log(\`Job ID đã tạo: \${job_id}\`);

    // 2. Poll kiểm tra trạng thái
    while (true) {
      console.log("Đang kiểm tra trạng thái...");
      const statusRes = await fetch(\`\${API_URL}/v1/jobs/\${job_id}\`, { headers });
      const jobData = await statusRes.json();
      
      console.log(\`Trạng thái: \${jobData.status} (\${jobData.progress}%)\`);
      
      if (jobData.status === 'completed') {
        break;
      } else if (jobData.status === 'failed') {
        throw new Error(\`TTS Job thất bại: \${jobData.error_message}\`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 3. Tải tệp âm thanh
    console.log("Đang tải tệp WAV về...");
    const audioRes = await fetch(\`\${API_URL}/v1/tts/jobs/\${job_id}/audio\`, { headers });
    const buffer = await audioRes.buffer();
    
    fs.writeFileSync('output.wav', buffer);
    console.log("Tệp âm thanh WAV đã được lưu thành công: output.wav");
  } catch (error) {
    console.error("Lỗi tích hợp:", error);
  }
}

generateSpeech();`
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans select-text">
      {/* Background patterns */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Docs Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-card hover:bg-muted border border-border rounded-xl text-foreground hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
            title="Quay lại"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">Quay lại</span>
          </button>
          <div className="w-px h-6 bg-muted" />
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="text-sm font-bold text-foreground tracking-tight">Tài liệu API Tích hợp</h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[10px] bg-primary/20 text-primary/90 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
            API v1.0
          </span>
        </div>
      </header>

      {/* Docs Content Grid */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
        {/* Left column - Menu & Authentication details */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Quick Stats Card */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
            <h3 className="font-bold text-xs text-foreground uppercase tracking-wider border-b border-border pb-2">
              Giới thiệu Gateway API
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              OmniVoice Gateway cung cấp hệ thống API RESTful bảo mật và mạnh mẽ, cho phép nhà phát triển nhúng trực tiếp luồng sinh giọng nói nhân bản AI vào các ứng dụng bên ngoài.
            </p>
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between text-[11px] border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground font-semibold">Giao thức:</span>
                <span className="font-mono text-primary/90 font-bold">HTTPS REST API</span>
              </div>
              <div className="flex items-center justify-between text-[11px] border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground font-semibold">Định dạng Data:</span>
                <span className="font-mono text-primary/90 font-bold">JSON (UTF-8)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground font-semibold">Địa chỉ Máy chủ:</span>
                <span className="font-mono text-primary/90 truncate max-w-[160px] font-bold" title={baseUrl}>
                  {baseUrl}
                </span>
              </div>
            </div>
          </div>

          {/* Authentication & Authorization */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">
                Xác thực (Authentication)
              </h3>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mọi cuộc gọi API đến các endpoint bảo mật đều phải đính kèm Header Authorization chứa khóa API Key của bạn.
            </p>

            <div className="bg-background border border-border p-3 rounded-xl font-mono text-[11px] text-primary/90 select-all leading-normal">
              Authorization: Bearer <span className="text-foreground font-bold">{activeKey}</span>
            </div>

            {!isLoggedIn ? (
              <p className="text-[10px] text-warning bg-warning/10 border border-warning/20 p-2.5 rounded-lg font-medium leading-relaxed">
                💡 Bạn chưa đăng nhập. Hãy đăng nhập để hệ thống tự động điền API Key thực tế của bạn vào các đoạn code mẫu.
              </p>
            ) : loadingKeys ? (
              <p className="text-[10px] text-muted-foreground">Đang tải API Key của bạn...</p>
            ) : (
              <p className="text-[10px] text-success bg-success/10 border border-success/20 p-2.5 rounded-lg font-medium leading-relaxed">
                ✓ Đã áp dụng API Key thực tế của bạn vào các đoạn code mẫu tích hợp bên phải.
              </p>
            )}
          </div>

          {/* Parameter details */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Cpu className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">
                Thông số TTS (Parameters)
              </h3>
            </div>
            
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="font-mono text-primary/90 font-bold">mode</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Bắt buộc)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Chế độ sinh. Gồm: <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">auto_voice</code> (giọng tự động), <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">clone_voice</code> (nhân bản), <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">voice_design</code> (thiết kế).
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">text</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Bắt buộc)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Đoạn văn bản muốn chuyển đổi thành giọng nói (Khuyên dùng tối đa 500 ký tự). Có thể nhúng các thẻ biểu cảm (ví dụ: <code className="text-primary/90 font-mono">[laughter]</code>) và ký tự sửa phát âm.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">ref_text</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Văn bản của tệp ghi âm giọng mẫu tham chiếu khi dùng chế độ <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">clone_voice</code>. Nếu bỏ trống, worker sẽ tự trích xuất bằng Whisper ASR.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">speed</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tốc độ đọc giọng nói (từ <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">0.5</code> đến <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">2.0</code>). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">1.0</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">num_step</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Số bước suy diễn mạng nơ-ron (chất lượng âm thanh). Từ <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">16</code> đến <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">64</code>. Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">32</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">denoise</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Lọc nhiễu âm thanh đầu ra. Kiểu boolean (<code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">true</code> / <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">false</code>). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">true</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">guidance_scale</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Mức độ bám sát điều kiện mô tả (Classifier-free guidance). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">2.0</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">t_shift</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Độ dịch chuyển bước thời gian nhiễu (noise schedule). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">0.1</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">position_temperature</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Nhiệt độ chọn vị trí sinh (ngẫu nhiên hóa). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">5.0</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">class_temperature</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Nhiệt độ lấy mẫu mã âm thanh (tính ngẫu nhiên giọng nói). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">0.0</code> (quyết định).
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">layer_penalty_factor</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Hệ số phạt độ sâu codebook, tăng tính ổn định bước đầu. Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">5.0</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">duration</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cố định thời lượng âm thanh trả về tính bằng giây. Ví dụ: <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">10.0</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">preprocess_prompt</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tiền xử lý âm thanh mẫu (cắt bớt khoảng lặng, căn chỉnh). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">true</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">postprocess_output</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Hậu xử lý âm thanh đầu ra (cắt silence thừa). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">true</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">audio_chunk_duration</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Đoài đoạn âm thanh khi sinh văn bản dài (giây). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">15.0</code>.
                </p>
              </div>

              <div>
                <span className="font-mono text-primary/90 font-bold">audio_chunk_threshold</span>
                <span className="text-muted-foreground text-[10px] ml-2 font-semibold">(Tùy chọn)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Ngưỡng độ dài văn bản kích hoạt cơ chế chia nhỏ (giây). Mặc định là <code className="text-foreground bg-muted border border-border px-1.5 py-0.5 rounded font-mono font-semibold">30.0</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - API flow list & code snippet tabs */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Endpoint documentation */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            <h3 className="font-bold text-xs text-foreground uppercase tracking-wider border-b border-border pb-2">
              Quy trình &amp; Các API Endpoints
            </h3>
            
            <div className="flex flex-col gap-4">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="bg-primary/10 text-primary font-black text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-success/15 border border-success/20 text-success text-[10px] font-black px-2 py-0.5 rounded">
                      POST
                    </span>
                    <span className="font-mono text-xs text-foreground select-all">/v1/tts/jobs</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Gửi yêu cầu tạo Job sinh giọng đọc từ text. Thành công sẽ trả về mã <code className="text-primary/90 font-mono">job_id</code> để theo dõi.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="bg-primary/10 text-primary font-black text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-primary/15 border border-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded">
                      GET
                    </span>
                    <span className="font-mono text-xs text-foreground select-all">/v1/jobs/{"{job_id}"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Kiểm tra tiến độ thực thi (Polling) của tiến trình xử lý GPU Worker. Gọi API lặp lại mỗi 3-5 giây cho đến khi nhận được trạng thái <code className="text-success">completed</code>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="bg-primary/10 text-primary font-black text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-primary/15 border border-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded">
                      GET
                    </span>
                    <span className="font-mono text-xs text-foreground select-all">/v1/tts/jobs/{"{job_id}"}/audio</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Tải về tệp âm thanh kết quả định dạng WAV. <strong>Lưu ý quan trọng:</strong> Khi gọi GET endpoint này, bạn bắt buộc phải đính kèm Header Authorization API Key.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Fine-grained Control Documentation */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Volume2 className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">
                Điều khiển tinh chỉnh: Biểu cảm &amp; Phát âm (Fine-grained Control)
              </h3>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              OmniVoice cho phép bạn nhúng các ký tự điều khiển trực tiếp vào chuỗi văn bản đầu vào (<code className="text-primary/90 font-mono">text</code>) để tạo ra các âm thanh phụ trợ tự nhiên hoặc sửa đổi phát âm chuẩn xác.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
              {/* Expressions */}
              <div className="flex flex-col gap-2 p-3 bg-background/60 border border-border/60 rounded-xl">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">🎭 Biểu cảm phi ngôn ngữ</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Nhúng các thẻ biểu cảm trực tiếp vào bất kỳ vị trí nào trong câu để mô phỏng âm thanh tự nhiên của con người.
                </p>
                <div className="flex flex-col gap-1.5 mt-1 font-mono text-[10px]">
                  <div className="bg-card p-1.5 rounded text-primary/90">
                    <span className="text-white font-semibold">Thở dài:</span> [sigh]
                  </div>
                  <div className="bg-card p-1.5 rounded text-primary/90">
                    <span className="text-white font-semibold">Sụt sịt:</span> [sniff]
                  </div>
                  <div className="bg-card p-1.5 rounded text-primary/90">
                    <span className="text-white font-semibold">Nghe nghi vấn:</span> [question-en], [question-ah]
                  </div>
                  <div className="bg-card p-1.5 rounded text-primary/90">
                    <span className="text-white font-semibold">Ngạc nhiên:</span> [surprise-ah], [surprise-oh]
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground italic mt-0.5 leading-normal">
                  Ví dụ: "[laughter] Thật tuyệt vời! [sigh] Nhưng tôi hơi mệt rồi."
                </span>
              </div>

              {/* Pronunciation correction */}
              <div className="flex flex-col gap-2 p-3 bg-background/60 border border-border/60 rounded-xl">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">🗣️ Sửa lỗi phát âm (Phonetic Overrides)</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Nếu mô hình đọc sai tên riêng, thuật ngữ hoặc từ ghép, bạn có thể thay thế cụm từ đó bằng ký tự phiên âm đặc biệt.
                </p>
                <div className="flex flex-col gap-2 mt-1">
                  <div>
                    <span className="text-[10px] text-foreground font-bold">🇺🇸 Phiên âm tiếng Anh (CMU Dictionary):</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">
                      Sử dụng âm tiết chuẩn CMU viết hoa, bọc trong dấu ngoặc vuông.
                    </p>
                    <div className="bg-card p-1.5 rounded text-primary/90 font-mono text-[10px] mt-1">
                      "read as [B EY1 S]" (phát âm giống word base)
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-foreground font-bold">🇨🇳 Phiên âm tiếng Trung (Pinyin + Tone):</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">
                      Sử dụng chữ Pinyin viết hoa đính kèm số thanh điệu (1-4).
                    </p>
                    <div className="bg-card p-1.5 rounded text-primary/90 font-mono text-[10px] mt-1">
                      "打ZHE2出售" (phát âm chính xác chữ 折 thanh 2)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Code Snippets */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-xl">
            {/* Header triggers */}
            <div className="bg-background px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-border gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Đoạn mã nguồn mẫu tích hợp hệ thống</span>
              </div>
              
              <div className="flex bg-card p-0.5 border border-border rounded-lg self-start sm:self-auto">
                <button
                  onClick={() => setDocTab("curl")}
                  className={`px-3.5 py-1.5 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                    docTab === "curl" ? "bg-muted text-foreground border border-border shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Play className="w-2.5 h-2.5" />
                  <span>cURL</span>
                </button>
                <button
                  onClick={() => setDocTab("python")}
                  className={`px-3.5 py-1.5 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                    docTab === "python" ? "bg-muted text-foreground border border-border shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileCode className="w-2.5 h-2.5" />
                  <span>Python</span>
                </button>
                <button
                  onClick={() => setDocTab("nodejs")}
                  className={`px-3.5 py-1.5 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                    docTab === "nodejs" ? "bg-muted text-foreground border border-border shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileCode className="w-2.5 h-2.5" />
                  <span>NodeJS</span>
                </button>
              </div>
            </div>

            {/* Code Body */}
            <div className="p-5 flex flex-col gap-4 bg-background/20">
              <div className="text-[11px] text-primary/90 font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5" />
                  <span>
                    {docTab === "curl" ? "Shell Command Line (cURL)" : docTab === "python" ? "Python requests script with Polling" : "NodeJS Fetch API client logic"}
                  </span>
                </span>
                
                <button
                  onClick={() => handleCopyCode(codeSnippets[docTab])}
                  className="flex items-center gap-1 bg-card border border-border hover:bg-muted hover:text-white px-3 py-1.5 rounded text-[10px] font-bold cursor-pointer text-foreground transition-colors"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-success" />
                      <span className="text-success">Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Sao chép code</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <pre className="bg-background text-foreground font-mono text-[11px] leading-relaxed p-4 rounded-xl border border-border overflow-x-auto max-h-[380px] whitespace-pre select-text">
                  {codeSnippets[docTab]}
                </pre>
              </div>

              {/* Explanations */}
              <div className="text-[11px] text-muted-foreground space-y-2 mt-1 border-t border-border pt-4">
                <p className="font-semibold text-foreground">💡 Lưu ý quan trọng khi tích hợp hệ thống:</p>
                <ul className="list-disc pl-4 space-y-2">
                  <li>
                    <strong>Xử lý hàng đợi:</strong> Vì worker GPU cần khởi động hoặc bận xử lý yêu cầu song song, trạng thái có thể ở trạng thái <code className="text-primary/90">queued</code> hoặc <code className="text-primary/90">starting_worker</code> trước khi chuyển qua <code className="text-primary/90">running</code>. Vui lòng thiết lập cơ chế kiểm tra tiến trình lặp lại (Polling) như mẫu code Python/NodeJS ở trên.
                  </li>
                  <li>
                    <strong>Tải file âm thanh kết quả:</strong> Khi tệp âm thanh hoàn tất, URL tải file nằm trong trường <code className="text-primary/90 font-mono text-[10px]">audio_url</code> của phản hồi status. Bạn <strong>bắt buộc phải nhúng thêm</strong> Header Authorization Bearer Key vào request GET tải file âm thanh này để xác thực tải thành công.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
