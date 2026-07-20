import React, { useState, useEffect } from "react";
import { Users, Activity, BarChart3, ArrowLeft, Trash2, ShieldCheck, ShieldAlert, CheckCircle, RefreshCw, Clock, Globe, Settings, UserPlus, Pencil, KeyRound, Plus, Eye, EyeOff, Save, X } from "lucide-react";
import { api } from "../api/client";
import type { UserAdminResponse, AdminStatsResponse, ApiLogResponse, AdminApiKeyResponse } from "../api/client";

interface AdminDashboardProps {
  onBack: () => void;
  onSettingsChanged?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack, onSettingsChanged }) => {
  const [activeTab, setActiveTab] = useState<"users" | "stats" | "logs" | "settings">("users");
  const [users, setUsers] = useState<UserAdminResponse[]>([]);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [logs, setLogs] = useState<ApiLogResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create User Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createIsVerified, setCreateIsVerified] = useState(true);
  const [createIsApproved, setCreateIsApproved] = useState(true);
  const [createIsAdmin, setCreateIsAdmin] = useState(false);

  // Edit User Modal States
  const [editingUser, setEditingUser] = useState<UserAdminResponse | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editIsVerified, setEditIsVerified] = useState(false);
  const [editIsApproved, setEditIsApproved] = useState(false);
  const [editIsAdmin, setEditIsAdmin] = useState(false);

  // User API Keys Modal States
  const [keysUser, setKeysUser] = useState<UserAdminResponse | null>(null);
  const [userKeys, setUserKeys] = useState<AdminApiKeyResponse[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const [settingsData, setSettingsData] = useState<any>({
    worker_mode: "mock",
    require_admin_approval: false,
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_from: "",
    kaggle_username: "",
    kaggle_key: "",
    kaggle_kernel_ref: "",
    kaggle_kernel_slug: "",
    kaggle_kernel_title: "",
    kaggle_accelerator: "",
    kaggle_timeout_seconds: 3600,
    kaggle_idle_timeout_seconds: 1800,
    kaggle_worker_dir: "",
    ui_layout: "modern",
    hf_token: "",
  });

  const fetchUsers = async () => {
    try {
      const res = await api.getAdminUsers();
      setUsers(res);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Lỗi tải danh sách người dùng." });
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.getAdminStats();
      setStats(res);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Lỗi tải số liệu thống kê." });
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.getAdminLogs();
      setLogs(res);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Lỗi tải nhật ký hệ thống." });
    }
  };

  const fetchSystemSettings = async () => {
    try {
      const res = await api.adminGetSystemSettings();
      setSettingsData(res);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Lỗi tải cấu hình hệ thống." });
    }
  };

  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    if (activeTab === "users") {
      await fetchUsers();
    } else if (activeTab === "stats") {
      await fetchStats();
    } else if (activeTab === "logs") {
      await fetchLogs();
    } else if (activeTab === "settings") {
      await fetchSystemSettings();
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleToggleAdmin = async (userId: string, currentVal: boolean) => {
    setActionLoading(userId + "_admin");
    setStatusMsg(null);
    try {
      await api.adminUpdateUser(userId, { is_admin: !currentVal });
      setStatusMsg({ type: "success", text: "Cập nhật quyền quản trị thành công." });
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi cập nhật quyền quản trị." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleVerify = async (userId: string, currentVal: boolean) => {
    setActionLoading(userId + "_verify");
    setStatusMsg(null);
    try {
      await api.adminUpdateUser(userId, { is_verified: !currentVal });
      setStatusMsg({ type: "success", text: "Cập nhật trạng thái xác thực thành công." });
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi cập nhật trạng thái xác thực." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveUserQuick = async (userId: string, username: string) => {
    setActionLoading(userId + "_approve");
    setStatusMsg(null);
    try {
      await api.adminUpdateUser(userId, { is_approved: true });
      setStatusMsg({ type: "success", text: `Đã phê duyệt tài khoản @${username} thành công.` });
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi phê duyệt người dùng." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản người dùng @${username} không? Thao tác này không thể hoàn tác.`)) return;
    setActionLoading(userId + "_delete");
    setStatusMsg(null);
    try {
      await api.deleteUser(userId);
      setStatusMsg({ type: "success", text: `Đã xóa thành công người dùng @${username}.` });
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi xóa người dùng." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      await api.adminCreateUser({
        username: createUsername,
        email: createEmail,
        password: createPassword,
        is_verified: createIsVerified,
        is_approved: createIsApproved,
        is_admin: createIsAdmin,
      });
      setStatusMsg({ type: "success", text: `Đã tạo tài khoản @${createUsername} thành công.` });
      setShowCreateModal(false);
      // Reset forms
      setCreateUsername("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateIsVerified(true);
      setCreateIsApproved(true);
      setCreateIsAdmin(false);
      await fetchUsers();
    } catch (err: any) {
      alert("Lỗi tạo người dùng: " + err.message);
    }
  };

  const handleOpenEditModal = (user: UserAdminResponse) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email || "");
    setEditPassword("");
    setEditIsVerified(user.is_verified);
    setEditIsApproved(user.is_approved);
    setEditIsAdmin(user.is_admin);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setStatusMsg(null);
    try {
      const payload: any = {
        username: editUsername,
        email: editEmail,
        is_verified: editIsVerified,
        is_approved: editIsApproved,
        is_admin: editIsAdmin,
      };
      if (editPassword.trim()) {
        payload.password = editPassword;
      }
      await api.adminUpdateUser(editingUser.id, payload);
      setStatusMsg({ type: "success", text: `Cập nhật tài khoản @${editUsername} thành công.` });
      setEditingUser(null);
      await fetchUsers();
    } catch (err: any) {
      alert("Lỗi cập nhật người dùng: " + err.message);
    }
  };

  const handleOpenKeysModal = async (user: UserAdminResponse) => {
    setKeysUser(user);
    setNewKeyName("");
    setVisibleKeys({});
    try {
      const keys = await api.adminGetUserApiKeys(user.id);
      setUserKeys(keys);
    } catch (err: any) {
      alert("Lỗi lấy danh sách API Keys: " + err.message);
    }
  };

  const handleCreateUserKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keysUser || !newKeyName.trim()) return;
    try {
      const newKey = await api.adminCreateUserApiKey(keysUser.id, newKeyName.trim());
      setNewKeyName("");
      setVisibleKeys(prev => ({ ...prev, [newKey.id]: true }));
      // Reload keys
      const keys = await api.adminGetUserApiKeys(keysUser.id);
      setUserKeys(keys);
    } catch (err: any) {
      alert("Lỗi tạo API Key: " + err.message);
    }
  };

  const handleDeleteUserKey = async (keyId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn thu hồi khóa API này không?")) return;
    try {
      await api.adminDeleteApiKey(keyId);
      if (keysUser) {
        const keys = await api.adminGetUserApiKeys(keysUser.id);
        setUserKeys(keys);
      }
    } catch (err: any) {
      alert("Lỗi xóa API Key: " + err.message);
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      await api.adminUpdateSystemSettings(settingsData);
      setStatusMsg({ type: "success", text: "Cấu hình hệ thống đã được lưu thành công." });
      await fetchSystemSettings();
      onSettingsChanged?.();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi lưu cấu hình hệ thống." });
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl shadow-2xl p-6 flex flex-col gap-6 animate-fadeIn">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-background hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Quay lại Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
              <span>Admin Portal</span>
              <span className="text-[10px] bg-destructive/20 text-destructive font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Quản trị viên
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cài đặt hệ thống, duyệt đăng ký, quản lý người dùng nâng cao, tạo API key và giám sát hoạt động.
            </p>
          </div>
        </div>

        {/* Action button header */}
        <div className="flex items-center gap-2">
          {activeTab === "users" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-primary to-accent hover:brightness-105 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-md shadow-primary/10"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tạo tài khoản</span>
            </button>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 bg-background hover:bg-muted disabled:opacity-50 text-xs font-bold px-3.5 py-2 border border-border hover:border-border rounded-xl text-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex flex-wrap gap-2 p-1 bg-background rounded-xl border border-border self-start">
        <button
          onClick={() => {
            setActiveTab("users");
            setStatusMsg(null);
          }}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "users" ? "bg-gradient-to-r from-primary to-accent text-white shadow-sm border-none" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Người dùng</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("settings");
            setStatusMsg(null);
          }}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "settings" ? "bg-gradient-to-r from-primary to-accent text-white shadow-sm border-none" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Cấu hình Hệ thống</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("stats");
            setStatusMsg(null);
          }}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "stats" ? "bg-gradient-to-r from-primary to-accent text-white shadow-sm border-none" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Thống kê</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("logs");
            setStatusMsg(null);
          }}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "logs" ? "bg-gradient-to-r from-primary to-accent text-white shadow-sm border-none" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Nhật ký API</span>
        </button>
      </div>

      {/* Status Messages */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs border flex items-center gap-2 ${
            statusMsg.type === "success"
              ? "bg-success/10 border-success/20 text-success"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          {statusMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Tab Contents */}
      <div className="flex flex-col min-h-[300px]">
        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center gap-3 text-muted-foreground text-xs py-16">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            <span>Đang tải thông tin quản trị...</span>
          </div>
        ) : activeTab === "users" ? (
          /* USER DIRECTORY TAB */
          <div className="overflow-x-auto border border-border rounded-2xl bg-background/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase bg-background/40">
                  <th className="px-5 py-4">Tài khoản</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Duyệt</th>
                  <th className="px-5 py-4">OAuth</th>
                  <th className="px-5 py-4">Xác thực</th>
                  <th className="px-5 py-4">Admin</th>
                  <th className="px-5 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-muted-foreground">
                      Không tìm thấy người dùng nào.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-4 font-bold text-foreground">
                        @{user.username}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground font-mono">
                        {user.email || "—"}
                      </td>
                      <td className="px-5 py-4">
                        {user.is_approved ? (
                          <span className="bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded text-[10px] font-bold">
                            Đã duyệt
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="bg-warning/10 text-warning border border-warning/20 px-2 py-0.5 rounded text-[10px] font-bold">
                              Chờ duyệt
                            </span>
                            <button
                              onClick={() => handleApproveUserQuick(user.id, user.username)}
                              disabled={actionLoading !== null}
                              className="text-[9px] bg-gradient-to-r from-primary to-accent hover:brightness-105 font-bold px-2 py-0.5 rounded text-white cursor-pointer transition-colors shadow-sm"
                            >
                              Duyệt
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {user.oauth_provider ? (
                          <span className="bg-muted text-[10px] font-bold px-2 py-0.5 rounded-full capitalize text-foreground">
                            {user.oauth_provider}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleVerify(user.id, user.is_verified)}
                          disabled={actionLoading !== null}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer transition-colors border ${
                            user.is_verified
                              ? "bg-success/10 border-success/20 text-success hover:bg-success/90/20"
                              : "bg-warning/10 border-warning/20 text-warning hover:bg-warning/20"
                          }`}
                        >
                          {user.is_verified ? "Đã xác thực" : "Chưa xác thực"}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                          disabled={actionLoading !== null}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer transition-colors border ${
                            user.is_admin
                              ? "bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive/90/20"
                              : "bg-muted border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {user.is_admin ? "Admin" : "User"}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => handleOpenKeysModal(user)}
                            className="p-1.5 bg-card border border-border text-primary hover:bg-primary/10 hover:border-primary/20 rounded-lg cursor-pointer transition-colors"
                            title="Quản lý API Keys"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg cursor-pointer transition-colors"
                            title="Sửa thông tin"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            disabled={actionLoading !== null}
                            className="p-1.5 bg-card border border-border text-destructive hover:bg-destructive/10 hover:border-destructive/20 rounded-lg cursor-pointer transition-colors"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === "settings" ? (
          /* SYSTEM SETTINGS TAB */
          <form onSubmit={handleSaveSystemSettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-background/30 p-6 border border-border rounded-2xl">
            <h3 className="md:col-span-2 text-sm font-bold text-foreground border-b border-border pb-2">
              Chính sách &amp; Chế độ chạy
            </h3>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Chế độ Worker GPU (Worker Mode)</label>
              <select
                value={settingsData.worker_mode}
                onChange={(e) => setSettingsData({ ...settingsData, worker_mode: e.target.value })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="mock">Chạy Giả lập (Mock Mode - Không tốn tài nguyên GPU)</option>
                <option value="kaggle">Chạy Thật (Kaggle GPU Worker Mode)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Giao diện người dùng (UI Layout)</label>
              <select
                value={settingsData.ui_layout}
                onChange={(e) => setSettingsData({ ...settingsData, ui_layout: e.target.value })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="modern">Giao diện Hiện đại (Modern Layout - Độ tương phản cao)</option>
                <option value="classic">Giao diện MVP Cũ (Classic Layout)</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <input
                type="checkbox"
                id="require_admin_approval"
                checked={settingsData.require_admin_approval}
                onChange={(e) => setSettingsData({ ...settingsData, require_admin_approval: e.target.checked })}
                className="w-4 h-4 rounded text-primary bg-card border-border focus:ring-primary focus:ring-2 cursor-pointer"
              />
              <div className="flex flex-col">
                <label htmlFor="require_admin_approval" className="text-xs font-semibold text-foreground cursor-pointer">
                  Yêu cầu duyệt tài khoản mới
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Tất cả đăng ký mới phải được Admin bấm duyệt thủ công trước khi có thể đăng nhập.
                </span>
              </div>
            </div>

            <h3 className="md:col-span-2 text-sm font-bold text-foreground border-b border-border pb-2 mt-4">
              Cấu hình SMTP Server (Xác thực Email)
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">SMTP Host</label>
              <input
                type="text"
                value={settingsData.smtp_host}
                onChange={(e) => setSettingsData({ ...settingsData, smtp_host: e.target.value })}
                placeholder="e.g. smtp.gmail.com"
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">SMTP Port</label>
              <input
                type="number"
                value={settingsData.smtp_port}
                onChange={(e) => setSettingsData({ ...settingsData, smtp_port: parseInt(e.target.value) || 587 })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">SMTP Username (Email đăng nhập)</label>
              <input
                type="text"
                value={settingsData.smtp_username}
                onChange={(e) => setSettingsData({ ...settingsData, smtp_username: e.target.value })}
                placeholder="e.g. sender@gmail.com"
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">SMTP Password (Mật khẩu ứng dụng)</label>
              <input
                type="password"
                value={settingsData.smtp_password}
                onChange={(e) => setSettingsData({ ...settingsData, smtp_password: e.target.value })}
                placeholder="••••••••••••••••"
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Email Gửi từ (Sender Email Address)</label>
              <input
                type="text"
                value={settingsData.smtp_from}
                onChange={(e) => setSettingsData({ ...settingsData, smtp_from: e.target.value })}
                placeholder="OmniVoice <no-reply@omnivoice.local>"
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <h3 className="md:col-span-2 text-sm font-bold text-foreground border-b border-border pb-2 mt-4">
              Cấu hình Kaggle mặc định của Hệ thống
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kaggle Username mặc định</label>
              <input
                type="text"
                value={settingsData.kaggle_username}
                onChange={(e) => setSettingsData({ ...settingsData, kaggle_username: e.target.value })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kaggle API Key mặc định</label>
              <input
                type="password"
                value={settingsData.kaggle_key}
                onChange={(e) => setSettingsData({ ...settingsData, kaggle_key: e.target.value })}
                placeholder="••••••••••••••••"
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kaggle Kernel Reference (Ví dụ: user/worker)</label>
              <input
                type="text"
                value={settingsData.kaggle_kernel_ref}
                onChange={(e) => setSettingsData({ ...settingsData, kaggle_kernel_ref: e.target.value })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kaggle Accelerator (Ví dụ: NvidiaTeslaT4)</label>
              <input
                type="text"
                value={settingsData.kaggle_accelerator}
                onChange={(e) => setSettingsData({ ...settingsData, kaggle_accelerator: e.target.value })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Thời gian chờ Idle của Worker (giây)</label>
              <input
                type="number"
                value={settingsData.kaggle_idle_timeout_seconds}
                onChange={(e) => setSettingsData({ ...settingsData, kaggle_idle_timeout_seconds: parseInt(e.target.value) || 0 })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                min="0"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Hugging Face Access Token (Quyền đọc/Ghi tùy chọn - Đẩy nhanh tốc độ tải cấu hình/weights)</label>
              <input
                type="password"
                value={settingsData.hf_token || ""}
                onChange={(e) => setSettingsData({ ...settingsData, hf_token: e.target.value })}
                placeholder={settingsData.hf_token ? "•••••••••••••••• (Đã thiết lập - Nhập mới tự lưu)" : "Nhập HF Token (hf_...)"}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <h3 className="md:col-span-2 text-sm font-bold text-foreground border-b border-border pb-2 mt-4">
              Cấu hình Dịch Thuật LLM (Dùng cho Video Dubbing & Phụ Đề)
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nhà cung cấp LLM (LLM Provider)</label>
              <select
                value={settingsData.llm_provider || "gemini"}
                onChange={(e) => setSettingsData({ ...settingsData, llm_provider: e.target.value })}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="gemini">Google Gemini (Khuyên dùng - Miễn phí/Tốc độ cao)</option>
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="custom">Custom REST Endpoint (Ollama / Local LLM)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Mô hình (LLM Model Name)</label>
              <input
                type="text"
                value={settingsData.llm_model || "gemini-2.5-flash"}
                onChange={(e) => setSettingsData({ ...settingsData, llm_model: e.target.value })}
                placeholder="gemini-2.5-flash hoặc gpt-4o-mini"
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">API Key Dịch Thuật (Gemini API Key / OpenAI API Key)</label>
              <input
                type="password"
                value={settingsData.llm_api_key || ""}
                onChange={(e) => setSettingsData({ ...settingsData, llm_api_key: e.target.value })}
                placeholder={settingsData.llm_api_key ? "•••••••••••••••• (Đã thiết lập - Nhập mới để cập nhật)" : "Nhập API Key Dịch Thuật AI..."}
                className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            {settingsData.llm_provider === "custom" && (
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Custom Endpoint URL</label>
                <input
                  type="text"
                  value={settingsData.llm_custom_endpoint || ""}
                  onChange={(e) => setSettingsData({ ...settingsData, llm_custom_endpoint: e.target.value })}
                  placeholder="https://my-local-llm.com/v1/chat/completions"
                  className="bg-card border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button
                type="submit"
                className="flex items-center gap-1.5 bg-gradient-to-r from-primary to-accent hover:brightness-105 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-colors cursor-pointer shadow-primary/10"
              >
                <Save className="w-4 h-4" />
                <span>Lưu cấu hình hệ thống</span>
              </button>
            </div>
          </form>
        ) : activeTab === "stats" ? (
          /* METRICS TAB */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats && (
              <>
                <div className="bg-background border border-border p-5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tổng số User</span>
                  <span className="text-3xl font-black text-foreground">{stats.total_users}</span>
                  <p className="text-[10px] text-success dark:text-success font-semibold mt-2 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{stats.verified_users} người dùng đã xác thực OTP</span>
                  </p>
                </div>
                <div className="bg-background border border-border p-5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tổng cuộc gọi API</span>
                  <span className="text-3xl font-black text-foreground">{stats.total_api_calls}</span>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-2 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Ghi nhận từ HTTP requests Gateway</span>
                  </p>
                </div>
                <div className="bg-background border border-border p-5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">TTS Jobs hoạt động</span>
                  <span className="text-3xl font-black text-primary">{stats.active_jobs}</span>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-2">
                    Tổng Job chạy: <strong className="text-success">{stats.completed_jobs} OK</strong> / <strong className="text-destructive">{stats.failed_jobs} Lỗi</strong>
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          /* API LOGS TAB */
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto border border-border rounded-2xl bg-background/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase bg-background/40">
                    <th className="px-5 py-4">Thời gian</th>
                    <th className="px-5 py-4">Tài khoản</th>
                    <th className="px-5 py-4">Phương thức</th>
                    <th className="px-5 py-4">Đường dẫn</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Thời gian xử lý</th>
                    <th className="px-5 py-4">IP Client</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs font-mono">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-muted-foreground font-sans">
                        Chưa có dữ liệu nhật ký hệ thống.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-3.5 text-muted-foreground font-sans text-[11px] whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString("vi-VN")} {new Date(log.created_at).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-primary/90 font-sans">
                          {log.username === "Anonymous" ? (
                            <span className="text-muted-foreground font-normal">Anonymous</span>
                          ) : (
                            `@${log.username}`
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`font-black text-[10px] px-1.5 py-0.5 rounded ${
                              log.method === "POST"
                                ? "bg-success/10 text-success"
                                : log.method === "DELETE"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {log.method}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-foreground select-all max-w-[200px] truncate" title={log.endpoint}>
                          {log.endpoint}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`font-black ${
                              log.status_code >= 400
                                ? "text-destructive"
                                : log.status_code >= 300
                                ? "text-warning"
                                : "text-success"
                            }`}
                          >
                            {log.status_code}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span>{log.duration_ms.toFixed(1)} ms</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {log.ip_address || "Unknown"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* --- CREATE USER MODAL --- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 flex flex-col gap-4 shadow-2xl relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              <span>Tạo tài khoản người dùng</span>
            </h3>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Tên đăng nhập (Username)</label>
                <input
                  type="text"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Địa chỉ Email</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Mật khẩu (Password)</label>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="create_is_verified"
                    checked={createIsVerified}
                    onChange={(e) => setCreateIsVerified(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary bg-background border-border cursor-pointer"
                  />
                  <label htmlFor="create_is_verified" className="text-[11px] font-semibold text-foreground cursor-pointer">
                    Đã kích hoạt OTP
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="create_is_approved"
                    checked={createIsApproved}
                    onChange={(e) => setCreateIsApproved(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary bg-background border-border cursor-pointer"
                  />
                  <label htmlFor="create_is_approved" className="text-[11px] font-semibold text-foreground cursor-pointer">
                    Phê duyệt đăng nhập
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-border mt-1">
                <input
                  type="checkbox"
                  id="create_is_admin"
                  checked={createIsAdmin}
                  onChange={(e) => setCreateIsAdmin(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-destructive bg-background border-border cursor-pointer"
                />
                <label htmlFor="create_is_admin" className="text-[11px] font-semibold text-destructive cursor-pointer">
                  Cấp quyền Quản trị (Admin)
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-accent hover:brightness-105 text-white font-bold text-xs py-2.5 rounded-lg cursor-pointer mt-3 shadow-md shadow-primary/15"
              >
                Tạo người dùng
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT USER MODAL --- */}
      {editingUser && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 flex flex-col gap-4 shadow-2xl relative">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              <span>Chỉnh sửa thông tin tài khoản</span>
            </h3>

            <form onSubmit={handleEditUser} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Tên đăng nhập</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Địa chỉ Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Mật khẩu mới (Để trống nếu không đổi)</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit_is_verified"
                    checked={editIsVerified}
                    onChange={(e) => setEditIsVerified(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary bg-background border-border cursor-pointer"
                  />
                  <label htmlFor="edit_is_verified" className="text-[11px] font-semibold text-foreground cursor-pointer">
                    Đã xác thực OTP
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit_is_approved"
                    checked={editIsApproved}
                    onChange={(e) => setEditIsApproved(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary bg-background border-border cursor-pointer"
                  />
                  <label htmlFor="edit_is_approved" className="text-[11px] font-semibold text-foreground cursor-pointer">
                    Phê duyệt đăng nhập
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-border mt-1">
                <input
                  type="checkbox"
                  id="edit_is_admin"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-destructive bg-background border-border cursor-pointer"
                />
                <label htmlFor="edit_is_admin" className="text-[11px] font-semibold text-destructive cursor-pointer">
                  Quyền Quản trị (Admin)
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-accent hover:brightness-105 text-white font-bold text-xs py-2.5 rounded-lg cursor-pointer mt-3 shadow-md shadow-primary/15"
              >
                Cập nhật thông tin
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- USER API KEYS MODAL --- */}
      {keysUser && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-6 flex flex-col gap-4 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setKeysUser(null)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-2.5">
              <KeyRound className="w-4 h-4 text-primary" />
              <span>Quản lý API Keys của @{keysUser.username}</span>
            </h3>

            {/* Create user api key form */}
            <form onSubmit={handleCreateUserKey} className="flex gap-2">
              <input
                type="text"
                placeholder="Đặt tên khóa API mới..."
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-grow bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                required
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-primary to-accent hover:brightness-105 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1 shadow-md shadow-primary/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo Key</span>
              </button>
            </form>

            <div className="mt-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Danh sách khóa API</h4>
              {userKeys.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {userKeys.map((k) => (
                    <div key={k.id} className="bg-background border border-border p-3 rounded-xl flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-xs font-bold text-foreground truncate">{k.name}</span>
                        <div className="flex items-center gap-1.5 text-xs text-primary/90 font-mono">
                          <span className="max-w-[200px] truncate block select-all" title={k.key}>
                            {visibleKeys[k.id] ? k.key : (k.key.length > 12 ? `${k.key.substring(0, 8)}••••${k.key.substring(k.key.length - 4)}` : k.key)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setVisibleKeys({ ...visibleKeys, [k.id]: !visibleKeys[k.id] })}
                            className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                          >
                            {visibleKeys[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          Tạo ngày: {new Date(k.created_at).toLocaleDateString("vi-VN")} • Sử dụng cuối: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("vi-VN") : "Chưa sử dụng"}
                        </span>
                      </div>

                      <button
                        onClick={() => handleDeleteUserKey(k.id)}
                        className="p-1.5 bg-card border border-border text-destructive hover:bg-destructive/10 hover:border-destructive/20 rounded-lg cursor-pointer transition-colors"
                        title="Thu hồi khóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  Người dùng này chưa có API key nào.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
