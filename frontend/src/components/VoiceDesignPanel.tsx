import React, { useState, useEffect, useRef } from "react";
import { Mic, Wand2, Check, Heart, Lock, Globe, X } from "lucide-react";
import { api } from "../api/client";
import type { JobStatusResponse } from "../api/client";

import { JobStatusCard } from "./JobStatusCard";
import { AudioPlayer } from "./AudioPlayer";

interface VoiceDesignPanelProps {
  onAcceptSuccess: (voiceSampleId: string) => void;
  onJobCreatedOrUpdated?: () => void;
  layout?: "classic" | "modern";
}

export const VoiceDesignPanel: React.FC<VoiceDesignPanelProps> = ({ onAcceptSuccess, onJobCreatedOrUpdated }) => {
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
  const [speed, setSpeed] = useState(1.0);
  const [numStep, setNumStep] = useState(32);

  // Favorite Voices states
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveVoiceName, setSaveVoiceName] = useState("");
  const [saveVoiceRefText, setSaveVoiceRefText] = useState("");
  const [saveVoiceCustomId, setSaveVoiceCustomId] = useState("");
  const [saveVoiceIsPublic, setSaveVoiceIsPublic] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveVoiceStatus, setSaveVoiceStatus] = useState<string | null>(null);

  // Advanced OmniVoice parameters state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [guidanceScale, setGuidanceScale] = useState(2.0);
  const [tShift, setTShift] = useState(0.1);
  const [positionTemperature, setPositionTemperature] = useState(5.0);
  const [classTemperature, setClassTemperature] = useState(0.0);
  const [layerPenaltyFactor, setLayerPenaltyFactor] = useState(5.0);
  const [duration, setDuration] = useState("");
  const [preprocessPrompt, setPreprocessPrompt] = useState(true);
  const [postprocessOutput, setPostprocessOutput] = useState(true);
  const [audioChunkDuration, setAudioChunkDuration] = useState(15.0);
  const [audioChunkThreshold, setAudioChunkThreshold] = useState(30.0);

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

    const params = {
      denoise,
      guidance_scale: guidanceScale,
      t_shift: tShift,
      position_temperature: positionTemperature,
      class_temperature: classTemperature,
      layer_penalty_factor: layerPenaltyFactor,
      duration: duration ? parseFloat(duration) : undefined,
      preprocess_prompt: preprocessPrompt,
      postprocess_output: postprocessOutput,
      audio_chunk_duration: audioChunkDuration,
      audio_chunk_threshold: audioChunkThreshold
    };

    try {
      const res = await api.createVoiceDesignPreview(voiceRequest, previewText, speed, numStep, params);
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
      onJobCreatedOrUpdated?.();
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
            onJobCreatedOrUpdated?.();
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

  const handleOpenSaveModal = (fullText: string) => {
    setSaveVoiceName(`Giọng Lưu - ${new Date().toLocaleDateString("vi-VN")} ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`);
    
    // Suggest first 15 words of original text
    const words = fullText.trim().split(/\s+/);
    const suggestedText = words.slice(0, 15).join(" ") + (words.length > 15 ? "..." : "");
    setSaveVoiceRefText(suggestedText);
    setSaveVoiceCustomId("");
    
    setSaveVoiceIsPublic(false);
    setSaveVoiceStatus(null);
    setIsSaveModalOpen(true);
  };

  const handleSaveVoiceSubmit = async () => {
    if (!previewId || !saveVoiceName || !saveVoiceRefText) return;
    setIsSavingVoice(true);
    setSaveVoiceStatus(null);

    try {
      await api.saveFavoriteVoice({
        preview_id: previewId,
        name: saveVoiceName,
        is_public: saveVoiceIsPublic,
        ref_text: saveVoiceRefText,
        custom_id: saveVoiceCustomId || undefined,
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

  return (
    <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 flex flex-col gap-6 shadow-xl transition-all duration-200">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-100">
          <Mic className="w-5.5 h-5.5 text-slate-350" />
          <span>2. Thiết kế giọng nói (Voice Design Preview)</span>
        </h2>
        <p className="text-xs text-slate-450 font-medium">
          Mô tả kiểu giọng nói bạn muốn thiết kế bằng tiếng Việt, nghe thử rồi chấp nhận để clone.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="flex flex-col gap-5">
        {/* Voice request */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-450 uppercase tracking-wider">
            Mô tả giọng nói (Tiếng Việt)
          </label>
          <input
            type="text"
            value={voiceRequest}
            onChange={(e) => setVoiceRequest(e.target.value)}
            placeholder="Ví dụ: giọng nữ trẻ trầm nhẹ nhàng tự nhiên..."
            className="bg-slate-950/60 border border-slate-850/80 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700 transition-all font-semibold w-full"
          />
          <span className="text-[10px] text-slate-500 font-medium leading-tight">
            * Backend sẽ tự động phân tích: &quot;nữ/nam&quot;, &quot;trẻ&quot;, &quot;trầm/thấp&quot;, &quot;nhẹ nhàng/thì thầm&quot;...
          </span>
        </div>

        {/* Preview text */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-450 uppercase tracking-wider">
            Nội dung nghe thử (Preview Text)
          </label>
          <textarea
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Nhập nội dung ngắn để nghe thử giọng nói này..."
            rows={2}
            className="bg-slate-950/60 border border-slate-850/80 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700 transition-all font-semibold w-full resize-none"
          />
        </div>

        {/* Advanced parameters: Speed and Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-slate-950/40 border border-slate-850/80 rounded-2xl shadow-inner">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-slate-450 uppercase tracking-wider">Tốc độ nói: {speed.toFixed(1)}x</label>
              <span className="text-[10px] text-slate-500 font-bold font-mono select-none">0.5x - 2.0x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="seekbar w-full"
              style={{ background: 'var(--color-slate-800)' }}
            />
            <span className="text-[10px] text-slate-550 font-medium leading-tight">
              Mặc định: 1.0
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-slate-450 uppercase tracking-wider">Độ chính xác (Steps): {numStep}</label>
              <span className="text-[10px] text-slate-500 font-bold font-mono select-none">10 - 64</span>
            </div>
            <input
              type="range"
              min="10"
              max="64"
              step="1"
              value={numStep}
              onChange={(e) => setNumStep(parseInt(e.target.value))}
              className="seekbar w-full"
              style={{ background: 'var(--color-slate-800)' }}
            />
            <span className="text-[10px] text-slate-550 font-medium leading-tight">
              Mặc định: 32 (16 bước để chạy nhanh hơn)
            </span>
          </div>
        </div>

        {/* Toggle Advanced Settings */}
        <div className="border-t border-slate-850/80 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 font-extrabold transition-colors cursor-pointer select-none"
          >
            <span>{showAdvanced ? "Ẩn cấu hình nâng cao" : "Hiện cấu hình nâng cao (OmniVoice)"}</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="flex flex-col gap-4 p-4 bg-slate-950/40 border border-slate-850/80 rounded-2xl shadow-inner">
            {/* Toggles Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-350 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={denoise}
                  onChange={(e) => setDenoise(e.target.checked)}
                  className="rounded border-slate-850 bg-slate-900 text-slate-100 focus:ring-slate-700 w-4 h-4 cursor-pointer"
                />
                <span>Denoise (Lọc nhiễu)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-350 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preprocessPrompt}
                  onChange={(e) => setPreprocessPrompt(e.target.checked)}
                  className="rounded border-slate-850 bg-slate-900 text-slate-100 focus:ring-slate-700 w-4 h-4 cursor-pointer"
                />
                <span>Tiền xử lý tham chiếu</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-350 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={postprocessOutput}
                  onChange={(e) => setPostprocessOutput(e.target.checked)}
                  className="rounded border-slate-850 bg-slate-900 text-slate-100 focus:ring-slate-700 w-4 h-4 cursor-pointer"
                />
                <span>Hậu xử lý đầu ra</span>
              </label>
            </div>

            <div className="h-px bg-slate-900/60 my-1" />

            {/* Sliders and text fields grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Guidance Scale: {guidanceScale.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">0.5 - 5.0</span>
                </div>
                <input
                  type="range" min="0.5" max="5.0" step="0.1"
                  value={guidanceScale}
                  onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Time-step Shift (t_shift): {tShift.toFixed(2)}</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">0.01 - 0.50</span>
                </div>
                <input
                  type="range" min="0.01" max="0.50" step="0.01"
                  value={tShift}
                  onChange={(e) => setTShift(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Position Temperature: {positionTemperature.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">0.0 - 10.0</span>
                </div>
                <input
                  type="range" min="0.0" max="10.0" step="0.5"
                  value={positionTemperature}
                  onChange={(e) => setPositionTemperature(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Class Temperature: {classTemperature.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">0.0 - 5.0</span>
                </div>
                <input
                  type="range" min="0.0" max="5.0" step="0.1"
                  value={classTemperature}
                  onChange={(e) => setClassTemperature(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Layer Penalty Factor: {layerPenaltyFactor.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">0.0 - 10.0</span>
                </div>
                <input
                  type="range" min="0.0" max="10.0" step="0.5"
                  value={layerPenaltyFactor}
                  onChange={(e) => setLayerPenaltyFactor(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thời lượng cố định (Duration - giây)</label>
                <input
                  type="number" step="0.1" min="0.1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Mặc định: Tự động tính theo văn bản"
                  className="bg-slate-900/60 border border-slate-850/80 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700 transition-all font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Đoạn cắt (Chunk Duration): {audioChunkDuration.toFixed(0)}s</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">5 - 60</span>
                </div>
                <input
                  type="range" min="5" max="60" step="1"
                  value={audioChunkDuration}
                  onChange={(e) => setAudioChunkDuration(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Ngưỡng cắt (Chunk Threshold): {audioChunkThreshold.toFixed(0)}s</span>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">10 - 120</span>
                </div>
                <input
                  type="range" min="10" max="120" step="5"
                  value={audioChunkThreshold}
                  onChange={(e) => setAudioChunkThreshold(parseFloat(e.target.value))}
                  className="seekbar w-full"
                  style={{ background: 'var(--color-slate-800)' }}
                />
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-xl text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1.5">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !voiceRequest || !previewText}
          className={`w-full py-3 px-6 rounded-full font-bold text-sm transition-all duration-155 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-md ${
            !loading && voiceRequest && previewText
              ? "bg-slate-100 text-slate-950 hover:bg-slate-200 border border-slate-200/10"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-550" />
              <span>Đang khởi tạo preview...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 fill-current" />
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
            <div className="flex flex-col gap-3 mt-1">
              <AudioPlayer
                url={`${api.getApiBaseUrl()}${jobStatus.audio_url}`}
                title="Bản thiết nghe thử"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-200 font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {accepting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu mẫu...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Dùng làm mẫu clone gốc (Full)</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenSaveModal(previewText)}
                  className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-200 font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Heart className="w-3.5 h-3.5 fill-slate-400 text-slate-400" />
                  <span>Lưu giọng yêu thích (Cắt 8s)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Voice Modal Overlay */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl relative">
            <button
              onClick={() => setIsSaveModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                <Heart className="w-5 h-5 fill-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100">Lưu giọng nói yêu thích</h3>
                <p className="text-[10px] text-slate-400 font-semibold">Cắt 8 giây đầu và lưu làm mẫu clone giọng</p>
              </div>
            </div>

            {saveVoiceStatus && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold border ${saveVoiceStatus.startsWith("Lỗi") ? "bg-rose-500/10 border-rose-500/20 text-rose-450" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
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
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Mã ID giọng nói (slug - Không bắt buộc)</label>
                <input
                  type="text"
                  value={saveVoiceCustomId}
                  onChange={(e) => setSaveVoiceCustomId(e.target.value)}
                  placeholder="Ví dụ: giong_nu_tram"
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono font-semibold"
                />
              </div>


              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Văn bản tham khảo (Phát âm trong 8s đầu)</label>
                <textarea
                  value={saveVoiceRefText}
                  onChange={(e) => setSaveVoiceRefText(e.target.value)}
                  placeholder="Nhập phần chữ tương ứng với đoạn nói đầu tiên..."
                  rows={2}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-205 focus:outline-none focus:border-indigo-500 resize-none font-semibold"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Chế độ chia sẻ</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                  <button
                    type="button"
                    onClick={() => setSaveVoiceIsPublic(false)}
                    className={`py-2 px-1 text-center font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      !saveVoiceIsPublic
                        ? "bg-slate-850 text-slate-100 border border-slate-800/80 shadow-sm"
                        : "text-slate-500 hover:text-slate-350"
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Riêng tư (Private)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveVoiceIsPublic(true)}
                    className={`py-2 px-1 text-center font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      saveVoiceIsPublic
                        ? "bg-slate-850 text-slate-100 border border-slate-800/80 shadow-sm"
                        : "text-slate-500 hover:text-slate-350"
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
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 rounded-lg cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveVoiceSubmit}
                disabled={isSavingVoice || !saveVoiceName || !saveVoiceRefText}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold text-slate-950 rounded-lg cursor-pointer transition-colors border border-slate-200/10 shadow-sm"
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
