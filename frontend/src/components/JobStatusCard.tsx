import React from "react";
import { Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";

interface JobStatusCardProps {
  jobId: string;
  status: string;
  message?: string | null;
  progress: number;
  errorMessage?: string | null;
}

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  queued: {
    label: "Đang xếp hàng chờ",
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    icon: Info,
  },
  preparing_input: {
    label: "Đang chuẩn bị dữ liệu đầu vào",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: Loader2,
  },
  starting_worker: {
    label: "Đang khởi tạo máy chủ xử lý giọng nói",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: Loader2,
  },
  booting_kaggle: {
    label: "Đang khởi động Kaggle Worker",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: Loader2,
  },
  installing_runtime: {
    label: "Đang cài đặt môi trường chạy",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: Loader2,
  },
  loading_model: {
    label: "Đang tải mô hình OmniVoice",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    icon: Loader2,
  },
  transcribing_ref: {
    label: "Đang chuyển mã giọng tham chiếu",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    icon: Loader2,
  },
  generating_preview: {
    label: "Đang tạo bản nghe thử",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    icon: Loader2,
  },
  normalizing_sample: {
    label: "Đang chuẩn hóa âm thanh mẫu",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    icon: Loader2,
  },
  cloning_voice: {
    label: "Đang xử lý âm thanh clone",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    icon: Loader2,
  },
  generating_audio: {
    label: "Đang xử lý âm thanh",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    icon: Loader2,
  },
  exporting_wav: {
    label: "Đang xuất tệp âm thanh WAV",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    icon: Loader2,
  },
  completed: {
    label: "Hoàn tất",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: CheckCircle2,
  },
  failed: {
    label: "Lỗi xử lý",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    icon: AlertCircle,
  },
};

export const JobStatusCard: React.FC<JobStatusCardProps> = ({
  jobId,
  status,
  message,
  progress,
  errorMessage,
}) => {
  const currentStatus = statusMap[status] || {
    label: status,
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    icon: Info,
  };

  const IconComponent = currentStatus.icon;
  const isProcessing =
    status !== "completed" && status !== "failed";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">MÃ YÊU CẦU</span>
          <span className="text-sm font-mono font-bold text-slate-300">{jobId}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${currentStatus.color}`}
        >
          {isProcessing && <IconComponent className="w-3.5 h-3.5 animate-spin" />}
          {!isProcessing && <IconComponent className="w-3.5 h-3.5" />}
          <span>{currentStatus.label}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Tiến trình xử lý</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              status === "failed"
                ? "bg-rose-500"
                : status === "completed"
                ? "bg-emerald-500"
                : "bg-indigo-600"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {(message || errorMessage) && (
        <div className="text-sm border-t border-slate-800/60 pt-3 mt-1 flex flex-col gap-1.5">
          {message && (
            <div className="text-slate-300 flex items-start gap-1.5">
              <span className="text-indigo-400 font-semibold">•</span>
              <p className="flex-grow">{message}</p>
            </div>
          )}
          {status === "failed" && errorMessage && (
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-3 text-xs text-rose-300 font-mono overflow-auto max-h-40 whitespace-pre-wrap">
              <strong>Chi tiết lỗi:</strong>
              <p className="mt-1">{errorMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
