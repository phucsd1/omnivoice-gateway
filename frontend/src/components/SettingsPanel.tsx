import React, { useState, useEffect } from "react";
import { Settings, Save, CheckCircle, AlertCircle, Key, ChevronDown, ChevronUp, HelpCircle, ExternalLink, Eye, EyeOff, Copy, Trash2, KeyRound } from "lucide-react";
import { api } from "../api/client";
import type { SystemSettings, UserMeResponse } from "../api/client";

export const SettingsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<SystemSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<UserMeResponse | null>(null);
  
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pushingNotebook, setPushingNotebook] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revokingKey, setRevokingKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string; url?: string } | null>(null);

  const fetchUser = async () => {
    try {
      const res = await api.getMe();
      setCurrentUser(res);
    } catch (err) {
      console.error("Lỗi lấy thông tin user:", err);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getSettings();
      setConfig(res);
      setUsername(res.kaggle_username);
    } catch (err: any) {
      console.error("Lỗi tải cấu hình:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchUser();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    setConnectionResult(null);

    const payload: any = {
      kaggle_username: username,
    };
    if (key.trim()) {
      payload.kaggle_key = key;
    }

    try {
      const res = await api.updateSettings(payload);
      setStatusMsg({ type: "success", text: res.message });
      setKey(""); // Clear password field
      fetchSettings(); // Refresh configuration status
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi lưu cấu hình." });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    setStatusMsg(null);
    try {
      const res = await api.testKaggleConnection();
      setConnectionResult(res);
    } catch (err: any) {
      setConnectionResult({
        success: false,
        message: err.message || "Không thể kết nối đến máy chủ API hoặc lệnh kiểm tra thất bại.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handlePushNotebook = async () => {
    setPushingNotebook(true);
    setPushResult(null);
    setStatusMsg(null);
    setConnectionResult(null);
    try {
      const res = await api.pushNotebook();
      setPushResult(res);
    } catch (err: any) {
      setPushResult({
        success: false,
        message: err.message || "Lỗi hệ thống khi đẩy notebook lên Kaggle.",
      });
    } finally {
      setPushingNotebook(false);
    }
  };

  const handleGenerateApiKey = async () => {
    setGeneratingKey(true);
    try {
      await api.generateApiKey();
      await fetchUser();
    } catch (err) {
      console.error("Lỗi tạo API Key:", err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn thu hồi API Key hiện tại không? Tất cả tích hợp từ bên ngoài dùng key này sẽ ngừng hoạt động.")) return;
    setRevokingKey(true);
    try {
      await api.revokeApiKey();
      await fetchUser();
    } catch (err) {
      console.error("Lỗi thu hồi API Key:", err);
    } finally {
      setRevokingKey(false);
    }
  };

  const handleCopyApiKey = () => {
    if (currentUser?.api_key) {
      navigator.clipboard.writeText(currentUser.api_key);
      alert("Đã sao chép API Key thành công vào Clipboard!");
    }
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
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Cấu hình Hệ thống &amp; API Key</h3>
            <p className="text-[11px] text-slate-450 mt-0.5">
              Cài đặt Kaggle Credentials và lấy mã API để tự động sinh giọng nói nhân bản AI.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {config && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                config.worker_mode === "kaggle"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              Mode: {config.worker_mode}
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Collapsible Panel content */}
      {isOpen && (
        <div className="border-t border-slate-850 p-6 bg-slate-950/40 flex flex-col gap-6">
          
          {/* User API Key Section */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col gap-3 shadow-inner">
            <div className="flex items-center gap-2 text-indigo-400">
              <KeyRound className="w-4 h-4" />
              <h4 className="font-bold text-xs text-slate-200">Quản lý API Key người dùng ({currentUser?.username})</h4>
            </div>
            <p className="text-[11px] text-slate-450 leading-relaxed">
              Khóa API cho phép bạn gửi yêu cầu sinh giọng nói bằng code từ các ứng dụng hoặc script bên ngoài thông qua API Gateway.
            </p>
            
            <div className="flex flex-col gap-2 mt-1">
              {currentUser?.api_key ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-grow relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={currentUser.api_key}
                      readOnly
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-3.5 pr-10 text-xs text-indigo-300 font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                      title={showApiKey ? "Ẩn API Key" : "Hiển thị API Key"}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyApiKey}
                      className="bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-bold px-3 py-2 rounded-lg text-slate-200 hover:text-white cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleGenerateApiKey}
                      disabled={generatingKey}
                      className="bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-bold px-3 py-2 rounded-lg text-slate-200 hover:text-white cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <span>Tạo mới</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleRevokeApiKey}
                      disabled={revokingKey}
                      className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold px-3 py-2 rounded-lg text-rose-400 hover:text-rose-350 cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Thu hồi</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs text-slate-450">
                  <span>Bạn chưa tạo API Key nào.</span>
                  <button
                    type="button"
                    onClick={handleGenerateApiKey}
                    disabled={generatingKey}
                    className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    {generatingKey ? "Đang tạo..." : "Tạo khóa API"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hướng dẫn lấy API Key */}
            <div className="md:col-span-2 bg-indigo-950/20 border border-indigo-500/25 rounded-xl p-4 flex flex-col gap-2.5 backdrop-blur-sm shadow-inner">
              <div className="flex items-center gap-2 text-indigo-400">
                <HelpCircle className="w-4 h-4 flex-shrink-0" />
                <h4 className="font-semibold text-xs text-slate-200">Hướng dẫn cấu hình kết nối Kaggle</h4>
              </div>
              <div className="text-[11px] text-slate-400 space-y-2.5">
                <div className="flex gap-2.5">
                  <span className="flex-shrink-0 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-full w-4.5 h-4.5 flex items-center justify-center font-bold text-[9px] shadow-sm">1</span>
                  <p className="leading-relaxed">
                    Truy cập trang cấu hình tài khoản Kaggle của bạn:{" "}
                    <a
                      href="https://www.kaggle.com/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 font-medium underline inline-flex items-center gap-0.5 group transition-colors"
                    >
                      Kaggle Settings
                      <ExternalLink className="w-2.5 h-2.5 inline-block transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </a>
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <span className="flex-shrink-0 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-full w-4.5 h-4.5 flex items-center justify-center font-bold text-[9px] shadow-sm">2</span>
                  <p className="leading-relaxed">
                    Cuộn xuống phần <span className="text-slate-200 font-semibold text-indigo-300">API</span> và nhấn nút <span className="text-slate-200 font-semibold bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">Create New Token</span> để tải về tệp <span className="text-amber-400 font-mono font-medium">kaggle.json</span>.
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <span className="flex-shrink-0 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-full w-4.5 h-4.5 flex items-center justify-center font-bold text-[9px] shadow-sm">3</span>
                  <p className="leading-relaxed">
                    Mở tệp <span className="text-amber-400 font-mono font-medium">kaggle.json</span> bằng Notepad, sao chép giá trị của <span className="font-mono text-indigo-300">"username"</span> dán vào ô <span className="text-slate-300">Kaggle Username</span> bên dưới, và <span className="font-mono text-indigo-300">"key"</span> dán vào ô <span className="text-slate-300">Kaggle API Key</span> bên dưới.
                  </p>
                </div>
              </div>
            </div>

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-450">Kaggle Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập Kaggle Username..."
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>

            {/* API Key */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-450">Kaggle API Key</label>
                {config?.kaggle_key_configured && (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <Key className="w-2.5 h-2.5" />
                    <span>Đã cấu hình</span>
                  </span>
                )}
              </div>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={config?.kaggle_key_configured ? "•••••••••••••••• (Nhập để cập nhật mới)" : "Nhập Kaggle API Key..."}
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                required={!config?.kaggle_key_configured}
              />
            </div>

            {statusMsg && (
              <div
                className="md:col-span-2 p-3 rounded-lg text-xs border flex items-center gap-1.5 bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              >
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{statusMsg.text}</span>
              </div>
            )}

            {connectionResult && (
              <div
                className={`md:col-span-2 p-3 rounded-lg text-xs border flex items-start gap-1.5 ${
                  connectionResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-450"
                }`}
              >
                {connectionResult.success ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span className="break-all">{connectionResult.message}</span>
              </div>
            )}

            {pushResult && (
              <div
                className={`md:col-span-2 p-4 rounded-xl text-xs border flex flex-col gap-2.5 ${
                  pushResult.success
                    ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-450"
                }`}
              >
                <div className="flex items-start gap-1.5">
                  {pushResult.success ? (
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
                  )}
                  <span className="break-all font-medium">{pushResult.message}</span>
                </div>
                {pushResult.success && pushResult.url && (
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 text-[11px] text-slate-400 flex flex-col gap-2">
                    <p className="font-semibold text-slate-200">Thông báo từ hệ thống Batch Worker:</p>
                    <p className="leading-relaxed text-slate-400">
                      Notebook thử nghiệm đã được đẩy thành công lên Kaggle (
                      <a
                        href={pushResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 font-bold underline inline-flex items-center gap-0.5"
                      >
                        Xem trên Kaggle
                        <ExternalLink className="w-3 h-3 inline-block" />
                      </a>
                      ).
                    </p>
                    <p className="leading-relaxed text-slate-400">
                      Hệ thống đã chuyển sang mô hình <strong className="text-indigo-300">Kaggle Batch Job (Push-and-Poll)</strong> tự động hoàn toàn. Mỗi khi bạn gửi yêu cầu tạo âm thanh, backend sẽ tự tạo file script, tự động đẩy lên Kaggle dưới dạng batch job và poll tải file âm thanh kết quả về. Bạn <strong className="text-amber-450 font-semibold">không cần</strong> bật máy ảo hoặc chạy cell thủ công trên Kaggle.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="md:col-span-2 flex items-center justify-between flex-wrap gap-3 mt-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection || loading || saving || pushingNotebook}
                  className="flex items-center gap-1.5 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer border border-slate-750/80 disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang kiểm tra kết nối...</span>
                    </>
                  ) : (
                    <span>Kiểm tra kết nối Kaggle</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePushNotebook}
                  disabled={pushingNotebook || loading || saving || testingConnection}
                  className="flex items-center gap-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-400 hover:text-indigo-300 font-bold text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer border border-indigo-500/20 disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {pushingNotebook ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang đẩy Notebook...</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Đẩy Notebook lên Kaggle</span>
                    </>
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={saving || loading || testingConnection || pushingNotebook}
                className="flex items-center gap-1.5 bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer shadow-md shadow-indigo-650/10 disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu Cấu Hình</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);
