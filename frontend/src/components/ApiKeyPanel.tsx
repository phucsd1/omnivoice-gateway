import React, { useState, useEffect } from "react";
import { KeyRound, Copy, Trash2, Eye, EyeOff, Terminal, FileCode, ChevronDown, ChevronUp, Check, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { api, getApiBaseUrl } from "../api/client";
import type { ApiKeyResponse } from "../api/client";

export const ApiKeyPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [docTab, setDocTab] = useState<"curl" | "python" | "nodejs">("curl");
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const res = await api.getUserApiKeys();
      setApiKeys(res);
    } catch (err) {
      console.error("Lỗi lấy danh sách API Keys:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateApiKey = async () => {
    setCreatingKey(true);
    try {
      // Auto-generate name based on date-time
      const now = new Date();
      const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const autoName = `Khóa API - ${formattedDate}`;
      
      const newKey = await api.createUserApiKey(autoName);
      // Automatically make it visible so they can copy it immediately
      setVisibleKeys((prev) => ({ ...prev, [newKey.id]: true }));
      await fetchApiKeys();
    } catch (err: any) {
      alert("Lỗi tạo API Key: " + err.message);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa API Key này không? Mọi tích hợp bên ngoài dùng key này sẽ ngừng hoạt động.")) return;
    try {
      await api.deleteUserApiKey(keyId);
      await fetchApiKeys();
    } catch (err: any) {
      alert("Lỗi xóa API Key: " + err.message);
    }
  };

  const handleCopyKey = (keyId: string, keyValue: string) => {
    navigator.clipboard.writeText(keyValue);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const activeKey = apiKeys[0]?.key || "YOUR_API_KEY";
  const baseUrl = getApiBaseUrl();

  const codeSnippets = {
    curl: `# 1. Tạo yêu cầu sinh giọng nói (TTS)
curl -X POST "${baseUrl}/v1/tts/jobs" \\
  -H "Authorization: Bearer ${activeKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "auto_voice",
    "text": "Xin chào, đây là giọng đọc nhân bản tự động từ API Gateway.",
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

# 1. Gửi văn bản sinh giọng nói
payload = {
    "mode": "auto_voice", # Hoặc "clone_voice" (yêu cầu voice_sample_id), "voice_design"
    "text": "Xin chào, đây là mã tích hợp mẫu bằng ngôn ngữ Python.",
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
    // 1. Tạo Job
    console.log("Đang tạo Job sinh giọng nói...");
    const res = await fetch(\`\${API_URL}/v1/tts/jobs\`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'auto_voice',
        text: 'Xin chào, đây là mã nguồn nhúng bằng Node.js.',
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden transition-all duration-300">
      {/* Header / Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-850/40 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2 rounded-xl text-indigo-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Quản lý API Keys &amp; Tài liệu Tích hợp</h3>
            <p className="text-[11px] text-slate-450 mt-0.5">
              Tự động tạo mã API và xem hướng dẫn chi tiết cách nhúng trình sinh giọng nói AI vào hệ thống của bạn.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {apiKeys.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {apiKeys.length} Keys
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="border-t border-slate-850 bg-slate-950/40 p-6 flex flex-col gap-6">
          
          {/* API Keys Table & Generation Card */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col gap-3.5 shadow-inner">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <ShieldCheck className="w-4.5 h-4.5" />
                <h4 className="font-bold text-xs text-slate-200">Danh sách mã API Key của bạn</h4>
              </div>
              <button
                type="button"
                onClick={handleCreateApiKey}
                disabled={creatingKey}
                className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>{creatingKey ? "Đang sinh khóa..." : "Tạo API Key mới"}</span>
              </button>
            </div>
            
            <p className="text-[11px] text-slate-455 leading-relaxed -mt-1.5">
              API Key được cấp quyền truy cập đầy đủ các endpoint tạo âm thanh nhân bản. Vui lòng bảo mật các khóa này, không chia sẻ lên mã nguồn công khai.
            </p>

            <div className="overflow-x-auto">
              {loading && apiKeys.length === 0 ? (
                <div className="text-center py-4 text-slate-505 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span>Đang tải các khóa...</span>
                </div>
              ) : apiKeys.length > 0 ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-450 text-[10px] uppercase font-semibold">
                      <th className="py-2 px-1">Tên khóa</th>
                      <th className="py-2 px-1">Mã khóa API</th>
                      <th className="py-2 px-1">Ngày tạo</th>
                      <th className="py-2 px-1">Sử dụng cuối</th>
                      <th className="py-2 px-1 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="border-b border-slate-900/60 hover:bg-slate-900/20">
                        <td className="py-2.5 px-1 font-bold text-slate-200 truncate max-w-[140px]">{k.name}</td>
                        <td className="py-2.5 px-1 font-mono text-[11px] text-indigo-300">
                          <div className="flex items-center gap-1.5">
                            <span>
                              {visibleKeys[k.id] ? k.key : `${k.key.substring(0, 12)}••••••••••••••••••••••••`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setVisibleKeys({ ...visibleKeys, [k.id]: !visibleKeys[k.id] })}
                              className="text-slate-500 hover:text-slate-200 cursor-pointer"
                              title={visibleKeys[k.id] ? "Ẩn" : "Hiện"}
                            >
                              {visibleKeys[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-1 text-slate-455 text-[11px]">
                          {new Date(k.created_at).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="py-2.5 px-1 text-slate-455 text-[11px]">
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("vi-VN") : "Chưa hoạt động"}
                        </td>
                        <td className="py-2.5 px-1 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyKey(k.id, k.key)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
                              title="Sao chép API Key"
                            >
                              {copiedKeyId === k.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteApiKey(k.id)}
                              className="p-1.5 hover:bg-rose-950/20 text-slate-400 hover:text-rose-455 rounded-lg cursor-pointer transition-colors"
                              title="Thu hồi khóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-6 text-slate-500 text-[11px]">
                  Bạn chưa có API Key nào. Bấm nút "Tạo API Key mới" ở góc phải để tạo tự động.
                </div>
              )}
            </div>
          </div>

          {/* Integration Documentation Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
            
            {/* Header documentation tab triggers */}
            <div className="bg-slate-950 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-855 gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">Hướng dẫn nhúng code mẫu tích hợp hệ thống</span>
              </div>
              
              <div className="flex gap-1.5 bg-slate-900 p-0.5 border border-slate-800 rounded-lg self-start sm:self-auto">
                <button
                  onClick={() => setDocTab("curl")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                    docTab === "curl" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Play className="w-2.5 h-2.5" />
                  <span>cURL</span>
                </button>
                <button
                  onClick={() => setDocTab("python")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                    docTab === "python" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileCode className="w-2.5 h-2.5" />
                  <span>Python</span>
                </button>
                <button
                  onClick={() => setDocTab("nodejs")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                    docTab === "nodejs" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileCode className="w-2.5 h-2.5" />
                  <span>NodeJS</span>
                </button>
              </div>
            </div>

            {/* Code Body */}
            <div className="p-4 flex flex-col gap-3 bg-slate-950/20">
              <div className="text-[11px] text-indigo-300 font-semibold flex items-center justify-between">
                <span>
                  {docTab === "curl" ? "Shell Command Line cURL" : docTab === "python" ? "Python requests script polling" : "NodeJS Fetch API client logic"}
                </span>
                
                <button
                  onClick={() => handleCopyCode(codeSnippets[docTab])}
                  className="flex items-center gap-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer text-slate-300 transition-colors"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Chép code</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <pre className="bg-slate-950 text-slate-300 font-mono text-[11px] leading-relaxed p-4 rounded-xl border border-slate-900 overflow-x-auto max-h-[290px] whitespace-pre select-text">
                  {codeSnippets[docTab]}
                </pre>
              </div>

              {/* Explanations */}
              <div className="text-[11px] text-slate-400 space-y-2 mt-1 border-t border-slate-850/60 pt-3">
                <p className="font-semibold text-slate-300">💡 Lưu ý quan trọng khi tích hợp:</p>
                <ul className="list-disc pl-4 space-y-1.5">
                  <li>
                    <strong>Xác thực:</strong> Gửi token qua header <code className="bg-slate-950 text-indigo-300 px-1 py-0.5 rounded font-mono text-[10px]">Authorization: Bearer YOUR_API_KEY</code> cho tất cả các endpoint.
                  </li>
                  <li>
                    <strong>Tải file kết quả:</strong> Khi tệp âm thanh hoàn tất, URL tải file nằm trong trường <code className="text-indigo-300 font-mono text-[10px]">audio_url</code> của phản hồi status. Bạn <strong>bắt buộc phải nhúng thêm</strong> Header Authorization Bearer Key vào request GET tải file âm thanh này để xác thực tải thành công.
                  </li>
                  <li>
                    <strong>Tốc độ sinh &amp; Số bước (Speed &amp; Step):</strong> Bạn có thể điều khiển tốc độ qua trường <code className="text-indigo-300 font-mono text-[10px]">"speed"</code> (từ 0.5 đến 2.0) và chất lượng qua trường <code className="text-indigo-300 font-mono text-[10px]">"num_step"</code> (16 đến 64 bước).
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2050/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 4v16m8-8H4"
    ></path>
  </svg>
);
