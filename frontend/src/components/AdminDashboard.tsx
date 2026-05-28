import React, { useState, useEffect } from "react";
import { Users, Activity, BarChart3, ArrowLeft, Trash2, ShieldCheck, ShieldAlert, CheckCircle, RefreshCw, Clock, Globe } from "lucide-react";
import { api } from "../api/client";
import type { UserAdminResponse, AdminStatsResponse, ApiLogResponse } from "../api/client";

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<"users" | "stats" | "logs">("users");
  const [users, setUsers] = useState<UserAdminResponse[]>([]);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [logs, setLogs] = useState<ApiLogResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    if (activeTab === "users") {
      await fetchUsers();
    } else if (activeTab === "stats") {
      await fetchStats();
    } else if (activeTab === "logs") {
      await fetchLogs();
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
      await api.updateUser(userId, undefined, !currentVal);
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
      await api.updateUser(userId, !currentVal, undefined);
      setStatusMsg({ type: "success", text: "Cập nhật trạng thái xác thực thành công." });
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Lỗi cập nhật trạng thái xác thực." });
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-6 animate-fadeIn">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-850 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 hover:text-white cursor-pointer transition-colors"
            title="Quay lại Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>Admin Portal</span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Quản trị viên
              </span>
            </h2>
            <p className="text-[11px] text-slate-450 mt-0.5">
              Quản lý tài khoản, xem thống kê hiệu suất hệ thống và nhật ký chi tiết sử dụng API.
            </p>
          </div>
        </div>

        {/* Reload button */}
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-center bg-slate-950 hover:bg-slate-850 disabled:opacity-50 text-xs font-bold px-3.5 py-2 border border-slate-800 hover:border-slate-750 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới dữ liệu</span>
        </button>
      </div>

      {/* Tabs list */}
      <div className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-slate-850 self-start">
        <button
          onClick={() => {
            setActiveTab("users");
            setStatusMsg(null);
          }}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "users" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-450 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Người dùng</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("stats");
            setStatusMsg(null);
          }}
          className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "stats" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-450 hover:text-slate-200"
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
            activeTab === "logs" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-450 hover:text-slate-200"
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
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-450"
          }`}
        >
          {statusMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Tab Contents */}
      <div className="flex flex-col min-h-[300px]">
        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center gap-3 text-slate-400 text-xs py-16">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
            <span>Đang tải thông tin quản trị...</span>
          </div>
        ) : activeTab === "users" ? (
          /* USER DIRECTORY TAB */
          <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 text-[10px] font-bold text-slate-400 uppercase bg-slate-950/40">
                  <th className="px-5 py-4">Tài khoản</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Ngày tạo</th>
                  <th className="px-5 py-4">OAuth</th>
                  <th className="px-5 py-4">Xác thực</th>
                  <th className="px-5 py-4">Quyền Admin</th>
                  <th className="px-5 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-xs">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500">
                      Không tìm thấy người dùng nào.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-850/10 transition-colors">
                      <td className="px-5 py-4 font-bold text-slate-200">
                        @{user.username}
                      </td>
                      <td className="px-5 py-4 text-slate-400 font-mono">
                        {user.email || "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {new Date(user.created_at).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-5 py-4">
                        {user.oauth_provider ? (
                          <span className="bg-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-full capitalize text-slate-300">
                            {user.oauth_provider}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleVerify(user.id, user.is_verified)}
                          disabled={actionLoading !== null}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer transition-colors border ${
                            user.is_verified
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                          }`}
                        >
                          {user.is_verified ? "Đã kích hoạt" : "Chưa kích hoạt"}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                          disabled={actionLoading !== null}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer transition-colors border ${
                            user.is_admin
                              ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
                          }`}
                        >
                          {user.is_admin ? "Admin" : "Thành viên"}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          disabled={actionLoading !== null}
                          className="p-1.5 bg-slate-900 border border-slate-800 text-rose-450 hover:bg-rose-500/10 hover:border-rose-500/20 rounded-lg cursor-pointer transition-colors"
                          title="Xóa người dùng"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === "stats" ? (
          /* METRICS TAB */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats && (
              <>
                <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Tổng số User</span>
                  <span className="text-3xl font-black text-white">{stats.total_users}</span>
                  <p className="text-[10px] text-emerald-400 font-semibold mt-2 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{stats.verified_users} người dùng đã kích hoạt OTP</span>
                  </p>
                </div>
                <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Tổng cuộc gọi API</span>
                  <span className="text-3xl font-black text-white">{stats.total_api_calls}</span>
                  <p className="text-[10px] text-slate-500 font-semibold mt-2 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Ghi nhận từ HTTP requests Gateway</span>
                  </p>
                </div>
                <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">TTS Jobs hoạt động</span>
                  <span className="text-3xl font-black text-indigo-400">{stats.active_jobs}</span>
                  <p className="text-[10px] text-slate-500 font-semibold mt-2">
                    Tổng Job chạy: <strong className="text-emerald-400">{stats.completed_jobs} OK</strong> / <strong className="text-rose-400">{stats.failed_jobs} Lỗi</strong>
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          /* API LOGS TAB */
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 text-[10px] font-bold text-slate-400 uppercase bg-slate-950/40">
                    <th className="px-5 py-4">Thời gian</th>
                    <th className="px-5 py-4">Tài khoản</th>
                    <th className="px-5 py-4">Phương thức</th>
                    <th className="px-5 py-4">Đường dẫn</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Thời gian xử lý</th>
                    <th className="px-5 py-4">IP Client</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs font-mono">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500 font-sans">
                        Chưa có dữ liệu nhật ký hệ thống.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-850/10 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500 font-sans text-[11px] whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString("vi-VN")} {new Date(log.created_at).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-indigo-300 font-sans">
                          {log.username === "Anonymous" ? (
                            <span className="text-slate-550 font-normal">Anonymous</span>
                          ) : (
                            `@${log.username}`
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`font-black text-[10px] px-1.5 py-0.5 rounded ${
                              log.method === "POST"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : log.method === "DELETE"
                                ? "bg-rose-500/10 text-rose-450"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {log.method}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-300 select-all max-w-[200px] truncate" title={log.endpoint}>
                          {log.endpoint}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`font-black ${
                              log.status_code >= 400
                                ? "text-rose-400"
                                : log.status_code >= 300
                                ? "text-amber-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {log.status_code}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-650" />
                            <span>{log.duration_ms.toFixed(1)} ms</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
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
    </div>
  );
};
