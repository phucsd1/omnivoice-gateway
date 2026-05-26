import { useState, useEffect } from "react";
import { Sparkles, Radio, CheckCircle, XCircle, RefreshCw, Layers } from "lucide-react";
import { api } from "./api/client";

import { VoiceSampleUpload } from "./components/VoiceSampleUpload";
import { VoiceDesignPanel } from "./components/VoiceDesignPanel";
import { TTSPanel } from "./components/TTSPanel";
import { SettingsPanel } from "./components/SettingsPanel";


function App() {
  const [activeVoiceSampleId, setActiveVoiceSampleId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [apiBaseUrl, setApiBaseUrl] = useState("");

  const checkHealth = async () => {
    setConnectionStatus("checking");
    try {
      await api.getHealth();
      setConnectionStatus("connected");
    } catch (err) {
      console.error("Health check failed", err);
      setConnectionStatus("disconnected");
    }
  };


  useEffect(() => {
    setApiBaseUrl(api.getApiBaseUrl() || window.location.origin);
    checkHealth();
  }, []);

  const handleVoiceSampleActive = (sampleId: string) => {
    setActiveVoiceSampleId(sampleId);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Background patterns */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/10">
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
              <span>OmniVoice On-Demand Gateway</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                MVP
              </span>
            </h1>
            <span className="text-xs text-slate-400 font-semibold">
              Lightning AI FastAPI &nbsp;•&nbsp; Kaggle GPU Worker &nbsp;•&nbsp; OmniVoice
            </span>
          </div>
        </div>

        {/* API Info & Health */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-900 border border-slate-850 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <span>Base API: {apiBaseUrl}</span>
          </div>

          <div className="flex items-center gap-2">
            {connectionStatus === "checking" && (
              <span className="bg-slate-900 border border-slate-850 text-slate-450 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Checking gateway...</span>
              </span>
            )}
            {connectionStatus === "connected" && (
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Gateway OK</span>
              </span>
            )}
            {connectionStatus === "disconnected" && (
              <span className="bg-rose-500/10 border border-rose-500/20 text-rose-450 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                <span>Gateway Offline</span>
              </span>
            )}

            <button
              onClick={checkHealth}
              className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-350 hover:text-white transition-colors cursor-pointer"
              title="Refresh Health"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow p-6 max-w-7xl w-full mx-auto flex flex-col gap-6 relative">
        {/* Settings Panel */}
        <SettingsPanel />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Voice setups */}
          <section className="flex flex-col gap-6">
            <VoiceSampleUpload onUploadSuccess={handleVoiceSampleActive} />
            <VoiceDesignPanel onAcceptSuccess={handleVoiceSampleActive} />
          </section>

          {/* Right Column - Generation & Jobs */}
          <section className="flex flex-col gap-6">
            {/* Info select helper */}
            {activeVoiceSampleId ? (
              <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/25 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-500/10 p-2 rounded-xl text-indigo-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">
                      Giọng mẫu đã chọn
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-200 truncate max-w-[200px] sm:max-w-[300px]">
                      {activeVoiceSampleId}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveVoiceSampleId(null)}
                  className="text-xs hover:text-white text-slate-450 border border-slate-800/80 hover:border-slate-700 bg-slate-950 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer font-bold"
                >
                  Hủy chọn
                </button>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800/50 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-450">
                <Layers className="w-5 h-5 text-slate-650" />
                <span>Chưa chọn mẫu giọng. Vui lòng Tải lên một mẫu hoặc Tạo thiết kế giọng ở cột bên trái để bắt đầu Clone.</span>
              </div>
            )}

            <TTSPanel activeVoiceSampleId={activeVoiceSampleId} />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 font-semibold bg-slate-950/40">
        OmniVoice On-Demand Gateway MVP &copy; {new Date().getFullYear()} &nbsp;•&nbsp; Built for High-Performance Audio Synthesis
      </footer>
    </div>
  );
}

export default App;
