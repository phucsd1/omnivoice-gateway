import React, { useState, useEffect } from "react";
import { Settings, Save, CheckCircle, AlertCircle, Key, ChevronDown, ChevronUp, HelpCircle, ExternalLink } from "lucide-react";
import { api } from "../api/client";
import type { SystemSettings } from "../api/client";

export const SettingsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<SystemSettings | null>(null);
  
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);

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
            <h3 className="font-bold text-slate-100 text-sm">Cấu hình Kaggle Credentials</h3>
            <p className="text-[11px] text-slate-450 mt-0.5">
              Cài đặt Kaggle Username và API Key để kích hoạt máy chủ xử lý giọng nói GPU tự động.
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
        <div className="border-t border-slate-850 p-6 bg-slate-950/40">
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hướng dẫn lấy API Key */}
            <div className="md:col-span-2 bg-indigo-950/20 border border-indigo-500/25 rounded-xl p-4 flex flex-col gap-2.5 backdrop-blur-sm shadow-inner">
              <div className="flex items-center gap-2 text-indigo-400">
                <HelpCircle className="w-4 h-4 flex-shrink-0" />
                <h4 className="font-semibold text-xs text-slate-200">Hướng dẫn lấy Kaggle API Key</h4>
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

            <div className="md:col-span-2 flex items-center justify-between gap-3 mt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection || loading || saving}
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
                type="submit"
                disabled={saving || loading || testingConnection}
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
