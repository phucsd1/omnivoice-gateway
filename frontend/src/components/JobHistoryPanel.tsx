import React, { useState, useEffect } from "react";
import { Clock, RefreshCw, Layers, Heart, Lock, Globe, X, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from "lucide-react";
import { api, type JobStatusResponse } from "../api/client";
import { AudioPlayer } from "./AudioPlayer";

interface JobHistoryPanelProps {
  refreshTrigger: number;
  layout?: "classic" | "modern";
}

export const JobHistoryPanel: React.FC<JobHistoryPanelProps> = ({ refreshTrigger }) => {
  const [jobs, setJobs] = useState<JobStatusResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Expanded job IDs state (for long texts)
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  // Favorite Voices states
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveVoiceName, setSaveVoiceName] = useState("");
  const [saveVoiceRefText, setSaveVoiceRefText] = useState("");
  const [saveVoiceIsPublic, setSaveVoiceIsPublic] = useState(false);
  const [saveVoiceJobId, setSaveVoiceJobId] = useState<string | null>(null);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveVoiceStatus, setSaveVoiceStatus] = useState<string | null>(null);

  const loadJobs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const jobList = await api.listJobs();
      setJobs(jobList);
    } catch (err: any) {
      console.error("Lỗi lấy lịch sử công việc:", err);
      setErrorMsg(err.message || "Không thể tải danh sách lịch sử công việc.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [refreshTrigger]);

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  const handleOpenSaveModal = (targetJobId: string, fullText: string) => {
    setSaveVoiceJobId(targetJobId);
    setSaveVoiceName(`Giọng Lưu - ${new Date().toLocaleDateString("vi-VN")} ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`);
    
    // Suggest first 15 words of original text
    const words = fullText.trim().split(/\s+/);
    const suggestedText = words.slice(0, 15).join(" ") + (words.length > 15 ? "..." : "");
    setSaveVoiceRefText(suggestedText);
    
    setSaveVoiceIsPublic(false);
    setSaveVoiceStatus(null);
    setIsSaveModalOpen(true);
  };

  const handleSaveVoiceSubmit = async () => {
    if (!saveVoiceJobId || !saveVoiceName || !saveVoiceRefText) return;
    setIsSavingVoice(true);
    setSaveVoiceStatus(null);

    try {
      await api.saveFavoriteVoice({
        job_id: saveVoiceJobId,
        name: saveVoiceName,
        is_public: saveVoiceIsPublic,
        ref_text: saveVoiceRefText,
      });
      setSaveVoiceStatus("Lưu giọng thành công vào Thư viện!");
      setTimeout(() => {
        setIsSaveModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setSaveVoiceStatus(`Lỗi: ${err.message || "Không thể lưu giọng."}`);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const getJobTypeLabel = (type?: string) => {
    switch (type) {
      case "clone_voice":
        return { label: "Clone Voice", color: "text-indigo-700 dark:text-indigo-400 border-indigo-550/20 bg-indigo-500/5" };
      case "auto_voice":
        return { label: "Auto Voice", color: "text-sky-700 dark:text-sky-400 border-sky-550/20 bg-sky-500/5" };
      case "voice_design":
        return { label: "Voice Design Direct", color: "text-purple-700 dark:text-purple-400 border-purple-550/20 bg-purple-500/5" };
      case "voice_design_preview":
        return { label: "Voice Design Preview", color: "text-pink-700 dark:text-pink-400 border-pink-550/20 bg-pink-500/5" };
      default:
        return { label: "TTS Job", color: "text-slate-650 dark:text-slate-400 border-slate-550/20 bg-slate-500/5" };
    }
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return "";
    try {
      const date = new Date(timeStr);
      return date.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return timeStr;
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 flex flex-col gap-6 shadow-xl w-full transition-all duration-300">
      <div className="flex items-center justify-between border-b border-slate-850 pb-4 select-none">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-300" />
            <span>Lịch sử các Tác vụ</span>
          </h2>
          <p className="text-xs text-slate-400">
            Xem danh sách các file âm thanh đã tạo trước đó để nghe lại, tải về hoặc lưu giọng.
          </p>
        </div>
        <button
          onClick={loadJobs}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-slate-100 disabled:text-slate-500 border border-slate-800/80 rounded-full text-xs font-bold transition-all cursor-pointer shadow-sm select-none"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
          <span className="text-xs font-bold text-slate-400">Đang tải lịch sử công việc...</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 bg-slate-950/20 rounded-3xl border border-dashed border-slate-800/80">
          <Layers className="w-8 h-8 text-slate-600" />
          <span className="text-xs font-bold text-slate-400">Chưa có công việc nào được thực hiện.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4.5 max-h-[650px] overflow-y-auto pr-1 scrollbar-thin">
          {jobs.map((job) => {
            const { label, color } = getJobTypeLabel(job.job_type);
            const isCompleted = job.status === "completed";
            const isFailed = job.status === "failed";
            const isProcessing = !isCompleted && !isFailed;
            const fullText = job.text || "";
            const isLongText = fullText.length > 120;
            const isExpanded = !!expandedJobs[job.job_id];
            const displayedText = isLongText && !isExpanded 
              ? `${fullText.substring(0, 120)}...` 
              : fullText;

            return (
              <div 
                key={job.job_id} 
                className="bg-slate-850/30 border border-slate-800/60 rounded-3xl p-5 flex flex-col gap-4 hover:border-slate-700/40 hover:bg-slate-850/50 transition-all duration-300 shadow-sm"
              >
                {/* Job Header */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-850/40 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider ${color}`}>
                      {label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold font-mono">
                      ID: {job.job_id.substring(0, 8)}...
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 select-none">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatTime(job.created_at)}
                    </span>
                  </div>

                  {/* Status Badges */}
                  <div>
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full select-none">
                        <CheckCircle className="w-3 h-3" />
                        <span>Thành công</span>
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-405 rounded-full select-none" title={job.error_message || ""}>
                        <AlertCircle className="w-3 h-3" />
                        <span>Thất bại</span>
                      </span>
                    )}
                    {isProcessing && (
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2.5 py-0.5 bg-slate-800 border border-slate-750 text-slate-400 rounded-full animate-pulse select-none">
                        <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                        <span>Đang chạy ({job.progress}%)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Job Text */}
                {fullText && (
                  <div className="text-xs text-slate-205 bg-slate-900 border border-slate-800/80 rounded-2xl p-3.5 leading-relaxed relative group shadow-inner">
                    <span className="whitespace-pre-wrap font-medium">{displayedText}</span>
                    {isLongText && (
                      <button
                        onClick={() => toggleExpand(job.job_id)}
                        className="text-[10px] text-slate-400 hover:text-slate-200 font-bold ml-1.5 focus:outline-none inline-flex items-center gap-0.5 cursor-pointer align-bottom select-none"
                      >
                        {isExpanded ? (
                          <>
                            <span>Ẩn bớt</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>Xem thêm</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Job Output / Actions */}
                {isCompleted && job.audio_url && (
                  <div className="flex flex-col gap-2.5 bg-slate-900/20 p-2.5 rounded-2xl border border-slate-855/50 mt-1">
                    <AudioPlayer
                      url={`${api.getApiBaseUrl()}${job.audio_url}`}
                      title="Kết quả Job"
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenSaveModal(job.job_id, fullText)}
                      className="w-full py-2 px-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/85 text-slate-200 hover:text-slate-100 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-[0.98] mt-1"
                    >
                      <Heart className="w-3.5 h-3.5 fill-slate-450 text-slate-450" />
                      <span>Lưu giọng nói này vào Thư viện</span>
                    </button>
                  </div>
                )}

                {isFailed && job.error_message && (
                  <div className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3.5 rounded-2xl font-mono leading-relaxed font-semibold">
                    <span className="font-bold">Lỗi chi tiết: </span>
                    {job.error_message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Save Voice Modal Overlay */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800/80 rounded-[32px] p-6 w-full max-w-md flex flex-col gap-4.5 shadow-2xl relative">
            <button
              onClick={() => setIsSaveModalOpen(false)}
              className="absolute top-5 right-5 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 border-b border-slate-855 pb-3">
              <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-400">
                <Heart className="w-5 h-5 fill-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100">Lưu giọng nói yêu thích</h3>
                <p className="text-[10px] text-slate-400 font-semibold">Cắt 8 giây đầu và lưu làm mẫu clone giọng</p>
              </div>
            </div>

            {saveVoiceStatus && (
              <div className={`p-3.5 rounded-2xl text-xs font-semibold border ${saveVoiceStatus.startsWith("Lỗi") ? "bg-rose-500/10 border-rose-500/20 text-rose-455" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
                {saveVoiceStatus}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Tên giọng mẫu</label>
                <input
                  type="text"
                  value={saveVoiceName}
                  onChange={(e) => setSaveVoiceName(e.target.value)}
                  placeholder="Ví dụ: Giọng nữ trầm ấm..."
                  className="bg-slate-950 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl p-3 text-xs text-slate-205 focus:outline-none font-semibold transition-all duration-200"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">Văn bản tham khảo (Phát âm trong 8s đầu)</label>
                <textarea
                  value={saveVoiceRefText}
                  onChange={(e) => setSaveVoiceRefText(e.target.value)}
                  placeholder="Nhập phần chữ tương ứng với đoạn nói đầu tiên..."
                  rows={2}
                  className="bg-slate-950 border border-slate-800/80 focus:border-indigo-500/50 rounded-2xl p-3 text-xs text-slate-205 focus:outline-none resize-none font-semibold transition-all duration-200"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">Chế độ chia sẻ</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-850">
                  <button
                    type="button"
                    onClick={() => setSaveVoiceIsPublic(false)}
                    className={`py-2 px-1 text-center font-bold text-xs rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      !saveVoiceIsPublic
                        ? "bg-slate-855 text-slate-100 border border-slate-800/80 shadow-sm"
                        : "text-slate-550 hover:text-slate-350"
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Riêng tư (Private)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveVoiceIsPublic(true)}
                    className={`py-2 px-1 text-center font-bold text-xs rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      saveVoiceIsPublic
                        ? "bg-slate-855 text-slate-100 border border-slate-800/80 shadow-sm"
                        : "text-slate-550 hover:text-slate-355"
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Công khai (Public)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-5 py-2.5 bg-slate-855 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 rounded-lg cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveVoiceSubmit}
                disabled={isSavingVoice || !saveVoiceName || !saveVoiceRefText}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold text-slate-950 rounded-lg cursor-pointer transition-colors shadow-sm border border-slate-200/10"
              >
                {isSavingVoice ? "Đang lưu..." : "Xác nhận Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
