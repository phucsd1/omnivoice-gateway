import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  ChevronDown, 
  Download, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  RotateCcw, 
  RotateCw, 
  Sparkles, 
  AlertCircle, 
  Info, 
  FileText, 
  Settings, 
  PlayCircle,
  Loader2,
  AlignLeft
} from "lucide-react";
import { api } from "../api/client";
import type { JobStatusResponse, VoiceSampleResponse, OmniVoiceParams } from "../api/client";

export const PlaygroundPanel: React.FC = () => {
  // TTS State
  const [mode, setMode] = useState<"clone_voice" | "auto_voice" | "voice_design">("clone_voice");
  const [text, setText] = useState(
    "Hệ thống đang kiểm tra tính năng đồng bộ hóa âm thanh và văn bản. Chúc bạn một ngày tốt lành!"
  );
  const [customVoiceSampleId, setCustomVoiceSampleId] = useState("");
  const [refText, setRefText] = useState("");
  const [instruct, setInstruct] = useState("female, young adult, natural");
  const [speed, setSpeed] = useState(1.0);
  const [numStep, setNumStep] = useState(32);
  
  // Advanced OmniVoice parameters state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [guidanceScale, setGuidanceScale] = useState(2.0);
  const [tShift, setTShift] = useState(0.1);
  const [positionTemperature, setPositionTemperature] = useState(5.0);
  const classTemperature = 0.0;
  const layerPenaltyFactor = 5.0;
  const duration = "";
  const [preprocessPrompt, setPreprocessPrompt] = useState(true);
  const postprocessOutput = true;

  // Job Polling States
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [voiceSamples, setVoiceSamples] = useState<VoiceSampleResponse[]>([]);

  // Karaoke Player States
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [durationAudio, setDurationAudio] = useState(0);
  const volume = 0.8;
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [copied, setCopied] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const pollIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const playWordRangeRef = useRef<{ start: number, end: number } | null>(null);
  const isSeekingWordRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Fetch voice samples on mount
  const fetchVoiceSamples = async () => {
    try {
      const samples = await api.listVoiceSamples();
      setVoiceSamples(samples);
      if (samples.length > 0 && !customVoiceSampleId) {
        // Default to first private sample if available, or first public
        const defaultSample = samples.find(s => !s.is_public) || samples[0];
        setCustomVoiceSampleId(defaultSample.id);
        if (defaultSample.ref_text) {
          setRefText(defaultSample.ref_text);
        }
      }
    } catch (err) {
      console.error("Lỗi lấy danh sách mẫu giọng:", err);
    }
  };

  useEffect(() => {
    fetchVoiceSamples();
  }, []);

  // Sync reference text when voice sample selection changes
  const handleVoiceChange = (sampleId: string) => {
    setCustomVoiceSampleId(sampleId);
    const selected = voiceSamples.find(s => s.id === sampleId);
    if (selected && selected.ref_text) {
      setRefText(selected.ref_text);
    } else {
      setRefText("");
    }
  };

  // Handle TTS Submission
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setJobId(null);
    setJobStatus(null);
    setErrorMsg(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDurationAudio(0);

    const voiceSampleId = mode === "clone_voice" ? customVoiceSampleId : undefined;
    const instructParam = mode === "voice_design" ? instruct : undefined;
    const refTextParam = mode === "clone_voice" && refText ? refText : undefined;

    if (mode === "clone_voice" && !voiceSampleId) {
      setErrorMsg("Vui lòng tải lên mẫu giọng hoặc chọn một mẫu giọng để clone.");
      setLoading(false);
      return;
    }

    const params: OmniVoiceParams = {
      denoise,
      guidance_scale: guidanceScale,
      t_shift: tShift,
      position_temperature: positionTemperature,
      class_temperature: classTemperature,
      layer_penalty_factor: layerPenaltyFactor,
      duration: duration ? parseFloat(duration) : undefined,
      preprocess_prompt: preprocessPrompt,
      postprocess_output: postprocessOutput,
      with_alignment: true // Enforced for alignment testing playground
    };

    try {
      const res = await api.createTTSJob(
        mode, 
        text, 
        voiceSampleId, 
        instructParam, 
        speed, 
        numStep, 
        params, 
        refTextParam
      );
      setJobId(res.job_id);
      localStorage.setItem("VITE_PLAYGROUND_JOB_ID", res.job_id);
      setJobStatus({
        job_id: res.job_id,
        status: res.status,
        message: res.message,
        progress: 0,
        audio_url: null,
        error_message: null
      });
      setIsPolling(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể khởi tạo tiến trình TTS.");
      setLoading(false);
    }
  };

  const handleClearJob = () => {
    setJobId(null);
    setJobStatus(null);
    localStorage.removeItem("VITE_PLAYGROUND_JOB_ID");
  };

  useEffect(() => {
    const savedJobId = localStorage.getItem("VITE_PLAYGROUND_JOB_ID");
    if (savedJobId) {
      setJobId(savedJobId);
      setLoading(true);
      api.getJobStatus(savedJobId)
        .then((status) => {
          setJobStatus(status);
          setLoading(false);
          if (status.status !== "completed" && status.status !== "failed") {
            setIsPolling(true);
          }
        })
        .catch((err) => {
          console.error("Lỗi khôi phục Playground job status:", err);
          setLoading(false);
        });
    }
  }, []);

  // Job Polling Loop
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

      // Timeout after 15 minutes
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

  const startPreciseTracking = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const checkTime = () => {
      if (!audio) return;
      const time = audio.currentTime;
      setCurrentTime(time);

      const range = playWordRangeRef.current;
      if (range && !isSeekingWordRef.current) {
        const stopTime = range.end - Math.min(0.08, (range.end - range.start) * 0.4);
        if (time >= stopTime) {
          audio.pause();
          playWordRangeRef.current = null;
        }
      }

      if (!audio.paused) {
        animationFrameRef.current = requestAnimationFrame(checkTime);
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(checkTime);
  };

  const stopPreciseTracking = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  // Audio Event Bindings
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      setIsPlaying(true);
      startPreciseTracking();
    };
    const handlePause = () => {
      setIsPlaying(false);
      stopPreciseTracking();
    };
    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      const range = playWordRangeRef.current;
      if (range && !isSeekingWordRef.current) {
        const stopTime = range.end - Math.min(0.08, (range.end - range.start) * 0.4);
        if (time >= stopTime) {
          audio.pause();
          playWordRangeRef.current = null;
        }
      }
    };
    const handleSeeked = () => {
      isSeekingWordRef.current = false;
    };
    const handleLoadedMetadata = () => setDurationAudio(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      stopPreciseTracking();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      stopPreciseTracking();
    };
  }, [jobStatus?.audio_url]);

  // Volume & Speed Sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Player handlers
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      playWordRangeRef.current = null; // Clear play range when playing normally
      audio.play().catch(err => console.error("Audio playback error:", err));
    }
  };

  const handleWordClick = (wordStart: number, wordEnd: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // Set play word range
    playWordRangeRef.current = { start: wordStart, end: wordEnd };
    isSeekingWordRef.current = true;
    
    audio.currentTime = wordStart;
    setCurrentTime(wordStart);
    audio.play().catch(err => console.error("Audio playback error on seek:", err));
  };

  const handleRewind = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playWordRangeRef.current = null;
    audio.currentTime = Math.max(0, audio.currentTime - 5);
    setCurrentTime(audio.currentTime);
  };

  const handleForward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playWordRangeRef.current = null;
    audio.currentTime = Math.min(durationAudio, audio.currentTime + 5);
    setCurrentTime(audio.currentTime);
  };

  const handleDownload = () => {
    if (!jobStatus?.audio_url) return;
    const token = localStorage.getItem("VITE_JWT_TOKEN");
    const downloadUrl = `${api.getApiBaseUrl()}${jobStatus.audio_url}${jobStatus.audio_url.includes("?") ? "&" : "?"}token=${token || ""}`;
    
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `playground_tts_${jobId}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyJsonToClipboard = () => {
    if (!jobStatus?.alignment) return;
    navigator.clipboard.writeText(JSON.stringify(jobStatus.alignment, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00.00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
    const mss = ms < 10 ? `0${ms}` : `${ms}`;
    return `${mm}:${ss}.${mss}`;
  };

  // Parse alignment array
  const alignmentList = Array.isArray(jobStatus?.alignment) ? jobStatus.alignment : [];
  
  // Audio playback authenticated URL
  const token = localStorage.getItem("VITE_JWT_TOKEN");
  const authenticatedUrl = jobStatus?.audio_url 
    ? `${api.getApiBaseUrl()}${jobStatus.audio_url}${jobStatus.audio_url.includes("?") ? "&" : "?"}token=${token || ""}`
    : "";

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header section */}
      <div className="flex flex-col gap-1 select-none max-w-fluid-editor mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-violet-600 via-indigo-600 to-accent p-1.5 rounded-lg text-white">
            <Sparkles className="w-5.5 h-5.5" />
          </div>
          <div>
            <h1 className="text-fluid-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Playground - Test API
              <span className="text-[10px] font-extrabold uppercase bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded-full tracking-wider">
                Admin Panel
              </span>
            </h1>
            <p className="text-fluid-sm text-muted-foreground font-medium">
              Kiểm tra khả năng khớp từ (Word-Level Alignment) của API với trình phát Karaoke tương tác.
            </p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-fluid-editor mx-auto grid grid-cols-1 xl:grid-cols-12 gap-fluid items-start">
        
        {/* Left Column: Editor & Inputs (5/12) */}
        <div className="xl:col-span-5 bg-card border border-border rounded-2xl p-fluid-card flex flex-col gap-fluid shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border select-none justify-between">
            <span className="text-fluid-sm font-bold text-foreground flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-muted-foreground" />
              Thông số thử nghiệm
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-success border border-success/20 px-2 py-0.5 rounded-full font-bold">
              with_alignment: ON
            </span>
          </div>

          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            {/* Mode selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-fluid-xs font-bold text-muted-foreground uppercase tracking-wider">Voice Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="bg-secondary/40 border border-border/70 rounded-xl px-3 h-10 text-fluid-sm font-semibold text-foreground focus:outline-none w-full cursor-pointer shadow-sm"
              >
                <option value="clone_voice">Sử dụng giọng mẫu (Clone)</option>
                <option value="auto_voice">Auto Voice (Random)</option>
                <option value="voice_design">Voice Design Direct (Instruct)</option>
              </select>
            </div>

            {/* Reference Sample selector */}
            {mode === "clone_voice" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-fluid-xs font-bold text-muted-foreground uppercase tracking-wider">Mẫu giọng (Voice Sample)</label>
                <select
                  value={customVoiceSampleId}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="bg-secondary/40 border border-border/70 rounded-xl px-3 h-10 text-fluid-sm font-semibold text-foreground focus:outline-none w-full cursor-pointer shadow-sm"
                >
                  <option value="">-- Chọn mẫu giọng --</option>
                  <optgroup label="Private Voices">
                    {voiceSamples.filter(s => !s.is_public).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name ? `${s.name} (${s.id.substring(0, 8)})` : s.id} {s.duration ? `[${s.duration.toFixed(1)}s]` : ""}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Public Voices">
                    {voiceSamples.filter(s => s.is_public).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name ? `${s.name} (${s.id.substring(0, 8)})` : s.id} {s.duration ? `[${s.duration.toFixed(1)}s]` : ""}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            {/* Reference text parameter */}
            {mode === "clone_voice" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-fluid-xs font-bold text-muted-foreground uppercase tracking-wider">Văn bản tham khảo (ref_text)</label>
                <input
                  type="text"
                  value={refText}
                  onChange={(e) => setRefText(e.target.value)}
                  placeholder="Whisper tự động nhận diện nếu bỏ trống..."
                  className="bg-secondary/40 border border-border/70 rounded-xl px-3 h-10 text-fluid-sm text-foreground focus:outline-none w-full font-medium"
                />
              </div>
            )}

            {/* Instruct parameter */}
            {mode === "voice_design" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-fluid-xs font-bold text-muted-foreground uppercase tracking-wider">Mô tả giọng (Instruct Tags - EN)</label>
                <input
                  type="text"
                  value={instruct}
                  onChange={(e) => setInstruct(e.target.value)}
                  placeholder="female, young adult, natural, expressiveness..."
                  className="bg-secondary/40 border border-border/70 rounded-xl px-3 h-10 text-fluid-sm text-foreground focus:outline-none w-full font-mono"
                />
              </div>
            )}

            {/* Text input area */}
            <div className="flex flex-col gap-1.5">
              <label className="text-fluid-xs font-bold text-muted-foreground uppercase tracking-wider">Văn bản cần kiểm tra</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Nhập đoạn văn bản cần test đồng bộ voice và chữ..."
                className="w-full bg-secondary/30 border border-border/70 rounded-xl p-3 text-fluid-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none font-medium leading-relaxed min-h-[140px]"
                maxLength={2000}
                required
              />
            </div>

            {/* Speed & Steps Basic parameters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Tốc độ: {speed.toFixed(1)}x</span>
                <input
                  type="range" min="0.5" max="2.0" step="0.1" value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="seekbar w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Số Steps: {numStep}</span>
                <input
                  type="range" min="10" max="64" step="1" value={numStep}
                  onChange={(e) => setNumStep(parseInt(e.target.value))}
                  className="seekbar w-full"
                />
              </div>
            </div>

            {/* Advanced accordian */}
            <div className="border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-fluid-xs text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider transition-colors cursor-pointer select-none"
              >
                <span>Tham số nâng cao (Advanced)</span>
                <span>{showAdvanced ? "▲" : "▼"}</span>
              </button>

              {showAdvanced && (
                <div className="flex flex-col gap-4 mt-3 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox" checked={denoise}
                        onChange={(e) => setDenoise(e.target.checked)}
                        className="rounded border-border w-3.5 h-3.5 bg-card text-foreground"
                      />
                      <span>Denoise</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox" checked={preprocessPrompt}
                        onChange={(e) => setPreprocessPrompt(e.target.checked)}
                        className="rounded border-border w-3.5 h-3.5 bg-card text-foreground"
                      />
                      <span>Preprocess Ref</span>
                    </label>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase">
                      <span>Guidance Scale: {guidanceScale.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min="0.5" max="5.0" step="0.1" value={guidanceScale}
                      onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                      className="seekbar w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase">
                      <span>t_shift: {tShift.toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min="0.01" max="0.50" step="0.01" value={tShift}
                      onChange={(e) => setTShift(parseFloat(e.target.value))}
                      className="seekbar w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase">
                      <span>Position Temp: {positionTemperature.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min="0.0" max="10.0" step="0.5" value={positionTemperature}
                      onChange={(e) => setPositionTemperature(parseFloat(e.target.value))}
                      className="seekbar w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-fluid-sm font-semibold flex gap-1.5 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !text}
              className={`w-full h-11 rounded-xl font-bold text-fluid-sm transition-all duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                !loading && text
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:brightness-105 border-none shadow-lg shadow-indigo-600/10"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                  <span>Đang tổng hợp & lập lịch API...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4 text-white" />
                  <span>Gửi test & Căn thời gian (TTS API)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Karaoke Player & Alignment Visualizer (7/12) */}
        <div className="xl:col-span-7 flex flex-col gap-5">
          {jobId && jobStatus && (jobStatus.status === "completed" || jobStatus.status === "failed") && (
            <div className="flex justify-end select-none -mb-3">
              <button
                type="button"
                onClick={handleClearJob}
                className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer font-bold"
              >
                Xóa kết quả hiển thị
              </button>
            </div>
          )}
          {/* Job status loading card */}
          {jobId && jobStatus && jobStatus.status !== "completed" && jobStatus.status !== "failed" && (
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm animate-pulse">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase">Trạng thái API Job</span>
                <span className="px-2 py-0.5 bg-secondary text-foreground rounded text-[10px] font-bold uppercase tracking-wider font-mono">
                  {jobStatus.status}
                </span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-300 rounded-full" 
                  style={{ width: `${jobStatus.progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{jobStatus.message || "Đang xử lý dữ liệu..."}</span>
                <span className="font-bold font-mono">{jobStatus.progress}%</span>
              </div>
            </div>
          )}

          {/* Job failure notice */}
          {jobStatus?.status === "failed" && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6 flex flex-col gap-3 shadow-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-sm">Gửi test API Thất Bại</h3>
              </div>
              <p className="text-xs font-medium leading-relaxed">
                Chi tiết lỗi: {jobStatus.error_message || jobStatus.message || "Không xác định"}
              </p>
            </div>
          )}

          {/* Ready state instructions */}
          {!jobId && (
            <div className="bg-card border border-border border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground h-[320px] select-none">
              <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                <AlignLeft className="w-5 h-5 text-muted-foreground/60" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="font-bold text-sm text-foreground">Chưa có dữ liệu API</h3>
                <p className="text-xs font-medium leading-normal text-muted-foreground/80">
                  Nhập văn bản và chọn giọng mẫu ở bảng điều khiển bên trái, sau đó click nút "Gửi test" để kích hoạt kiểm tra thời gian căn chỉnh.
                </p>
              </div>
            </div>
          )}

          {/* Main Karaoke Stage */}
          {jobStatus?.status === "completed" && (
            <div className="bg-card border border-border rounded-2xl flex flex-col shadow-sm overflow-hidden animate-fadeIn">
              <audio ref={audioRef} src={authenticatedUrl} />

              {/* Display Alignment Analytics Metrics */}
              <div className="bg-secondary/25 border-b border-border p-4 grid grid-cols-3 gap-4 text-center select-none">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Số lượng từ</span>
                  <span className="text-fluid-md font-bold text-foreground font-mono mt-0.5">{alignmentList.length}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Thời lượng Audio</span>
                  <span className="text-fluid-md font-bold text-foreground font-mono mt-0.5">
                    {durationAudio ? `${durationAudio.toFixed(2)}s` : "--"}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Từ / Giây</span>
                  <span className="text-fluid-md font-bold text-foreground font-mono mt-0.5">
                    {durationAudio && alignmentList.length 
                      ? (alignmentList.length / durationAudio).toFixed(1) 
                      : "--"}
                  </span>
                </div>
              </div>

              {/* Karaoke Display Area */}
              <div className="p-6 md:p-8 min-h-[180px] max-h-[360px] overflow-y-auto bg-background/25 leading-loose text-justify relative select-none">
                {alignmentList.length > 0 ? (
                  <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 items-center">
                    {alignmentList.map((item: any, index: number) => {
                      const isActive = currentTime >= item.start && currentTime <= item.end;
                      const isPast = currentTime > item.end;
                      
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleWordClick(item.start, item.end)}
                          className={`inline-block py-0.5 px-1.5 rounded-md text-fluid-base transition-all duration-100 cursor-pointer border select-none ${
                            isActive
                              ? "bg-primary/20 border-primary/40 text-primary font-black scale-110 shadow-sm animate-pulse"
                              : isPast
                              ? "bg-secondary/20 border-transparent text-muted-foreground/50 font-medium scale-95"
                              : "bg-transparent border-transparent text-foreground hover:bg-secondary/40 hover:border-border font-medium"
                          }`}
                          title={`Nhấp để phát âm riêng từ này (Từ ${item.start}s - ${item.end}s)`}
                        >
                          {item.word}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10 gap-2">
                    <Info className="w-5 h-5" />
                    <span className="text-xs font-semibold">
                      API hoàn tất nhưng không trả về thông tin Alignment.<br/>
                      Kiểm tra log của worker hoặc restart notebook.
                    </span>
                  </div>
                )}
              </div>

              {/* Karaoke Media Controller Panel */}
              <div className="bg-secondary/40 border-t border-border p-4 flex flex-col gap-3.5 select-none">
                {/* Custom Seek bar */}
                <div className="w-full flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted-foreground font-semibold tabular-nums shrink-0">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-grow flex items-center">
                    <input
                      type="range"
                      min={0}
                      max={durationAudio || 100}
                      step="0.05"
                      value={currentTime}
                      onChange={(e) => {
                        const newTime = parseFloat(e.target.value);
                        if (audioRef.current) {
                          playWordRangeRef.current = null;
                          audioRef.current.currentTime = newTime;
                          setCurrentTime(newTime);
                        }
                      }}
                      className="seekbar w-full cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--primary) 0%, var(--accent) ${durationAudio ? (currentTime / durationAudio) * 100 : 0}%, var(--slider-track) ${durationAudio ? (currentTime / durationAudio) * 100 : 0}%, var(--slider-track) 100%)`
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground font-semibold tabular-nums shrink-0">
                    {formatTime(durationAudio)}
                  </span>
                </div>

                {/* Control buttons & widgets */}
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Playback controls */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button" onClick={handleRewind}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Lùi lại 5 giây"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    
                    <button
                      type="button" onClick={togglePlay}
                      className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-accent hover:brightness-105 text-white flex items-center justify-center cursor-pointer shadow hover:scale-105 duration-150 active:scale-95 shrink-0"
                    >
                      {isPlaying ? (
                        <Pause className="w-4.5 h-4.5 fill-current" />
                      ) : (
                        <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button" onClick={handleForward}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Tiến lên 5 giây"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Center: Playback speed Selector */}
                  <div className="relative">
                    <button
                      type="button" onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                      className="px-2.5 py-1 bg-background/50 hover:bg-secondary border border-border/80 rounded-lg text-fluid-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {playbackRate.toFixed(2)}x
                    </button>
                    {showSpeedMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowSpeedMenu(false)} />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 bg-card border border-border rounded-xl p-1 shadow-xl flex flex-col gap-0.5 min-w-[70px]">
                          {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
                            <button
                              key={r} type="button"
                              onClick={() => {
                                setPlaybackRate(r);
                                setShowSpeedMenu(false);
                              }}
                              className={`px-2 py-1 text-center rounded-lg text-fluid-xs font-bold transition-all cursor-pointer ${
                                playbackRate === r ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
                              }`}
                            >
                              {r.toFixed(2)}x
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: Mute & Download */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button" onClick={() => setIsMuted(!isMuted)}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    
                    <button
                      type="button" onClick={handleDownload}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Tải tệp WAV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Raw JSON alignment inspector */}
          {jobStatus?.status === "completed" && alignmentList.length > 0 && (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden animate-fadeIn">
              <details className="group">
                <summary className="p-4 flex items-center justify-between font-bold text-xs text-foreground cursor-pointer select-none group-open:border-b group-open:border-border">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    Xem dữ liệu thô JSON Alignment
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                
                <div className="p-4 flex flex-col gap-3 bg-secondary/10">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      API Endpoint: <code className="bg-secondary px-1 py-0.5 rounded font-mono">/v1/jobs/{"{job_id}"}</code>
                    </span>
                    
                    <button
                      type="button"
                      onClick={copyJsonToClipboard}
                      className="px-2.5 py-1.5 bg-card hover:bg-secondary border border-border text-fluid-xs font-semibold text-foreground rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-success" />
                          <span className="text-success">Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="bg-secondary/40 border border-border/80 rounded-xl p-4 text-[11px] font-mono overflow-auto max-h-[160px] text-muted-foreground leading-relaxed">
                    {JSON.stringify(jobStatus.alignment, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
