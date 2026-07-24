import React, { useState } from "react";
import { Radio, ShieldAlert, CheckCircle2, ArrowRight } from "lucide-react";
import { api } from "../api/client";

interface LoginRegisterProps {
  onLoginSuccess: (token: string) => void;
}

const GoogleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 2.502 15.435 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.984 0-.743-.079-1.3-.178-1.86H12.24z"/>
  </svg>
);

export const LoginRegister: React.FC<LoginRegisterProps> = ({ onLoginSuccess }) => {
  const apiBaseUrl = api.getApiBaseUrl();

  // Mock OAuth Modal states
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthMockName, setOauthMockName] = useState("Phúc SD");
  const [oauthMockEmail, setOauthMockEmail] = useState("phucsd@gmail.com");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    const redirectUri = window.location.origin + window.location.pathname;
    try {
      // Try real Google OAuth first if configured
      const res = await api.oauthLogin("google", redirectUri);
      if (res && res.auth_url) {
        window.location.href = res.auth_url;
        return;
      }
    } catch (err: any) {
      console.warn("Real Google OAuth not configured or unavailable, falling back to simulated OAuth modal.", err);
    } finally {
      setLoading(false);
    }

    // Fallback to simulated OAuth popup for dev / testing / self-hosted environments
    setOauthMockName("Phúc SD");
    setOauthMockEmail("phucsd@gmail.com");
    setShowOAuthModal(true);
  };

  const handleMockOAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthMockEmail) return;
    setLoading(true);
    setShowOAuthModal(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    
    try {
      const oauthId = `google_mock_${Math.random().toString(36).substr(2, 9)}`;
      const res = await api.oauthMock(
        oauthMockEmail,
        (oauthMockName || oauthMockEmail.split("@")[0]).replace(/\s+/g, "_").toLowerCase(),
        "google",
        oauthId
      );
      localStorage.setItem("VITE_JWT_TOKEN", res.access_token);
      onLoginSuccess(res.access_token);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("chưa được duyệt") || msg.includes("chưa xác thực")) {
        setErrorMsg("Tài khoản Google của bạn đã được đăng ký nhưng hiện đang ở trạng thái chờ Admin (phucsd@gmail.com) phê duyệt.");
      } else {
        setErrorMsg(msg || "Lỗi đăng nhập qua Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic blurred background elements */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-[130px] pointer-events-none" />

      <div className="w-full max-w-md bg-card/70 backdrop-blur-md border border-border rounded-[32px] p-8 flex flex-col gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10">
        
        {/* Header/Logo */}
        <div className="flex flex-col items-center gap-3 text-center select-none mb-1">
          <div className="bg-muted p-3 rounded-2xl border border-border shadow-md">
            <Radio className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground mt-1">
            OmniVoice Gateway
          </h1>
          <p className="text-xs text-muted-foreground">
            Hệ thống quản lý và sinh giọng nói nhân bản AI (voice.oloka.net)
          </p>
        </div>

        {/* Main Google Login Banner & Button */}
        <div className="flex flex-col gap-5">
          {/* Info Banner */}
          <div className="p-4 bg-muted/50 border border-border/80 rounded-2xl text-xs leading-relaxed flex flex-col gap-1.5 text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground font-bold">
              <ShieldAlert className="w-4 h-4 text-primary shrink-0" />
              <span>Chính sách xác thực mới</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hệ thống <strong>voice.oloka.net</strong> bắt buộc xác thực qua tài khoản Google. Tài khoản mới sau khi đăng ký bằng Google sẽ được đưa vào hàng chờ Admin phê duyệt.
            </p>
          </div>

          {/* Status messages */}
          {errorMsg && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs leading-relaxed flex items-start gap-2 animate-fadeIn">
              <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 bg-success/10 border border-success/20 text-success rounded-2xl text-xs leading-relaxed flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Exclusive Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className={`w-full py-4 px-6 rounded-full font-bold text-sm transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg active:scale-[0.99] border ${
              !loading
                ? "bg-white text-gray-900 border-gray-200 hover:bg-gray-50 shadow-white/10 hover:shadow-xl"
                : "bg-muted text-muted-foreground border-transparent cursor-not-allowed"
            }`}
          >
            <GoogleIcon className="w-5 h-5 text-red-500 shrink-0" />
            <span>{loading ? "Đang kết nối Google..." : "Đăng nhập bằng Google"}</span>
            <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
          </button>

          {/* Admin Note */}
          <div className="text-center text-[11px] text-muted-foreground">
            Tài khoản Admin hệ thống: <span className="font-mono font-bold text-foreground">phucsd@gmail.com</span>
          </div>

          {/* Public Docs Link */}
          <div className="flex justify-center mt-1">
            <a
              href="#/docs"
              className="text-[11px] font-bold text-primary hover:text-primary-hover hover:underline flex items-center gap-1.5 transition-all"
            >
              <span>Xem tài liệu API công khai</span>
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>

          {/* API URL Info */}
          <div className="mt-2 pt-4 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground font-semibold select-none">
            <span>API Gateway</span>
            <span className="font-mono text-primary bg-background px-2.5 py-0.5 rounded-full select-all">
              {apiBaseUrl}
            </span>
          </div>
        </div>

      </div>

      {/* Google OAuth Modal Popup */}
      {showOAuthModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowOAuthModal(false)}
        >
          <form 
            onSubmit={handleMockOAuthSubmit} 
            className="bg-card border border-border rounded-[32px] p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border/60 pb-3">
              <div className="p-2.5 bg-red-500/10 rounded-2xl text-red-500">
                <GoogleIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Đăng nhập Google OAuth</h3>
                <p className="text-[10px] text-muted-foreground">Chọn hoặc nhập email Google để tiếp tục</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 my-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase pl-1">Địa chỉ Google Email (*)</label>
                <input
                  type="email"
                  value={oauthMockEmail}
                  onChange={(e) => setOauthMockEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  className="bg-background border border-border focus:border-primary/50 rounded-2xl p-3 text-xs text-foreground font-semibold focus:outline-none font-mono transition-all duration-200"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase pl-1">Tên hiển thị Google</label>
                <input
                  type="text"
                  value={oauthMockName}
                  onChange={(e) => setOauthMockName(e.target.value)}
                  placeholder="Nhập tên..."
                  className="bg-background border border-border focus:border-primary/50 rounded-2xl p-3 text-xs text-foreground font-semibold focus:outline-none transition-all duration-200"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-2 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="px-5 py-2.5 bg-muted border border-border text-xs font-bold text-muted-foreground rounded-full cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-white hover:brightness-105 text-xs font-bold rounded-full cursor-pointer transition-colors border-none shadow-md shadow-primary/10 flex items-center gap-1.5"
              >
                <span>Xác nhận đăng nhập</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
