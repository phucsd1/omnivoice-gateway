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
  let orbColorClass = "bg-muted-foreground";
  let orbPulseClass = "";
  let orbLabel = "GPU Agent: Ngoại tuyến";
  let orbDesc = "Không có kết nối với máy chủ";

  if (connectionStatus === "disconnected") {
    orbColorClass = "bg-destructive";
    orbPulseClass = "animate-orb-red";
    orbLabel = "GPU Agent: Lỗi kết nối";
    orbDesc = "Gateway offline";
  } else if (kaggleStatus === "unconfigured") {
    orbColorClass = "bg-muted-foreground";
    orbLabel = "GPU Agent: Chưa thiết lập";
    orbDesc = "Cần cấu hình Kaggle";
  } else if (kaggleStatus === "error") {
    orbColorClass = "bg-destructive";
    orbPulseClass = "animate-orb-red";
    orbLabel = "GPU Agent: Lỗi kết nối";
    orbDesc = "Kiểm tra thông số Kaggle";
  } else {
    orbColorClass = "bg-success";
    orbPulseClass = "animate-orb-green";
    orbLabel = "GPU Agent: Sẵn sàng";
    orbDesc = "Đang chờ tác vụ mới";
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card border-r border-border text-foreground select-none">
      <div className="p-4 border-b border-border flex items-center gap-3 shrink-0">
        <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2 rounded-xl shadow-md shadow-indigo-500/10 shrink-0">
          <Radio className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5 leading-none">
            <span>OmniVoice</span>
            <span className="text-[9px] bg-primary/20 text-primary/90 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Gateway
            </span>
          </h2>
          <span className="text-[10px] text-muted-foreground font-semibold mt-1 truncate">
            Lightning AI Dashboard
          </span>
        </div>
      </div>

      <nav className="flex-grow p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => navigateToTab("workspace")}
            className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "workspace"
                ? "bg-muted text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Không gian làm việc</span>
          </button>

          <button
            onClick={() => navigateToTab("library")}
            className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "library"
                ? "bg-muted text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Volume2 className="w-4 h-4 shrink-0" />
            <span>Thư viện giọng nói</span>
          </button>

          <button
            onClick={() => navigateToTab("history")}
            className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "history"
                ? "bg-muted text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Lịch sử tác vụ</span>
          </button>

          <button
            onClick={() => navigateToTab("docs")}
            className={`w-full px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "docs"
                ? "bg-muted text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
                  ? "bg-muted text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Server className="w-4 h-4 shrink-0" />
              <span>Cổng quản trị (Admin)</span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 pt-4 border-t border-border/60">
          <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest px-1">
            Thiết lập giọng Clone
          </div>
          
          <div className="px-0.5">
            {activeVoiceSampleId ? (
              <div className="bg-gradient-to-tr from-indigo-950/20 to-purple-950/20 border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="bg-primary/10 p-1.5 rounded-lg text-primary shrink-0">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-bold text-primary uppercase tracking-wider">
                      Mẫu hoạt động
                    </span>
                    <span className="text-[10px] font-mono font-bold text-foreground truncate max-w-[110px]" title={activeVoiceSampleId}>
                      {activeVoiceSampleId}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveVoiceSampleId(null)}
                  className="text-[9px] hover:text-foreground text-foreground border border-border bg-card hover:bg-muted px-2 py-1 rounded-lg transition-colors cursor-pointer font-bold shrink-0"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2.5 text-[10px] text-muted-foreground shadow-sm leading-normal">
                <Layers className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                <span>Chưa chọn mẫu giọng. Vui lòng tải một mẫu giọng hoặc thiết kế giọng nói.</span>
              </div>
            )}
          </div>

          <VoiceSampleUpload onUploadSuccess={handleVoiceSampleActive} layout="modern" />
          <VoiceDesignPanel 
            onAcceptSuccess={handleVoiceSampleActive} 
            onJobCreatedOrUpdated={handleJobCreatedOrUpdated}
            layout="modern"
          />
        </div>
      </nav>

      <div className="p-4 border-t border-border bg-card/60 mx-4 my-2 rounded-2xl border border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-3.5 h-3.5 rounded-full shrink-0 relative ${orbColorClass} ${orbPulseClass}`} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-foreground truncate">{orbLabel}</span>
            <span className="text-[10px] text-muted-foreground font-semibold truncate mt-0.5">{orbDesc}</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border flex flex-col gap-3 shrink-0">
        {currentUser && (
          <div className="flex items-center justify-between gap-2 bg-muted/30 border border-border px-3 py-2.5 rounded-xl">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-foreground truncate">@{currentUser.username}</span>
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
                {currentUser.is_admin ? "Administrator" : "Standard User"}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex-grow py-2 bg-muted hover:bg-muted border border-border rounded-xl text-[10px] font-bold text-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            title="Cấu hình Kaggle"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Kaggle</span>
          </button>

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex-grow py-2 bg-muted hover:bg-muted border border-border rounded-xl text-[10px] font-bold text-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5"
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
            className="px-2.5 py-2 bg-muted hover:bg-muted border border-border rounded-xl text-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            title={`Giao diện: ${theme === "system" ? "Tự động" : theme === "light" ? "Sáng" : "Tối"}`}
          >
            {theme === "system" && <Monitor className="w-3.5 h-3.5" />}
            {theme === "light" && <Sun className="w-3.5 h-3.5 text-warning" />}
            {theme === "dark" && <Moon className="w-3.5 h-3.5 text-primary" />}
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1">
          <span>Gateway: {connectionStatus === "connected" ? "Online" : "Offline"}</span>
          <button 
            onClick={checkHealth}
            className="hover:text-muted-foreground cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span>Reload</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans select-none overflow-x-hidden relative">
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      <aside className="hidden lg:block w-80 h-screen fixed top-0 left-0 shrink-0 z-40">
        {sidebarContent}
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div 
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-80 max-w-sm h-full flex-col z-50 animate-fadeIn">
            {sidebarContent}
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 -right-12 p-2 bg-card border border-border text-foreground rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-grow flex flex-col min-w-0 lg:pl-80 min-h-screen">
        <header className="lg:hidden sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-card border border-border/60 rounded-xl text-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-1.5 rounded-lg">
                <Radio className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight text-foreground">OmniVoice</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connectionStatus === "connected" ? "bg-success" : "bg-destructive"}`} />
            <span className="text-[10px] font-mono text-muted-foreground select-all truncate max-w-[120px]">
              {apiBaseUrl}
            </span>
          </div>
        </header>

        <main className="flex-grow p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto flex flex-col gap-6 relative">
          
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

          {activeTab === "workspace" && (
            <div className="w-full flex flex-col gap-6">
              <TTSPanel 
                activeVoiceSampleId={activeVoiceSampleId} 
                onJobCreatedOrUpdated={handleJobCreatedOrUpdated}
                layout="modern"
              />
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

        <footer className="border-t border-border/60 py-6 text-center text-[10px] text-muted-foreground font-semibold bg-background/20 mt-auto">
          OmniVoice On-Demand Gateway MVP &copy; {new Date().getFullYear()} &nbsp;•&nbsp; Built for High-Performance Audio Synthesis
        </footer>
      </div>
    </div>
  );
}

export default App;
