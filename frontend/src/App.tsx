import { useState, useEffect } from "react";
import { Sparkles, Radio, RefreshCw, Layers, LogOut, Server, KeyRound, BookOpen, Sun, Moon, Monitor, Volume2, Menu, X } from "lucide-react";
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
import { VoiceLibraryPanel } from "./components/VoiceLibraryPanel";

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("VITE_JWT_TOKEN"));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"workspace" | "library" | "history" | "docs" | "admin" >("workspace");
  
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("theme") as "light" | "dark" | "system") || "dark";
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
    const handleHashChange = () => {
      if (window.location.hash === "#/docs") {
        setActiveTab("docs");
      } else if (window.location.hash === "#/" || window.location.hash === "") {
        setActiveTab("workspace");
      }
    };
    window.addEventListener("hashchange", handleHashChange);

    if (window.location.hash === "#/docs") {
      setActiveTab("docs");
    }

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigateToTab = (tab: "workspace" | "library" | "history" | "docs" | "admin") => {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab === "docs") {
      window.location.hash = "#/docs";
    } else {
      window.location.hash = "#/";
    }
  };

  const [currentUser, setCurrentUser] = useState<{ username: string; is_admin: boolean } | null>(null);
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

  const fetchSettings = async () => {
    try {
      const res = await api.getSettings();
      if (!res.kaggle_username || !res.kaggle_key_configured) {
        setKaggleStatus("unconfigured");
      } else {
        setKaggleStatus("connected");
      }
    } catch (err) {
      console.error("Lỗi lấy cấu hình hệ thống:", err);
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
  };

  useEffect(() => {
    setApiBaseUrl(api.getApiBaseUrl() || window.location.origin);
    checkHealth();
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser();
      fetchSettings();
    } else {
      setCurrentUser(null);
    }
  }, [token]);

  const handleVoiceSampleActive = (sampleId: string) => {
    setActiveVoiceSampleId(sampleId);
  };

  if (!token) {
    return <LoginRegister onLoginSuccess={(t) => setToken(t)} />;
  }

  // AI Agent Orb configuration based on system health and Kaggle status
  let orbColorClass = "bg-slate-600";
  let orbPulseClass = "";
  let orbLabel = "GPU Agent: Ngoại tuyến";
  let orbDesc = "Không có kết nối với máy chủ";

  if (connectionStatus === "disconnected") {
    orbColorClass = "bg-rose-500";
    orbPulseClass = "animate-orb-red";
    orbLabel = "GPU Agent: Lỗi kết nối";
    orbDesc = "Gateway offline";
  } else if (kaggleStatus === "unconfigured") {
    orbColorClass = "bg-slate-600";
    orbLabel = "GPU Agent: Chưa thiết lập";
    orbDesc = "Cần cấu hình Kaggle";
  } else if (kaggleStatus === "error") {
    orbColorClass = "bg-rose-500";
    orbPulseClass = "animate-orb-red";
    orbLabel = "GPU Agent: Lỗi kết nối";
    orbDesc = "Kiểm tra thông số Kaggle";
  } else {
    // Standard connected
    orbColorClass = "bg-emerald-500";
    orbPulseClass = "animate-orb-green";
    orbLabel = "GPU Agent: Sẵn sàng";
    orbDesc = "Đang chờ tác vụ mới";
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 select-none">
      {/* Brand Logo & Name */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2 rounded-xl shadow-md shadow-indigo-500/10 shrink-0">
          <Radio className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="text-base font-bold tracking-tight text-slate-100 flex items-center gap-1.5 leading-none">
            <span>OmniVoice</span>
            <span className="text-[9px] bg-indigo-500/20 text-indigo-300 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Gateway
            </span>
          </h2>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 truncate">
            Lightning AI Dashboard
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-grow p-4 flex flex-col gap-1.5 overflow-y-auto">
        <button
          onClick={() => navigateToTab("workspace")}
          className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
            activeTab === "workspace"
              ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/50"
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Không gian làm việc</span>
        </button>

        <button
          onClick={() => navigateToTab("library")}
          className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
            activeTab === "library"
              ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/50"
          }`}
        >
          <Volume2 className="w-4 h-4 shrink-0" />
          <span>Thư viện giọng nói</span>
        </button>

        <button
          onClick={() => navigateToTab("history")}
          className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
            activeTab === "history"
              ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/50"
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span>Lịch sử tác vụ</span>
        </button>

        <button
          onClick={() => navigateToTab("docs")}
          className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
            activeTab === "docs"
              ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/50"
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>Tài liệu API</span>
        </button>

        {currentUser?.is_admin && (
          <button
            onClick={() => navigateToTab("admin")}
            className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "admin"
                ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/50"
            }`}
          >
            <Server className="w-4 h-4 shrink-0" />
            <span>Cổng quản trị (Admin)</span>
          </button>
        )}
      </nav>

      {/* AI Agent Status Orb Box */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/60 mx-4 my-2 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-3.5 h-3.5 rounded-full shrink-0 relative ${orbColorClass} ${orbPulseClass}`} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-slate-200 truncate">{orbLabel}</span>
            <span className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">{orbDesc}</span>
          </div>
        </div>
      </div>

      {/* Footer Profile & Actions */}
      <div className="p-4 border-t border-slate-800 flex flex-col gap-3">
        {currentUser && (
          <div className="flex items-center justify-between gap-2 bg-slate-850/30 border border-slate-800/80 px-3 py-2.5 rounded-xl">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-slate-250 truncate">@{currentUser.username}</span>
              <span className="text-[9px] text-slate-550 font-bold uppercase tracking-wider mt-0.5">
                {currentUser.is_admin ? "Administrator" : "Standard User"}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex-grow py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-bold text-slate-300 hover:text-slate-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            title="Cấu hình Kaggle"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Kaggle</span>
          </button>

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex-grow py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-bold text-slate-300 hover:text-slate-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            title="API Keys"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Keys</span>
          </button>

          <button
            onClick={() => {
              setTheme(prev => {
                if (prev === "system") return "light";
                if (prev === "light") return "dark";
                return "system";
              });
            }}
            className="px-2.5 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-slate-100 transition-colors cursor-pointer shrink-0"
            title={`Giao diện: ${theme === "system" ? "Tự động" : theme === "light" ? "Sáng" : "Tối"}`}
          >
            {theme === "system" && <Monitor className="w-3.5 h-3.5" />}
            {theme === "light" && <Sun className="w-3.5 h-3.5 text-amber-500" />}
            {theme === "dark" && <Moon className="w-3.5 h-3.5 text-indigo-400" />}
          </button>
        </div>

        {/* Mini stats */}
        <div className="flex items-center justify-between text-[10px] text-slate-600 font-mono px-1">
          <span>Gateway: {connectionStatus === "connected" ? "Online" : "Offline"}</span>
          <button 
            onClick={checkHealth}
            className="hover:text-slate-400 cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span>Reload</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans select-none overflow-x-hidden relative">
      {/* Background glow animations */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:block w-64 h-screen fixed top-0 left-0 shrink-0 z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />
          {/* Drawer menu */}
          <div className="relative w-64 max-w-xs h-full flex-col z-50 animate-fadeIn">
            {sidebarContent}
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 -right-12 p-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-grow flex flex-col min-w-0 lg:pl-64 min-h-screen">
        {/* Mobile Header Topbar */}
        <header className="lg:hidden sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-slate-900 border border-slate-850 rounded-xl text-slate-300"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-1.5 rounded-lg">
                <Radio className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight text-slate-100">OmniVoice</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connectionStatus === "connected" ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="text-[10px] font-mono text-slate-400 select-all truncate max-w-[120px]">
              {apiBaseUrl}
            </span>
          </div>
        </header>

        {/* Pages Content Area */}
        <main className="flex-grow p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto flex flex-col gap-6 relative">
          
          {/* Modals */}
          <SettingsPanel
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            onStatusChange={(status) => setKaggleStatus(status)}
          />

          <ApiKeyPanel
            isOpen={showApiKeyModal}
            onClose={() => setShowApiKeyModal(false)}
            onNavigateToDocs={() => navigateToTab("docs")}
          />

          {/* Active view mapping */}
          {activeTab === "workspace" && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              
              {/* Left Column (2/3 width) - TTS Interface */}
              <section className="xl:col-span-2 flex flex-col gap-6">
                <TTSPanel 
                  activeVoiceSampleId={activeVoiceSampleId} 
                  onJobCreatedOrUpdated={handleJobCreatedOrUpdated}
                  layout="modern"
                />
              </section>

              {/* Right Column (1/3 width) - Voice Configuration */}
              <section className="xl:col-span-1 flex flex-col gap-6">
                {activeVoiceSampleId ? (
                  <div className="bg-gradient-to-tr from-indigo-950/20 to-purple-950/20 border border-indigo-500/20 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-500/10 p-2 rounded-xl text-indigo-400">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                          Mẫu giọng hoạt động
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-200 truncate max-w-[150px] sm:max-w-[200px]">
                          {activeVoiceSampleId}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveVoiceSampleId(null)}
                      className="text-xs hover:text-slate-100 text-slate-300 border border-slate-800 bg-slate-900 hover:bg-slate-850 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer font-bold shrink-0"
                    >
                      Hủy chọn
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-400 shadow-sm">
                    <Layers className="w-5 h-5 text-indigo-400 shrink-0 animate-pulse" />
                    <span>Chưa chọn mẫu giọng. Vui lòng tải một mẫu giọng hoặc thiết kế giọng nói để bắt đầu clone.</span>
                  </div>
                )}

                <VoiceSampleUpload onUploadSuccess={handleVoiceSampleActive} layout="modern" />
                <VoiceDesignPanel 
                  onAcceptSuccess={handleVoiceSampleActive} 
                  onJobCreatedOrUpdated={handleJobCreatedOrUpdated}
                  layout="modern"
                />
              </section>
            </div>
          )}

          {activeTab === "library" && (
            <div className="w-full animate-fadeIn">
              <VoiceLibraryPanel 
                onUseVoice={(id) => { 
                  setActiveVoiceSampleId(id); 
                  navigateToTab("workspace"); 
                }} 
                layout="modern" 
              />
            </div>
          )}

          {activeTab === "history" && (
            <div className="w-full animate-fadeIn">
              <JobHistoryPanel refreshTrigger={refreshHistory} layout="modern" />
            </div>
          )}

          {activeTab === "docs" && (
            <div className="w-full animate-fadeIn">
              <ApiDocsPage onBack={() => navigateToTab("workspace")} isLoggedIn={true} />
            </div>
          )}

          {activeTab === "admin" && currentUser?.is_admin && (
            <div className="w-full animate-fadeIn">
              <AdminDashboard onBack={() => navigateToTab("workspace")} onSettingsChanged={fetchSettings} />
            </div>
          )}

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900/60 py-6 text-center text-[10px] text-slate-600 font-semibold bg-slate-950/20 mt-auto">
          OmniVoice On-Demand Gateway MVP &copy; {new Date().getFullYear()} &nbsp;•&nbsp; Built for High-Performance Audio Synthesis
        </footer>
      </div>
    </div>
  );
}

export default App;
