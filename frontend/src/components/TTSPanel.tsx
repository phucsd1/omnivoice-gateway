import React, { useState, useEffect, useRef } from "react";
import { Play, Volume2, UserCheck, HelpCircle, AudioLines, Loader2, Settings } from "lucide-react";
import { api } from "../api/client";
import type { JobStatusResponse } from "../api/client";

import { JobStatusCard } from "./JobStatusCard";
import { AudioPlayer } from "./AudioPlayer";

interface TTSPanelProps {
  activeVoiceSampleId: string | null;
}

export const TTSPanel: React.FC<TTSPanelProps> = ({ activeVoiceSampleId }) => {
  const [mode, setMode] = useState<"clone_voice" | "auto_voice" | "voice_design">("clone_voice");
  const [text, setText] = useState("Học sinh hôm nay được nghỉ học do thời tiết xấu. Xin nhắc lại, học sinh được nghỉ học.");
  const [customVoiceSampleId, setCustomVoiceSampleId] = useState("");
  const [instruct, setInstruct] = useState("female, young adult, natural");
  
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [numStep, setNumStep] = useState(32);

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

  // Sync active sample ID from props to local input
  useEffect(() => {
    if (activeVoiceSampleId) {
      setCustomVoiceSampleId(activeVoiceSampleId);
    }
  }, [activeVoiceSampleId]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text) return;

    setLoading(true);
    setJobId(null);
    setJobStatus(null);
    setErrorMsg(null);

    const voiceSampleId = mode === "clone_voice" ? customVoiceSampleId : undefined;
    const instructParam = mode === "voice_design" ? instruct : undefined;

    if (mode === "clone_voice" && !voiceSampleId) {
      setErrorMsg("Vui lòng tải lên mẫu giọng hoặc điền mã Voice Sample ID để clone.");
      setLoading(false);
      return;
    }

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
      const res = await api.createTTSJob(mode, text, voiceSampleId, instructParam, speed, numStep, params);
      setJobId(res.job_id);
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
      setErrorMsg(err.message || "Không thể khởi tạo tiến trình TTS.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPolling && jobId) {
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-lg">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <AudioLines className="w-5 h-5 text-indigo-400" />
          <span>3. Chuyển văn bản thành giọng nói (TTS Job)</span>
        </h2>
        <p className="text-xs text-slate-400">
          Chạy job tạo giọng đọc từ văn bản với cấu hình giọng clone hoặc tự động.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="flex flex-col gap-4">
        {/* Mode selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">Chế độ tạo giọng nói</label>
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
            <button
              type="button"
              onClick={() => setMode("clone_voice")}
              className={`py-2 px-1 text-center font-bold text-xs rounded transition-all cursor-pointer ${
                mode === "clone_voice"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Clone Voice
            </button>
            <button
              type="button"
              onClick={() => setMode("auto_voice")}
              className={`py-2 px-1 text-center font-bold text-xs rounded transition-all cursor-pointer ${
                mode === "auto_voice"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Auto Voice
            </button>
            <button
              type="button"
              onClick={() => setMode("voice_design")}
              className={`py-2 px-1 text-center font-bold text-xs rounded transition-all cursor-pointer ${
                mode === "voice_design"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Voice Design Direct
            </button>
          </div>
        </div>

        {/* Dynamic Mode Fields */}
        {mode === "clone_voice" && (
          <div className="flex flex-col gap-2 p-3.5 bg-slate-950 border border-slate-850 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <UserCheck className="w-4 h-4 text-indigo-400" />
              <span>Cấu hình Clone Voice</span>
            </div>
            <div className="flex flex-col gap-1.5 mt-1.5">
              <label className="text-[11px] font-semibold text-slate-450">Mã mẫu giọng tham chiếu (Voice Sample ID)</label>
              <input
                type="text"
                value={customVoiceSampleId}
                onChange={(e) => setCustomVoiceSampleId(e.target.value)}
                placeholder="Ví dụ: vs_xxx (Hệ thống sẽ lấy tự động khi bạn Tải lên hoặc Chấp nhận preview)"
                className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              />
              {activeVoiceSampleId && customVoiceSampleId === activeVoiceSampleId && (
                <span className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                  ✓ Đang kết nối với giọng mẫu được chọn hiện tại.
                </span>
              )}
            </div>
          </div>
        )}

        {mode === "voice_design" && (
          <div className="flex flex-col gap-2 p-3.5 bg-slate-950 border border-slate-850 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <Volume2 className="w-4 h-4 text-indigo-400" />
              <span>Tham số thiết kế trực tiếp (Instruct Tags)</span>
            </div>
            <div className="flex flex-col gap-1.5 mt-1.5">
              <label className="text-[11px] font-semibold text-slate-450">Instruct Tags (Tiếng Anh)</label>
              <input
                type="text"
                value={instruct}
                onChange={(e) => setInstruct(e.target.value)}
                placeholder="Ví dụ: female, young adult, natural, low pitch..."
                className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              />
              <span className="text-[9px] text-slate-500 leading-tight">
                * Các từ khóa: female, male, young adult, older adult, high pitch, low pitch, whisper...
              </span>
            </div>
          </div>
        )}

        {mode === "auto_voice" && (
          <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-400">
            <HelpCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>Chế độ Auto Voice sẽ để OmniVoice tự động lựa chọn giọng đọc ngẫu nhiên.</span>
          </div>
        )}

        {/* TTS script */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">Nội dung văn bản cần chuyển thành tiếng nói</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nhập đoạn văn bản cần tạo thành tệp âm thanh..."
            rows={4}
            className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-650 resize-y"
          />
        </div>

        {/* Advanced parameters: Speed and Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950 border border-slate-850 rounded-xl">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-slate-350">Tốc độ nói (Speed): {speed.toFixed(1)}x</label>
              <span className="text-[10px] text-slate-505 font-mono">0.5x - 2.0x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-colors"
            />
            <span className="text-[10px] text-slate-500 leading-tight">
              Mặc định: 1.0
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-slate-350">Độ chính xác (Steps): {numStep}</label>
              <span className="text-[10px] text-slate-505 font-mono">10 - 64</span>
            </div>
            <input
              type="range"
              min="10"
              max="64"
              step="1"
              value={numStep}
              onChange={(e) => setNumStep(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-colors"
            />
            <span className="text-[10px] text-slate-500 leading-tight">
              Mặc định: 32 (16 bước để chạy nhanh hơn)
            </span>
        </div>

        {/* Toggle Advanced Settings */}
        <div className="border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
          >
            <span>{showAdvanced ? "Ẩn cấu hình nâng cao" : "Hiện cấu hình nâng cao (OmniVoice)"}</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="flex flex-col gap-4 p-4 bg-slate-950/60 border border-slate-850 rounded-xl">
            {/* Toggles Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-355 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={denoise}
                  onChange={(e) => setDenoise(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Denoise (Lọc nhiễu)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-355 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preprocessPrompt}
                  onChange={(e) => setPreprocessPrompt(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Tiền xử lý tham chiếu</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-355 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={postprocessOutput}
                  onChange={(e) => setPostprocessOutput(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Hậu xử lý đầu ra</span>
              </label>
            </div>

            <div className="h-px bg-slate-900 my-1" />

            {/* Sliders and text fields grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Guidance Scale: {guidanceScale.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-mono">0.5 - 5.0</span>
                </div>
                <input
                  type="range" min="0.5" max="5.0" step="0.1"
                  value={guidanceScale}
                  onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Time-step Shift (t_shift): {tShift.toFixed(2)}</span>
                  <span className="text-[10px] text-slate-500 font-mono">0.01 - 0.50</span>
                </div>
                <input
                  type="range" min="0.01" max="0.50" step="0.01"
                  value={tShift}
                  onChange={(e) => setTShift(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Position Temperature: {positionTemperature.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-mono">0.0 - 10.0</span>
                </div>
                <input
                  type="range" min="0.0" max="10.0" step="0.5"
                  value={positionTemperature}
                  onChange={(e) => setPositionTemperature(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Class Temperature: {classTemperature.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-mono">0.0 - 5.0</span>
                </div>
                <input
                  type="range" min="0.0" max="5.0" step="0.1"
                  value={classTemperature}
                  onChange={(e) => setClassTemperature(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Layer Penalty Factor: {layerPenaltyFactor.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-500 font-mono">0.0 - 10.0</span>
                </div>
                <input
                  type="range" min="0.0" max="10.0" step="0.5"
                  value={layerPenaltyFactor}
                  onChange={(e) => setLayerPenaltyFactor(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-350">Thời lượng cố định (Duration - giây)</label>
                <input
                  type="number" step="0.1" min="0.1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Mặc định: Tự động tính theo văn bản"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Đoạn cắt (Chunk Duration): {audioChunkDuration.toFixed(0)}s</span>
                  <span className="text-[10px] text-slate-500 font-mono">5 - 60</span>
                </div>
                <input
                  type="range" min="5" max="60" step="1"
                  value={audioChunkDuration}
                  onChange={(e) => setAudioChunkDuration(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-350">Ngưỡng cắt (Chunk Threshold): {audioChunkThreshold.toFixed(0)}s</span>
                  <span className="text-[10px] text-slate-500 font-mono">10 - 120</span>
                </div>
                <input
                  type="range" min="10" max="120" step="5"
                  value={audioChunkThreshold}
                  onChange={(e) => setAudioChunkThreshold(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !text}
          className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
            !loading && text
              ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-650/10"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang xử lý TTS Job...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Tạo tệp giọng đọc</span>
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
            <AudioPlayer
              url={`${api.getApiBaseUrl()}${jobStatus.audio_url}`}
              title="Tệp âm thanh kết xuất (TTS Output)"
            />
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
