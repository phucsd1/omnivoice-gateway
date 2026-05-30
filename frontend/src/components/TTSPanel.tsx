import React, { useState, useEffect, useRef } from "react";
import { Play, Volume2, UserCheck, HelpCircle, AudioLines, Heart, Lock, Globe, X } from "lucide-react";
import { api } from "../api/client";
import type { JobStatusResponse, VoiceSampleResponse } from "../api/client";

import { JobStatusCard } from "./JobStatusCard";
import { AudioPlayer } from "./AudioPlayer";

interface TTSPanelProps {
  activeVoiceSampleId: string | null;
  onJobCreatedOrUpdated?: () => void;
  layout?: "classic" | "modern";
}

export const TTSPanel: React.FC<TTSPanelProps> = ({ activeVoiceSampleId, onJobCreatedOrUpdated, layout = "classic" }) => {
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
  const [audioChunkDuration, setAudioChunkDuration] = useState(15.0);
  const [audioChunkThreshold, setAudioChunkThreshold] = useState(30.0);

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

  return (
    <div className="bg-card border border-border rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xl transition-all duration-300 relative overflow-hidden">
      {/* Visual background ambient gradient */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col gap-1 relative z-10">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <AudioLines className="w-5 h-5 text-primary" />
          <span>Chuyển đổi văn bản thành giọng nói</span>
        </h2>
        <p className="text-xs text-muted-foreground font-medium">
          Tạo tệp giọng đọc chất lượng cao sử dụng giọng nói clone hoặc tự động.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="flex flex-col gap-6 relative z-10">
        {/* Mode selector */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Chế độ tạo giọng nói</label>
          <div className={`grid ${layout === "modern" ? "grid-cols-2" : "grid-cols-3"} gap-1 p-1 bg-background/60 rounded-xl border border-border/60/30`}>
              <button
                type="button"
                onClick={() => setMode("clone_voice")}
                className={`py-2 px-3 text-center font-bold text-xs rounded-lg transition-all cursor-pointer ${
                  mode === "clone_voice"
                    ? "bg-card border border-border text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {layout === "modern" ? "Sử dụng giọng mẫu" : "Clone Voice"}
              </button>
              <button
                type="button"
                onClick={() => setMode("auto_voice")}
                className={`py-2 px-3 text-center font-bold text-xs rounded-lg transition-all cursor-pointer ${
                  mode === "auto_voice"
                    ? "bg-card border border-border text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Auto Voice
              </button>
              {layout !== "modern" && (
                <button
                  type="button"
                  onClick={() => setMode("voice_design")}
                  className={`py-2 px-3 text-center font-bold text-xs rounded-lg transition-all cursor-pointer ${
                    mode === "voice_design"
                      ? "bg-card border border-border text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Voice Design Direct
                </button>
              )}
            </div>
        </div>

        {/* Dynamic Mode Fields */}
        {mode === "clone_voice" && (
          <div className="flex flex-col gap-4 p-4 bg-background/30 border border-border/60/40 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <UserCheck className="w-4 h-4 text-primary" />
              <span>Cấu hình Clone Voice</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Chọn mẫu giọng từ Thư viện</label>
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
                className="bg-card/40 border border-border/60/40 rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all font-semibold cursor-pointer shadow-sm w-full"
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
              {activeVoiceSampleId && customVoiceSampleId === activeVoiceSampleId && (
                <span className="text-[10px] text-success font-semibold mt-0.5">
                  ✓ Đang kết nối với giọng mẫu được chọn hiện tại.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Văn bản giọng mẫu (ref_text) - Tùy chọn</label>
              <input
                type="text"
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="Ví dụ: Nội dung chữ được nói trong file ghi âm để tăng độ chính xác..."
                className="bg-card/40 border border-border/60/40 rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all font-semibold w-full"
              />
              <span className="text-[9px] text-muted-foreground font-medium leading-tight">
                * Nếu để trống, worker GPU sẽ tự động chạy nhận dạng giọng nói (Whisper ASR) để trích xuất văn bản từ file âm thanh.
              </span>
            </div>
          </div>
        )}

        {mode === "voice_design" && (
          <div className="flex flex-col gap-4 p-4 bg-background/30 border border-border/60/40 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Volume2 className="w-4 h-4 text-primary" />
              <span>Tham số thiết kế trực tiếp (Instruct Tags)</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Instruct Tags (Tiếng Anh)</label>
              <input
                type="text"
                value={instruct}
                onChange={(e) => setInstruct(e.target.value)}
                placeholder="Ví dụ: female, young adult, natural, low pitch..."
                className="bg-card/40 border border-border/60/40 rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all font-semibold font-mono w-full"
              />
              <span className="text-[9px] text-muted-foreground font-medium leading-tight">
                * Các từ khóa: female, male, young adult, older adult, high pitch, low pitch, whisper...
              </span>
            </div>
          </div>
        )}

        {mode === "auto_voice" && (
          <div className="flex items-center gap-2.5 p-4 bg-background/30 border border-border/60/40 rounded-2xl text-xs text-muted-foreground font-medium shadow-sm">
            <HelpCircle className="w-4.5 h-4.5 text-primary flex-shrink-0" />
            <span>Chế độ Auto Voice sẽ để OmniVoice tự động lựa chọn giọng đọc ngẫu nhiên.</span>
          </div>
        )}

        {/* TTS script */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nội dung văn bản cần chuyển thành tiếng nói</label>
          <div className="relative flex flex-col bg-background border border-border/60/30 rounded-2xl p-4 md:p-5 focus-within:border-primary/30 transition-all shadow-inner">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập đoạn văn bản cần tạo thành tệp âm thanh..."
              rows={5}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none font-medium leading-relaxed"
              maxLength={5000}
            />
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/60 select-none">
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                Tiếng Việt (OmniVoice)
              </span>
              <span className="text-[10px] font-mono font-bold text-muted-foreground select-none">
                {text.length} / 5000 ký tự &nbsp;•&nbsp; {text.trim().split(/\s+/).filter(Boolean).length} từ
              </span>
            </div>
          </div>
        </div>

        {/* Non-verbal symbols & pronunciation widget */}
        <div className="flex flex-col gap-3.5 p-4 bg-background/40 border border-border/80 rounded-2xl shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <span>Biểu cảm &amp; Phát âm nâng cao (OmniVoice)</span>
            </span>
          </div>
          
          <div className="flex flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => insertTag("[laughter]")}
              className="px-2.5 py-1.5 bg-card/60 hover:bg-muted border border-border/80 text-[10px] text-primary hover:text-primary/90 font-bold rounded-lg cursor-pointer transition-colors"
              title="Chèn âm cười"
            >
              😊 Cười [laughter]
            </button>
            <button
              type="button"
              onClick={() => insertTag("[sigh]")}
              className="px-2.5 py-1.5 bg-card/60 hover:bg-muted border border-border/80 text-[10px] text-primary hover:text-primary/90 font-bold rounded-lg cursor-pointer transition-colors"
              title="Chèn tiếng thở dài"
            >
              😮‍💨 Thở dài [sigh]
            </button>
            <button
              type="button"
              onClick={() => insertTag("[sniff]")}
              className="px-2.5 py-1.5 bg-card/60 hover:bg-muted border border-border/80 text-[10px] text-primary hover:text-primary/90 font-bold rounded-lg cursor-pointer transition-colors"
              title="Chèn tiếng sụt sịt"
            >
              👃 Sụt sịt [sniff]
            </button>
            <button
              type="button"
              onClick={() => insertTag("[question-en]")}
              className="px-2.5 py-1.5 bg-card/60 hover:bg-muted border border-border/80 text-[10px] text-primary hover:text-primary/90 font-bold rounded-lg cursor-pointer transition-colors"
              title="Chèn ngữ điệu nghi vấn tiếng Anh"
            >
              ❓ Hỏi (EN) [question-en]
            </button>
            <button
              type="button"
              onClick={() => insertTag("[surprise-ah]")}
              className="px-2.5 py-1.5 bg-card/60 hover:bg-muted border border-border/80 text-[10px] text-primary hover:text-primary/90 font-bold rounded-lg cursor-pointer transition-colors"
              title="Chèn tiếng ngạc nhiên 'Ah'"
            >
              😲 Ngạc nhiên [surprise-ah]
            </button>
            <button
              type="button"
              onClick={() => insertTag("[dissatisfaction-hnn]")}
              className="px-2.5 py-1.5 bg-card/60 hover:bg-muted border border-border/80 text-[10px] text-primary hover:text-primary/90 font-bold rounded-lg cursor-pointer transition-colors"
              title="Chèn tiếng bất bình 'Hnn'"
            >
              😒 Bất bình [dissatisfaction-hnn]
            </button>
          </div>

          <div className="text-[10px] text-muted-foreground leading-normal border-t border-border/60 pt-2.5 mt-1 space-y-1 select-none">
            <div>
              💡 <strong>Sửa phát âm:</strong> 
              <span className="ml-1 text-muted-foreground font-medium">Tiếng Anh: nhúng CMU Dictionary viết hoa trong ngoặc, ví dụ: </span>
              <code className="bg-card/80 border border-border/60 px-1.5 py-0.5 rounded text-primary font-mono select-all font-semibold">[B EY1 S]</code>
            </div>
            <div>
              <span className="ml-5 text-muted-foreground font-medium">Tiếng Trung: sử dụng Pinyin viết hoa kèm số thanh điệu, ví dụ: </span>
              <code className="bg-card/80 border border-border/60 px-1.5 py-0.5 rounded text-primary font-mono select-all font-semibold">ZHE2</code>
            </div>
          </div>
        </div>

        {/* Advanced parameters: Speed and Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-background/40 border border-border/80 rounded-2xl shadow-inner">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-muted-foreground uppercase tracking-wider">Tốc độ nói: {speed.toFixed(1)}x</label>
              <span className="text-[10px] text-muted-foreground font-bold font-mono select-none">0.5x - 2.0x</span>
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
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">
              Mặc định: 1.0
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-muted-foreground uppercase tracking-wider">Độ chính xác (Steps): {numStep}</label>
              <span className="text-[10px] text-muted-foreground font-bold font-mono select-none">10 - 64</span>
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
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">
              Mặc định: 32 (16 bước để chạy nhanh hơn)
            </span>
          </div>
        </div>

        {/* Toggle Advanced Settings */}
        <div className="border-t border-border/80 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-extrabold transition-colors cursor-pointer select-none"
          >
            <span>{showAdvanced ? "Ẩn cấu hình nâng cao" : "Hiện cấu hình nâng cao (OmniVoice)"}</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="flex flex-col gap-4 p-4 bg-background/40 border border-border/80 rounded-2xl shadow-inner">
            {/* Toggles Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={denoise}
                  onChange={(e) => setDenoise(e.target.checked)}
                  className="rounded border-border/60 bg-card text-foreground focus:ring-slate-700 w-4 h-4 cursor-pointer"
                />
                <span>Denoise (Lọc nhiễu)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preprocessPrompt}
                  onChange={(e) => setPreprocessPrompt(e.target.checked)}
                  className="rounded border-border/60 bg-card text-foreground focus:ring-slate-700 w-4 h-4 cursor-pointer"
                />
                <span>Tiền xử lý tham chiếu</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={postprocessOutput}
                  onChange={(e) => setPostprocessOutput(e.target.checked)}
                  className="rounded border-border/60 bg-card text-foreground focus:ring-slate-700 w-4 h-4 cursor-pointer"
                />
                <span>Hậu xử lý đầu ra</span>
              </label>
            </div>

            <div className="h-px bg-card/60 my-1" />

            {/* Sliders and text fields grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-muted-foreground">Guidance Scale: {guidanceScale.toFixed(1)}</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">0.5 - 5.0</span>
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
                  <span className="font-bold text-muted-foreground">Time-step Shift (t_shift): {tShift.toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">0.01 - 0.50</span>
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
                  <span className="font-bold text-muted-foreground">Position Temperature: {positionTemperature.toFixed(1)}</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">0.0 - 10.0</span>
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
                  <span className="font-bold text-muted-foreground">Class Temperature: {classTemperature.toFixed(1)}</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">0.0 - 5.0</span>
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
                  <span className="font-bold text-muted-foreground">Layer Penalty Factor: {layerPenaltyFactor.toFixed(1)}</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">0.0 - 10.0</span>
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
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Thời lượng cố định (Duration - giây)</label>
                <input
                  type="number" step="0.1" min="0.1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Mặc định: Tự động tính theo văn bản"
                  className="bg-card/60 border border-border/80 rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-border transition-all font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-muted-foreground">Đoạn cắt (Chunk Duration): {audioChunkDuration.toFixed(0)}s</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">5 - 60</span>
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
                  <span className="font-bold text-muted-foreground">Ngưỡng cắt (Chunk Threshold): {audioChunkThreshold.toFixed(0)}s</span>
                  <span className="text-[10px] text-muted-foreground font-bold font-mono">10 - 120</span>
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
          <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !text}
          className={`w-full py-3 px-6 rounded-full font-bold text-sm transition-all duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-md ${
            !loading && text
              ? "bg-primary text-primary-foreground hover:bg-primary/90 border border-border/30"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span>Đang xử lý TTS Job...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
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
            <div className="flex flex-col gap-2 mt-1">
              <AudioPlayer
                url={`${api.getApiBaseUrl()}${jobStatus.audio_url}`}
                title="TTS Output"
              />
              <button
                type="button"
                onClick={() => handleOpenSaveModal(jobStatus.job_id, text)}
                className="w-full py-2.5 px-4 bg-background hover:bg-card border border-border/80 text-foreground rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm mt-1"
              >
                <Heart className="w-3.5 h-3.5 fill-slate-300 text-foreground" />
                <span>Lưu giọng nói này vào Thư viện</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Save Voice Modal Overlay */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl relative">
            <button
              onClick={() => setIsSaveModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                        ? "bg-primary text-white shadow-sm"
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
