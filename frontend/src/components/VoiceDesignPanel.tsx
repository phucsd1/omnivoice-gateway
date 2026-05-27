import React, { useState, useEffect, useRef } from "react";
import { Mic, Wand2, Check } from "lucide-react";
import { api } from "../api/client";
import type { JobStatusResponse } from "../api/client";

import { JobStatusCard } from "./JobStatusCard";
import { AudioPlayer } from "./AudioPlayer";

interface VoiceDesignPanelProps {
  onAcceptSuccess: (voiceSampleId: string) => void;
}

export const VoiceDesignPanel: React.FC<VoiceDesignPanelProps> = ({ onAcceptSuccess }) => {
  const [voiceRequest, setVoiceRequest] = useState("Giọng nữ trẻ, trầm, nhẹ nhàng, tự nhiên");
  const [previewText, setPreviewText] = useState("Xin chào, đây là giọng nói thiết kế thử nghiệm của OmniVoice.");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const pollIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceRequest || !previewText) return;

    setLoading(true);
    setJobId(null);
    setPreviewId(null);
    setJobStatus(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.createVoiceDesignPreview(voiceRequest, previewText);
      setJobId(res.job_id);
      setPreviewId(res.preview_id);
      setJobStatus({
        job_id: res.job_id,
        status: res.status,
        message: res.message,
        progress: 0,
        audio_url: null,
        error_message: null,
      });
      setIsPolling(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể gửi yêu cầu thiết kế giọng nói.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPolling && jobId) {
      // Poll every 2 seconds
      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const status = await api.getJobStatus(jobId);
          setJobStatus(status);

          if (status.status === "completed" || status.status === "failed") {
            stopPolling();
          }
        } catch (err: any) {
          setErrorMsg(`Lỗi khi thăm dò trạng thái: ${err.message}`);
          stopPolling();
        }
      }, 2000);

      // Set timeout after 15 minutes (900000 ms)
      timeoutRef.current = window.setTimeout(() => {
        setErrorMsg("Hết thời gian chờ xử lý (Timeout 15 phút).");
        stopPolling();
      }, 900000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isPolling, jobId]);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPolling(false);
    setLoading(false);
  };

  const handleAccept = async () => {
    if (!previewId) return;
    setAccepting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.acceptPreview(previewId);
      setSuccessMsg(`Đã lưu giọng thiết kế làm mẫu thành công! ID: ${res.voice_sample_id}`);
      onAcceptSuccess(res.voice_sample_id);
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi khi chấp nhận giọng thiết kế.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-lg">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Mic className="w-5 h-5 text-indigo-400" />
          <span>2. Thiết kế giọng nói (Voice Design Preview)</span>
        </h2>
        <p className="text-xs text-slate-400">
          Mô tả kiểu giọng nói bạn muốn thiết kế bằng tiếng Việt, nghe thử rồi chấp nhận để clone.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="flex flex-col gap-4">
        {/* Voice request */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">
            Mô tả giọng nói (Tiếng Việt)
          </label>
          <input
            type="text"
            value={voiceRequest}
            onChange={(e) => setVoiceRequest(e.target.value)}
            placeholder="Ví dụ: giọng nữ trẻ trầm nhẹ nhàng tự nhiên..."
            className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-650"
          />
          <span className="text-[10px] text-slate-500 leading-tight">
            * Backend sẽ tự động phân tích: &quot;nữ/nam&quot;, &quot;trẻ&quot;, &quot;trầm/thấp&quot;, &quot;nhẹ nhàng/thì thầm&quot;...
          </span>
        </div>

        {/* Preview text */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">
            Nội dung nghe thử (Preview Text)
          </label>
          <textarea
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Nhập nội dung ngắn để nghe thử giọng nói này..."
            rows={2}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-650 resize-none"
          />
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-sm flex items-center gap-1.5">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !voiceRequest || !previewText}
          className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
            !loading && voiceRequest && previewText
              ? "bg-gradient-to-r from-indigo-650 to-purple-650 hover:from-indigo-600 hover:to-purple-600 text-white shadow-md shadow-indigo-650/15"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang khởi tạo preview...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>Tạo bản nghe thử</span>
            </>
          )}
        </button>
      </form>

      {/* Progress display */}
      {jobId && jobStatus && (
        <div className="mt-2 flex flex-col gap-4">
          <JobStatusCard
            jobId={jobStatus.job_id}
            status={jobStatus.status}
            message={jobStatus.message}
            progress={jobStatus.progress}
            errorMessage={jobStatus.error_message}
          />

          {jobStatus.status === "completed" && jobStatus.audio_url && (
            <div className="flex flex-col gap-3">
              <AudioPlayer
                url={`${api.getApiBaseUrl()}${jobStatus.audio_url}`}
                title="Bản thiết kế nghe thử"
              />
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-650/10"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang lưu mẫu...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Chấp nhận giọng này làm mẫu Clone</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);
