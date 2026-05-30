import React, { useState } from "react";
import { User, Lock, Radio, KeyRound, UserPlus, Mail, ShieldAlert, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { api } from "../api/client";

interface LoginRegisterProps {
  onLoginSuccess: (token: string) => void;
}

const GoogleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 2.502 15.435 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.984 0-.743-.079-1.3-.178-1.86H12.24z"/>
  </svg>
);

const GithubIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

export const LoginRegister: React.FC<LoginRegisterProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const apiBaseUrl = api.getApiBaseUrl();
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Verification states
  const [verificationMode, setVerificationMode] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verificationUsername, setVerificationUsername] = useState("");
  const [debugOtpCode, setDebugOtpCode] = useState<string | null>(null);

  // Mock OAuth Modal states
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"google" | "github">("google");
  const [oauthMockName, setOauthMockName] = useState("");
  const [oauthMockEmail, setOauthMockEmail] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (verificationMode) {
      if (!otpCode || otpCode.length !== 6) {
        setErrorMsg("Mã xác thực phải gồm đúng 6 chữ số.");
        return;
      }
      setLoading(true);
      try {
        const res = await api.verifyEmail(verificationUsername, otpCode);
        setSuccessMsg(res.message);
        setVerificationMode(false);
        setUsername(verificationUsername);
        setPassword("");
        setIsLogin(true);
        setDebugOtpCode(null);
      } catch (err: any) {
        setErrorMsg(err.message || "Xác thực thất bại.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!username || !password) {
      setErrorMsg("Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    if (!isLogin && !email) {
      setErrorMsg("Vui lòng điền địa chỉ email bắt buộc.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Log in
        const res = await api.login(username, password);
        localStorage.setItem("VITE_JWT_TOKEN", res.access_token);
        onLoginSuccess(res.access_token);
      } else {
        // Register
        const res = await api.register(username, password, email);
        setSuccessMsg(res.message);
        setVerificationUsername(username);
        setVerificationMode(true);
        setOtpCode("");
        if (res.debug_code) {
          setDebugOtpCode(res.debug_code);
        }
      }
    } catch (err: any) {
      // Handle unverified error to redirect to verification
      const errMsg = err.message || "";
      if (errMsg.includes("chưa được xác thực email") || errMsg.includes("chưa xác thực")) {
        setErrorMsg("Tài khoản chưa được kích hoạt. Hãy xác thực email bên dưới.");
        setVerificationUsername(username);
        setVerificationMode(true);
        setOtpCode("");
      } else {
        setErrorMsg(errMsg || "Đã xảy ra lỗi. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await api.resendCode(verificationUsername);
      setSuccessMsg(res.message);
      if (res.debug_code) {
        setDebugOtpCode(res.debug_code);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gửi lại mã thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const openMockOAuth = (provider: "google" | "github") => {
    setOauthProvider(provider);
    if (provider === "google") {
      setOauthMockName("Phúc SD");
      setOauthMockEmail("phucsd@gmail.com");
    } else {
      setOauthMockName("phucsd1");
      setOauthMockEmail("phuc.sd1@github.com");
    }
    setShowOAuthModal(true);
  };

  const handleMockOAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthMockName || !oauthMockEmail) return;
    setLoading(true);
    setShowOAuthModal(false);
    setErrorMsg(null);
    
    try {
      const oauthId = `${oauthProvider}_mock_${Math.random().toString(36).substr(2, 9)}`;
      const res = await api.oauthMock(
        oauthMockEmail,
        oauthMockName.replace(/\s+/g, "_").toLowerCase(),
        oauthProvider,
        oauthId
      );
      localStorage.setItem("VITE_JWT_TOKEN", res.access_token);
      onLoginSuccess(res.access_token);
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi đăng nhập OAuth giả lập.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic blurred circles */}
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
            Hệ thống quản lý và sinh giọng nói nhân bản AI
          </p>
        </div>

        {/* Form Body */}
        {!verificationMode ? (
          <>
            {/* Tab Selector */}
            <div className="grid grid-cols-2 gap-1.5 bg-background p-1 rounded-full border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-1.5 font-bold text-xs rounded-full transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  isLogin
                    ? "bg-muted text-foreground border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Đăng nhập</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 px-1.5 font-bold text-xs rounded-full transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  !isLogin
                    ? "bg-muted text-foreground border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Đăng ký</span>
              </button>
            </div>

            {/* Status messages */}
            {errorMsg && (
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs leading-relaxed flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3.5 bg-success/10 border border-success/20 text-success rounded-2xl text-xs leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Main Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1.5">
                  Tên tài khoản
                </label>
                <div className="relative flex items-center bg-background border border-border/80 rounded-full focus-within:border-primary/50 transition-all shadow-inner px-4">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Tên đăng nhập..."
                    className="w-full bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground font-semibold py-3.5 pl-3"
                    required
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="flex flex-col gap-1.5 animate-fadeIn">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1.5">
                    Địa chỉ Email (Bắt buộc)
                  </label>
                  <div className="relative flex items-center bg-background border border-border/80 rounded-full focus-within:border-primary/50 transition-all shadow-inner px-4">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground font-semibold font-mono py-3.5 pl-3"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1.5">
                  Mật khẩu
                </label>
                <div className="relative flex items-center bg-background border border-border/80 rounded-full focus-within:border-primary/50 transition-all shadow-inner px-4">
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mật khẩu..."
                    className="w-full bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground font-semibold py-3.5 pl-3"
                    required
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="flex flex-col gap-1.5 animate-fadeIn">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1.5">
                    Xác nhận mật khẩu
                  </label>
                  <div className="relative flex items-center bg-background border border-border/80 rounded-full focus-within:border-primary/50 transition-all shadow-inner px-4">
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu..."
                      className="w-full bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground font-semibold py-3.5 pl-3"
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 rounded-full font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-[0.99] border ${
                  !loading
                    ? "bg-gradient-to-r from-primary to-accent text-white border-none shadow-lg shadow-primary/15 hover:brightness-105"
                    : "bg-muted text-muted-foreground border-transparent cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <span>Đang xử lý...</span>
                ) : (
                  <>
                    <span>{isLogin ? "Đăng nhập ngay" : "Đăng ký tài khoản"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-grow h-px bg-muted" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">Hoặc đăng nhập bằng</span>
              <div className="flex-grow h-px bg-muted" />
            </div>

            {/* OAuth Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openMockOAuth("google")}
                className="py-3 bg-background hover:bg-muted border border-border hover:border-border rounded-full text-xs font-semibold text-foreground hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <GoogleIcon className="w-4 h-4 text-destructive" />
                <span>Google</span>
              </button>
              <button
                type="button"
                onClick={() => openMockOAuth("github")}
                className="py-3 bg-background hover:bg-muted border border-border hover:border-border rounded-full text-xs font-semibold text-foreground hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <GithubIcon className="w-4 h-4" />
                <span>GitHub</span>
              </button>
            </div>

            {/* API URL Info */}
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground font-semibold select-none">
              <span>API Gateway</span>
              <span className="font-mono text-primary bg-background px-2.5 py-0.5 rounded-full select-all">
                {apiBaseUrl}
              </span>
            </div>
          </>
        ) : (
          /* Verification (OTP) Form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 animate-fadeIn">
            <button
              type="button"
              onClick={() => {
                setVerificationMode(false);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground font-bold flex items-center gap-1 self-start cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại</span>
            </button>

            <div className="flex flex-col gap-1 text-center">
              <h2 className="text-lg font-bold text-foreground">Xác thực tài khoản</h2>
              <p className="text-xs text-muted-foreground leading-relaxed px-4">
                Mã OTP gồm 6 chữ số đã được gửi tới email của tài khoản <strong className="text-muted-foreground font-bold">@{verificationUsername}</strong>.
              </p>
            </div>

            {/* Status messages */}
            {errorMsg && (
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs leading-relaxed flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3.5 bg-success/10 border border-success/20 text-success rounded-2xl text-xs leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {debugOtpCode && (
              <div className="p-3.5 bg-card border border-border text-foreground rounded-2xl text-xs leading-relaxed flex flex-col gap-1">
                <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Chế độ kiểm thử (Debug OTP):</span>
                <span>Dùng mã sau để xác thực nhanh: <strong className="text-white font-mono text-sm tracking-widest bg-background px-2 py-0.5 rounded ml-1">{debugOtpCode}</strong></span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full bg-background border border-border/60 focus:border-primary/50 rounded-2xl py-4 text-center text-2xl font-bold tracking-[0.75em] text-foreground focus:outline-none font-mono transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 rounded-full font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] border ${
                  !loading
                    ? "bg-gradient-to-r from-primary to-accent text-white border-none shadow-lg shadow-primary/15 hover:brightness-105"
                    : "bg-muted text-muted-foreground border-transparent cursor-not-allowed"
                }`}
              >
                {loading ? "Đang xác thực..." : "Xác nhận và kích hoạt"}
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="text-xs text-muted-foreground hover:text-foreground font-bold underline text-center cursor-pointer transition-colors"
              >
                Gửi lại mã xác thực
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Simulated OAuth Modal Popup */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fadeIn">
          <form onSubmit={handleMockOAuthSubmit} className="bg-card border border-border rounded-[32px] p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
            <div className="flex items-center gap-3 border-b border-border/60 pb-3">
              <div className="p-2.5 bg-primary/10 rounded-2xl text-primary">
                {oauthProvider === "google" ? <GoogleIcon className="w-5 h-5" /> : <GithubIcon className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Simulated {oauthProvider === "google" ? "Google" : "GitHub"} OAuth</h3>
                <p className="text-[10px] text-muted-foreground">Bảng điều hướng giả lập xác thực OAuth2</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 my-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase pl-1">Tên tài khoản hiển thị</label>
                <input
                  type="text"
                  value={oauthMockName}
                  onChange={(e) => setOauthMockName(e.target.value)}
                  placeholder="Nhập tên..."
                  className="bg-background border border-border focus:border-primary/50 rounded-2xl p-3 text-xs text-foreground font-semibold focus:outline-none transition-all duration-200"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase pl-1">Địa chỉ Email</label>
                <input
                  type="email"
                  value={oauthMockEmail}
                  onChange={(e) => setOauthMockEmail(e.target.value)}
                  placeholder="email@domain.com"
                  className="bg-background border border-border focus:border-primary/50 rounded-2xl p-3 text-xs text-foreground font-semibold focus:outline-none font-mono transition-all duration-200"
                  required
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
                className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-white hover:brightness-105 text-xs font-bold rounded-full cursor-pointer transition-colors border-none shadow-md shadow-primary/10"
              >
                Xác nhận phê duyệt
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
