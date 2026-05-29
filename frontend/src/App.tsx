import { useState, useEffect } from "react";
import { Sparkles, Radio, CheckCircle, XCircle, RefreshCw, Layers, LogOut, Server, KeyRound, BookOpen, Sun, Moon, Monitor } from "lucide-react";
import { api } from "./api/client";

import { VoiceSampleUpload } from "./components/VoiceSampleUpload";
import { VoiceDesignPanel } from "./components/VoiceDesignPanel";
import { TTSPanel } from "./components/TTSPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ApiKeyPanel } from "./components/ApiKeyPanel";
import { ApiDocsPage } from "./components/ApiDocsPage";
import { LoginRegister } from "./components/LoginRegister";
import { AdminDashboard } from "./components/AdminDashboard";
import { JobHistoryPanel } from "./components/JobHistoryPanel";

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("VITE_JWT_TOKEN"));
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("theme") as "light" | "dark" | "system") || "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (themeName: "light" | "dark" | "system") => {
      root.classList.remove("light", "dark");
      
      if (themeName === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(themeName);
      }
    };

    applyTheme(theme);
    localStorage.setItem("theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handleLocationChange);

    const handleHashChange = () => {
      if (window.location.hash === "#/docs") {
        setCurrentPath("/docs");
      } else if (window.location.hash === "#/" || window.location.hash === "") {
        setCurrentPath("/");
      }
    };
    window.addEventListener("hashchange", handleHashChange);

    if (window.location.hash === "#/docs") {
      setCurrentPath("/docs");
    }

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };
  const [currentUser, setCurrentUser] = useState<{ username: string; is_admin: boolean } | null>(null);
  const [showAdminPortal, setShowAdminPortal] = useState(false);
  const [activeVoiceSampleId, setActiveVoiceSampleId] = useState<string | null>(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const handleJobCreatedOrUpdated = () => {
    setRefreshHistory(prev => prev + 1);
  };
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [kaggleStatus, setKaggleStatus] = useState<"unconfigured" | "connected" | "error">("unconfigured");

  const fetchKaggleStatus = async () => {
    try {
      const res = await api.getSettings();
      if (!res.kaggle_username || !res.kaggle_key_configured) {
        setKaggleStatus("unconfigured");
      } else {
        setKaggleStatus("connected");
      }
    } catch (err) {
      console.error("Lỗi lấy thông tin kết nối Kaggle:", err);
    }
  };

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

  const fetchUser = async () => {
    try {
      const res = await api.getMe();
      setCurrentUser(res);
    } catch (err) {
      console.error("Lỗi lấy thông tin user:", err);
      handleLogout();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("VITE_JWT_TOKEN");
    setToken(null);
    setCurrentUser(null);
    setShowAdminPortal(false);
  };

  useEffect(() => {
    setApiBaseUrl(api.getApiBaseUrl() || window.location.origin);
    checkHealth();
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser();
      fetchKaggleStatus();
    } else {
      setCurrentUser(null);
    }
  }, [token]);

  const handleVoiceSampleActive = (sampleId: string) => {
    setActiveVoiceSampleId(sampleId);
  };

  if (currentPath === "/docs") {
    return <ApiDocsPage onBack={() => navigateTo("/")} isLoggedIn={!!token} />;
  }

  if (!token) {
    return <LoginRegister onLoginSuccess={(t) => setToken(t)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Background patterns */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/10">
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight text-slate-100 flex items-center gap-1.5">
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

        {/* API Info & Health & User Profile */}
        <div className="flex flex-wrap items-center gap-3">
          {currentUser && (
            <>
              {/* Kaggle Connection Status Button */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  kaggleStatus === "connected"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    : kaggleStatus === "error"
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 animate-pulse"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`}
                title="Cấu hình kết nối máy chủ Kaggle GPU"
              >
                <Server className="w-3.5 h-3.5" />
                <span>
                  Kaggle: {kaggleStatus === "connected" ? "Đã kết nối" : kaggleStatus === "error" ? "Lỗi kết nối" : "Chưa thiết lập"}
                </span>
              </button>

              {/* API Keys Manager Button */}
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-slate-100 transition-all cursor-pointer flex items-center gap-1.5"
                title="Quản lý các API Keys của bạn"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>API Keys</span>
              </button>

              {/* API Docs Button */}
              <button
                onClick={() => navigateTo("/docs")}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-slate-100 transition-all cursor-pointer flex items-center gap-1.5"
                title="Tài liệu hướng dẫn nhúng & tích hợp hệ thống"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Tài liệu API</span>
              </button>

              {/* Theme Toggler Button */}
              <button
                onClick={() => {
                  setTheme(prev => {
                    if (prev === "system") return "light";
                    if (prev === "light") return "dark";
                    return "system";
                  });
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-slate-100 transition-all cursor-pointer flex items-center gap-1.5"
                title={`Giao diện: ${theme === "system" ? "Tự động" : theme === "light" ? "Sáng" : "Tối"}`}
              >
                {theme === "system" && <Monitor className="w-3.5 h-3.5 text-slate-400" />}
                {theme === "light" && <Sun className="w-3.5 h-3.5 text-amber-500" />}
                {theme === "dark" && <Moon className="w-3.5 h-3.5 text-indigo-400" />}
                <span className="capitalize hidden sm:inline">{theme === "system" ? "Tự động" : theme === "light" ? "Sáng" : "Tối"}</span>
              </button>

              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-inner">
                <span className="text-indigo-400">@{currentUser.username}</span>
                <span className="text-slate-800">|</span>
                {currentUser.is_admin && (
                  <>
                    <button
                      onClick={() => setShowAdminPortal(!showAdminPortal)}
                      className="text-amber-400 hover:text-amber-300 font-bold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>{showAdminPortal ? "Main View" : "Admin Portal"}</span>
                    </button>
                    <span className="text-slate-800">|</span>
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1"
                  title="Đăng xuất"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </>
          )}

          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono text-slate-400 flex items-center gap-2 select-none">
            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${connectionStatus === "connected" ? "bg-emerald-500" : connectionStatus === "checking" ? "bg-amber-500 animate-pulse" : "bg-rose-500"}`} />
            <span className="text-slate-500">API:</span>
            <span className="text-slate-300 font-mono text-xs select-all">
              {apiBaseUrl}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {connectionStatus === "checking" && (
              <span className="bg-slate-900 border border-slate-800 text-slate-400 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
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
              <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                <span>Gateway Offline</span>
              </span>
            )}

            <button
              onClick={checkHealth}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh Health"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow p-6 max-w-7xl w-full mx-auto flex flex-col gap-6 relative">
        {showAdminPortal ? (
          <AdminDashboard onBack={() => setShowAdminPortal(false)} />
        ) : (
          <>
            {/* Settings Modal */}
            <SettingsPanel
              isOpen={showSettingsModal}
              onClose={() => setShowSettingsModal(false)}
              onStatusChange={(status) => setKaggleStatus(status)}
            />

            {/* API Keys & Documentation Modal */}
            <ApiKeyPanel
              isOpen={showApiKeyModal}
              onClose={() => setShowApiKeyModal(false)}
              onNavigateToDocs={() => {
                setShowApiKeyModal(false);
                navigateTo("/docs");
              }}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Voice setups */}
              <section className="flex flex-col gap-6">
                <VoiceSampleUpload onUploadSuccess={handleVoiceSampleActive} />
                <VoiceDesignPanel 
                  onAcceptSuccess={handleVoiceSampleActive} 
                  onJobCreatedOrUpdated={handleJobCreatedOrUpdated}
                />
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
                      className="text-xs hover:text-white text-slate-400 border border-slate-800/80 hover:border-slate-700 bg-slate-950 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer font-bold"
                    >
                      Hủy chọn
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800/50 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-400">
                    <Layers className="w-5 h-5 text-slate-600" />
                    <span>Chưa chọn mẫu giọng. Vui lòng Tải lên một mẫu hoặc Tạo thiết kế giọng ở cột bên trái để bắt đầu Clone.</span>
                  </div>
                )}

                <TTSPanel 
                  activeVoiceSampleId={activeVoiceSampleId} 
                  onJobCreatedOrUpdated={handleJobCreatedOrUpdated}
                />
              </section>
            </div>

            {/* Job History Panel */}
            <JobHistoryPanel refreshTrigger={refreshHistory} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 font-semibold bg-slate-950/40">
        OmniVoice On-Demand Gateway MVP &copy; {new Date().getFullYear()} &nbsp;•&nbsp; Built for High-Performance Audio Synthesis
      </footer>
    </div>
  );
}

export default App;
