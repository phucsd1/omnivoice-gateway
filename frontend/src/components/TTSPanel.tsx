import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Heart, Lock, Globe, X } from "lucide-react";
import { api } from "../api/client";
import type { JobStatusResponse, VoiceSampleResponse } from "../api/client";

import { JobStatusCard } from "./JobStatusCard";

interface TTSPanelProps {
  activeVoiceSampleId: string | null;
  onJobCreatedOrUpdated?: () => void;
  layout?: "classic" | "modern";
  currentPlayUrl: string | null;
  globalPlayerPlaying: boolean;
  onPlayAudio: (url: string, title: string) => void;
  onTogglePlay: () => void;
}

export const TTSPanel: React.FC<TTSPanelProps> = ({
  activeVoiceSampleId,
  onJobCreatedOrUpdated,
  layout = "classic",
  currentPlayUrl,
  globalPlayerPlaying,
  onPlayAudio,
  onTogglePlay,
}) => {
  const [mode, setMode] = useState<"clone_voice" | "auto_voice" | "voice_design">("clone_voice");
  const [text, setText] = useState("Học sinh hôm nay được nghỉ học do thời tiết xấu. Xin nhắc lại, học sinh được nghỉ học.");
  const [customVoiceSampleId, setCustomVoiceSampleId] = useState("");
  const [refText, setRefText] = useState("");
  const [instruct, setInstruct] = useState("female, young adult, natural");
  
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [numStep, setNumStep] = useState(32);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText(prev => prev + " " + tag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    
    const nextText = currentText.substring(0, start) + tag + currentText.substring(end);
    setText(nextText);

    // Reposition cursor after the inserted tag
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }, 10);
  };

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
  const [audioChunkDuration] = useState(15.0);
  const [audioChunkThreshold] = useState(30.0);

  const pollIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Favorite Voices states
  const [voiceSamples, setVoiceSamples] = useState<VoiceSampleResponse[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveVoiceName, setSaveVoiceName] = useState("");
  const [saveVoiceRefText, setSaveVoiceRefText] = useState("");
  const [saveVoiceCustomId, setSaveVoiceCustomId] = useState("");
  const [saveVoiceIsPublic, setSaveVoiceIsPublic] = useState(false);
  const [saveVoiceJobId, setSaveVoiceJobId] = useState<string | null>(null);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveVoiceStatus, setSaveVoiceStatus] = useState<string | null>(null);

  const fetchVoiceSamples = async () => {
    try {
      const samples = await api.listVoiceSamples();
      setVoiceSamples(samples);
    } catch (err) {
      console.error("Lỗi lấy danh sách mẫu giọng:", err);
    }
  };

  useEffect(() => {
    fetchVoiceSamples();
  }, []);

  // Sync active sample ID from props to local input
  useEffect(() => {
    if (activeVoiceSampleId) {
      setCustomVoiceSampleId(activeVoiceSampleId);
      fetchVoiceSamples();
    }
  }, [activeVoiceSampleId]);

  useEffect(() => {
    if (layout === "modern" && mode === "voice_design") {
      setMode("clone_voice");
    }
  }, [layout, mode]);

  const handleOpenSaveModal = (targetJobId: string, fullText: string) => {
    setSaveVoiceJobId(targetJobId);
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
    if (!saveVoiceJobId || !saveVoiceName || !saveVoiceRefText) return;
    setIsSavingVoice(true);
    setSaveVoiceStatus(null);

    try {
      await api.saveFavoriteVoice({
        job_id: saveVoiceJobId,
        name: saveVoiceName,
        is_public: saveVoiceIsPublic,
        ref_text: saveVoiceRefText,
        custom_id: saveVoiceCustomId || undefined,
      });
      setSaveVoiceStatus("Lưu giọng thành công vào Thư viện!");
      setTimeout(() => {
        setIsSaveModalOpen(false);
        fetchVoiceSamples();
      }, 1500);
    } catch (err: any) {
      setSaveVoiceStatus(`Lỗi: ${err.message || "Không thể lưu giọng."}`);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text) return;

    setLoading(true);
    setJobId(null);
    setJobStatus(null);
    setErrorMsg(null);

    const voiceSampleId = mode === "clone_voice" ? customVoiceSampleId : undefined;
    const instructParam = mode === "voice_design" ? instruct : undefined;
    const refTextParam = mode === "clone_voice" && refText ? refText : undefined;

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
      const res = await api.createTTSJob(mode, text, voiceSampleId, instructParam, speed, numStep, params, refTextParam);
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
      onJobCreatedOrUpdated?.();
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

  useEffect(() => {
    const handleRegenerateEvent = () => {
      const mockEvent = {
        preventDefault: () => {}
      } as React.FormEvent;
      handleGenerate(mockEvent);
    };
    window.addEventListener("omnivoice:regenerate", handleRegenerateEvent);
    return () => {
      window.removeEventListener("omnivoice:regenerate", handleRegenerateEvent);
    };
  }, [text, customVoiceSampleId, instruct, refText, speed, numStep, denoise, guidanceScale, tShift, positionTemperature, classTemperature, layerPenaltyFactor, duration, preprocessPrompt, postprocessOutput, audioChunkDuration, audioChunkThreshold, mode]);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header section */}
      <div className="flex flex-col gap-1 select-none max-w-[960px] mx-auto w-full">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Text to Speech</h1>
        <p className="text-xs text-muted-foreground font-medium">
          Tạo giọng nói tự nhiên từ văn bản bằng OmniVoice.
        </p>
      </div>

      <div className="w-full max-w-[960px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Main Editor (8/12) */}
        <div className="xl:col-span-8 flex flex-col gap-5">
          {/* Selected Voice Card (compact) */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mẫu giọng (Voice Sample)</span>
              {activeVoiceSampleId && customVoiceSampleId === activeVoiceSampleId && (
                <span className="text-[9px] text-success font-bold flex items-center gap-1">
                  ✓ Giọng đã chọn
                </span>
              )}
            </div>
            
            {mode === "clone_voice" ? (
              <select
                value={customVoiceSampleId}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomVoiceSampleId(val);
                  const found = voiceSamples.find(s => s.id === val);
                  if (found && found.ref_text) {
                    setRefText(found.ref_text);
                  } else {
                    setRefText("");
                  }
                }}
                className="bg-secondary/50 border border-border/70 hover:border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold cursor-pointer shadow-sm w-full"
              >
                <option value="">-- Chọn một mẫu giọng --</option>
                <optgroup label="Giọng cá nhân (Private)">
                  {voiceSamples.filter(s => !s.is_public).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name ? `${s.name} (${s.id.substring(0, 10)}...)` : s.id} {s.duration ? `[${s.duration.toFixed(1)}s]` : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Giọng cộng đồng (Public)">
                  {voiceSamples.filter(s => s.is_public).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name ? `${s.name} (${s.id.substring(0, 10)}...)` : s.id} {s.duration ? `[${s.duration.toFixed(1)}s]` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            ) : mode === "auto_voice" ? (
              <div className="bg-secondary/40 border border-border/60 rounded-xl px-4 py-2.5 text-xs text-muted-foreground font-medium select-none">
                Auto Voice — Sử dụng giọng ngẫu nhiên
              </div>
            ) : (
              <div className="bg-secondary/40 border border-border/60 rounded-xl px-4 py-2.5 text-xs text-muted-foreground font-medium select-none">
                Voice Design Direct — Tạo giọng từ mô tả bên cột cài đặt
              </div>
            )}
          </div>

          {/* Large text area block */}
          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            <div className="relative flex flex-col bg-card border border-border focus-within:ring-2 focus-within:ring-primary/20 transition-all rounded-2xl p-4 shadow-sm">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Nhập đoạn văn bản cần tạo thành tệp âm thanh..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none font-medium leading-relaxed min-h-[280px] max-h-[420px]"
                maxLength={5000}
              />
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-border select-none text-[10px] text-muted-foreground font-bold">
                <span>Tiếng Việt - OmniVoice</span>
                <span className="font-mono">
                  {text.length} / 5000 ký tự &nbsp;•&nbsp; {text.trim().split(/\s+/).filter(Boolean).length} từ
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {/* Generate CTA Button */}
            <button
              type="submit"
              disabled={loading || !text}
              className={`w-full h-11 rounded-xl font-bold text-xs transition-all duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                !loading && text
                  ? "bg-gradient-to-r from-primary to-accent text-white border-none shadow-lg shadow-primary/10 hover:brightness-105"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                  <span>Đang xử lý TTS Job...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tạo tệp giọng đọc (Generate)</span>
                </>
              )}
            </button>
          </form>

          {/* Progress and status display */}
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
                <div className={`flex gap-3 items-center p-3.5 rounded-xl select-none border transition-all duration-300 ${
                  currentPlayUrl === `${api.getApiBaseUrl()}${jobStatus.audio_url}`
                    ? "border-primary bg-primary/[0.02]"
                    : "border-border bg-card shadow-sm"
                }`}>
                  <button
                    type="button"
                    onClick={() => {
                      const audioUrl = `${api.getApiBaseUrl()}${jobStatus.audio_url}`;
                      if (currentPlayUrl === audioUrl) {
                        onTogglePlay();
                      } else {
                        onPlayAudio(audioUrl, "TTS Output");
                      }
                    }}
                    className={`py-2 px-4 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border shadow-sm shrink-0 ${
                      currentPlayUrl === `${api.getApiBaseUrl()}${jobStatus.audio_url}` && globalPlayerPlaying
                        ? "bg-primary text-white border-primary shadow-primary/10"
                        : "border-border hover:border-primary/45 hover:bg-secondary text-foreground bg-card"
                    }`}
                  >
                    {currentPlayUrl === `${api.getApiBaseUrl()}${jobStatus.audio_url}` && globalPlayerPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Tạm dừng</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        <span>Nghe kết quả</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleOpenSaveModal(jobStatus.job_id, text)}
                    className="flex-grow py-2 px-4 bg-card hover:bg-secondary border border-border text-foreground rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                  >
                    <Heart className="w-3.5 h-3.5 fill-current text-destructive shrink-0" />
                    <span>Lưu vào Thư viện</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Settings Panel (4/12) */}
        <div className="xl:col-span-4 bg-card border border-border rounded-2xl p-5 flex flex-col gap-5 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border select-none">
            <span className="text-xs font-bold text-foreground">Cấu hình tham số</span>
          </div>

          {/* Voice Mode selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Voice Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="bg-secondary/40 border border-border/70 rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none w-full cursor-pointer shadow-sm"
            >
              <option value="clone_voice">Sử dụng giọng mẫu</option>
              <option value="auto_voice">Auto Voice</option>
              <option value="voice_design">Voice Design Direct</option>
            </select>
          </div>

          {/* Reference Text - only for clone mode */}
          {mode === "clone_voice" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reference Text (ref_text)</label>
              <input
                type="text"
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="Nội dung nói trong file mẫu..."
                className="bg-secondary/40 border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none w-full font-medium"
              />
              <span className="text-[9px] text-muted-foreground leading-snug">
                * Nếu bỏ trống, Whisper ASR sẽ tự động nhận diện từ file mẫu.
              </span>
            </div>
          )}

          {/* Instruct tag for voice design */}
          {mode === "voice_design" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Instruct Tags (Tiếng Anh)</label>
              <input
                type="text"
                value={instruct}
                onChange={(e) => setInstruct(e.target.value)}
                placeholder="female, young adult, natural, low pitch..."
                className="bg-secondary/40 border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none w-full font-mono font-medium"
              />
            </div>
          )}

          {/* Output Format (Placeholder) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Đầu ra (Format)</label>
            <select
              disabled
              className="bg-secondary/20 border border-border/50 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground focus:outline-none w-full cursor-not-allowed shadow-none"
            >
              <option value="wav">WAV (Lossless 24kHz)</option>
              <option value="mp3">MP3 (Coming Soon)</option>
            </select>
          </div>

          {/* Basic parameters: Speed */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>Tốc độ (Speed): {speed.toFixed(1)}x</span>
              <span className="font-mono">0.5x - 2.0x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="seekbar w-full"
              style={{
                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(speed - 0.5) / 1.5 * 100}%, var(--slider-track) ${(speed - 0.5) / 1.5 * 100}%, var(--slider-track) 100%)`
              }}
            />
          </div>

          {/* Basic parameters: Steps */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>Độ chính xác (Steps): {numStep}</span>
              <span className="font-mono">10 - 64</span>
            </div>
            <input
              type="range"
              min="10"
              max="64"
              step="1"
              value={numStep}
              onChange={(e) => setNumStep(parseInt(e.target.value))}
              className="seekbar w-full"
              style={{
                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(numStep - 10) / 54 * 100}%, var(--slider-track) ${(numStep - 10) / 54 * 100}%, var(--slider-track) 100%)`
              }}
            />
          </div>

          {/* Emotion tags pills */}
          <div className="flex flex-col gap-2 pt-3 border-t border-border">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Biểu cảm nhanh (Emotion tags)</label>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => insertTag("[laughter]")}
                className="px-2 py-1 bg-secondary/50 hover:bg-secondary border border-border text-[9px] text-foreground font-semibold rounded transition-colors cursor-pointer"
              >
                😊 Cười
              </button>
              <button
                type="button"
                onClick={() => insertTag("[sigh]")}
                className="px-2 py-1 bg-secondary/50 hover:bg-secondary border border-border text-[9px] text-foreground font-semibold rounded transition-colors cursor-pointer"
              >
                😮‍💨 Thở dài
              </button>
              <button
                type="button"
                onClick={() => insertTag("[sniff]")}
                className="px-2 py-1 bg-secondary/50 hover:bg-secondary border border-border text-[9px] text-foreground font-semibold rounded transition-colors cursor-pointer"
              >
                👃 Sụt sịt
              </button>
              <button
                type="button"
                onClick={() => insertTag("[surprise-ah]")}
                className="px-2 py-1 bg-secondary/50 hover:bg-secondary border border-border text-[9px] text-foreground font-semibold rounded transition-colors cursor-pointer"
              >
                😲 Ngạc nhiên
              </button>
              <button
                type="button"
                onClick={() => insertTag("[dissatisfaction-hnn]")}
                className="px-2 py-1 bg-secondary/50 hover:bg-secondary border border-border text-[9px] text-foreground font-semibold rounded transition-colors cursor-pointer"
              >
                😒 Bất bình
              </button>
              <button
                type="button"
                onClick={() => insertTag("[question-en]")}
                className="px-2 py-1 bg-secondary/50 hover:bg-secondary border border-border text-[9px] text-foreground font-semibold rounded transition-colors cursor-pointer"
              >
                ❓ Hỏi (EN)
              </button>
            </div>
          </div>

          {/* Advanced accordion */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-[10px] text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider transition-colors cursor-pointer select-none"
            >
              <span>Tham số nâng cao (Advanced)</span>
              <span>{showAdvanced ? "▲" : "▼"}</span>
            </button>

            {showAdvanced && (
              <div className="flex flex-col gap-4 mt-4 animate-fadeIn">
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={denoise}
                    onChange={(e) => setDenoise(e.target.checked)}
                    className="rounded border-border bg-card text-foreground focus:ring-slate-700 w-4 h-4 cursor-pointer"
                  />
                  <span>Denoise (Lọc nhiễu)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={preprocessPrompt}
                    onChange={(e) => setPreprocessPrompt(e.target.checked)}
                    className="rounded border-border bg-card text-foreground focus:ring-slate-700 w-4 h-4 cursor-pointer"
                  />
                  <span>Tiền xử lý tham chiếu</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={postprocessOutput}
                    onChange={(e) => setPostprocessOutput(e.target.checked)}
                    className="rounded border-border bg-card text-foreground focus:ring-slate-700 w-4 h-4 cursor-pointer"
                  />
                  <span>Hậu xử lý đầu ra</span>
                </label>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Guidance Scale: {guidanceScale.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min="0.5" max="5.0" step="0.1"
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                    className="seekbar w-full"
                    style={{
                      background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(guidanceScale - 0.5) / 4.5 * 100}%, var(--slider-track) ${(guidanceScale - 0.5) / 4.5 * 100}%, var(--slider-track) 100%)`
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Time-step Shift (t_shift): {tShift.toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0.01" max="0.50" step="0.01"
                    value={tShift}
                    onChange={(e) => setTShift(parseFloat(e.target.value))}
                    className="seekbar w-full"
                    style={{
                      background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(tShift - 0.01) / 0.49 * 100}%, var(--slider-track) ${(tShift - 0.01) / 0.49 * 100}%, var(--slider-track) 100%)`
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Position Temperature: {positionTemperature.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min="0.0" max="10.0" step="0.5"
                    value={positionTemperature}
                    onChange={(e) => setPositionTemperature(parseFloat(e.target.value))}
                    className="seekbar w-full"
                    style={{
                      background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${positionTemperature * 10}%, var(--slider-track) ${positionTemperature * 10}%, var(--slider-track) 100%)`
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Class Temperature: {classTemperature.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min="0.0" max="5.0" step="0.1"
                    value={classTemperature}
                    onChange={(e) => setClassTemperature(parseFloat(e.target.value))}
                    className="seekbar w-full"
                    style={{
                      background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${classTemperature * 20}%, var(--slider-track) ${classTemperature * 20}%, var(--slider-track) 100%)`
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Layer Penalty Factor: {layerPenaltyFactor.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min="0.0" max="10.0" step="0.5"
                    value={layerPenaltyFactor}
                    onChange={(e) => setLayerPenaltyFactor(parseFloat(e.target.value))}
                    className="seekbar w-full"
                    style={{
                      background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${layerPenaltyFactor * 10}%, var(--slider-track) ${layerPenaltyFactor * 10}%, var(--slider-track) 100%)`
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Thời lượng cố định (Duration)</label>
                  <input
                    type="number" step="0.1" min="0.1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="Mặc định: Tự động"
                    className="bg-secondary/40 border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none w-full"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Voice Modal Overlay */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl relative">
            <button
              onClick={() => setIsSaveModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer animate-fadeIn"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="p-2 bg-success/10 rounded-xl text-success">
                <Heart className="w-5 h-5 fill-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Lưu giọng nói yêu thích</h3>
                <p className="text-[10px] text-muted-foreground font-semibold">Cắt 8 giây đầu và lưu làm mẫu clone giọng</p>
              </div>
            </div>

            {saveVoiceStatus && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold border ${saveVoiceStatus.startsWith("Lỗi") ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-success/10 border-success/20 text-success"}`}>
                {saveVoiceStatus}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tên giọng mẫu</label>
                <input
                  type="text"
                  value={saveVoiceName}
                  onChange={(e) => setSaveVoiceName(e.target.value)}
                  placeholder="Ví dụ: Giọng nữ trầm ấm..."
                  className="bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-primary font-semibold"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mã ID giọng nói (slug - Không bắt buộc)</label>
                <input
                  type="text"
                  value={saveVoiceCustomId}
                  onChange={(e) => setSaveVoiceCustomId(e.target.value)}
                  placeholder="Ví dụ: giong_nu_tram"
                  className="bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-primary font-mono font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Văn bản tham khảo (Phát âm trong 8s đầu)</label>
                <textarea
                  value={saveVoiceRefText}
                  onChange={(e) => setSaveVoiceRefText(e.target.value)}
                  placeholder="Nhập phần chữ tương ứng với đoạn nói đầu tiên..."
                  rows={2}
                  className="bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-primary resize-none font-semibold"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Chế độ chia sẻ</label>
                <div className="grid grid-cols-2 gap-2 bg-background p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setSaveVoiceIsPublic(false)}
                    className={`py-2 px-1 text-center font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      !saveVoiceIsPublic
                        ? "bg-muted text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
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
                        ? "bg-gradient-to-r from-primary to-accent text-white shadow-sm border-none"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Công khai (Public)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 bg-muted hover:bg-muted border border-border text-xs font-semibold text-foreground rounded-lg cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveVoiceSubmit}
                disabled={isSavingVoice || !saveVoiceName || !saveVoiceRefText}
                className="px-4 py-2 bg-success hover:bg-success/90 disabled:bg-muted disabled:text-muted-foreground text-xs font-bold text-white rounded-lg cursor-pointer transition-colors"
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
