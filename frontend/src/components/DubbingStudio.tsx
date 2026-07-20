import React, { useState, useEffect, useRef } from "react";
import { api, type VideoDubbingJobResponse, type SubtitleSegment } from "../api/client";

export default function DubbingStudio() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [smartSeparation, setSmartSeparation] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<VideoDubbingJobResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subtitle editor state
  const [originalSubs, setOriginalSubs] = useState<SubtitleSegment[]>([]);
  const [translatedSubs, setTranslatedSubs] = useState<SubtitleSegment[]>([]);
  const [selectedSegId, setSelectedSegId] = useState<number | null>(null);
  const [savingSubs, setSavingSubs] = useState(false);

  // Refs for media players
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const vocalsPlayerRef = useRef<HTMLAudioElement>(null);
  const bgmPlayerRef = useRef<HTMLAudioElement>(null);

  // Audio mix options
  const [vocalsVolume, setVocalsVolume] = useState(1.0);
  const [bgmVolume, setBgmVolume] = useState(0.4);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const data = await api.getDubbingJob(jobId);
        setJob(data);

        if (data.original_subtitles) {
          setOriginalSubs(data.original_subtitles);
        }
        if (data.translated_subtitles) {
          setTranslatedSubs(data.translated_subtitles);
        }

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch (err: any) {
        console.error("Lỗi đồng bộ thông tin Job:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  const handleStartDubbing = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setJobId(null);
    setJob(null);

    try {
      if (!selectedFile && !youtubeUrl) {
        throw new Error("Vui lòng tải lên file video hoặc dán link YouTube.");
      }

      const response = await api.createDubbingJob(
        selectedFile || undefined,
        youtubeUrl || undefined,
        targetLanguage
      );
      setJobId(response.id);
      setJob(response);
    } catch (err: any) {
      setError(err.message || "Không thể khởi động tác vụ lồng tiếng.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSubtitles = async () => {
    if (!jobId) return;
    setSavingSubs(true);
    setError(null);
    try {
      await api.updateDubbingSubtitles(jobId, originalSubs, translatedSubs);
      alert("Đã lưu thay đổi phụ đề thành công!");
    } catch (err: any) {
      setError(err.message || "Lỗi lưu phụ đề.");
    } finally {
      setSavingSubs(false);
    }
  };

  const handleFinalize = async () => {
    if (!jobId) return;
    setError(null);
    setLoading(true);
    try {
      // Auto-save changes first
      await api.updateDubbingSubtitles(jobId, originalSubs, translatedSubs);
      await api.finalizeDubbingJob(jobId);
      
      // Update local state to trigger polling resume
      const data = await api.getDubbingJob(jobId);
      setJob(data);
    } catch (err: any) {
      setError(err.message || "Lỗi hoàn tất lồng tiếng.");
    } finally {
      setLoading(false);
    }
  };

  // Jump video player to specific subtitle segment
  const jumpToSegment = (start: number, id: number) => {
    setSelectedSegId(id);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = start;
      videoPlayerRef.current.play();
    }
  };

  const updateSubText = (id: number, text: string) => {
    setTranslatedSubs(prev =>
      prev.map(item => (item.id === id ? { ...item, text } : item))
    );
  };

  const resetState = () => {
    setJobId(null);
    setJob(null);
    setYoutubeUrl("");
    setSelectedFile(null);
    setOriginalSubs([]);
    setTranslatedSubs([]);
    setSelectedSegId(null);
    setError(null);
  };

  // Sync separate vocals/BGM tracks to the main video player (for reviewing separated tracks)
  const handleVideoPlay = () => {
    vocalsPlayerRef.current?.play();
    bgmPlayerRef.current?.play();
  };

  const handleVideoPause = () => {
    vocalsPlayerRef.current?.pause();
    bgmPlayerRef.current?.pause();
  };

  const handleVideoSeek = () => {
    if (videoPlayerRef.current) {
      const t = videoPlayerRef.current.currentTime;
      if (vocalsPlayerRef.current) vocalsPlayerRef.current.currentTime = t;
      if (bgmPlayerRef.current) bgmPlayerRef.current.currentTime = t;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Studio Lồng Tiếng Video AI
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Dịch thuật phụ đề bằng LLM, tách nhạc thông minh, và lồng tiếng tự động sử dụng OmniVoice Clone.
            </p>
          </div>
          {jobId && (
            <button
              onClick={resetState}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 transition"
            >
              Tạo dự án mới
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/50 border border-red-500/50 text-red-200 rounded-xl text-sm">
            <strong>Lỗi:</strong> {error}
          </div>
        )}

        {/* --- STEP 1: UPLOAD SCREEN --- */}
        {!jobId && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 bg-slate-900/60 backdrop-blur-sm p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold text-slate-200 mb-6">Tải Lên Video Đầu Vào</h2>
              <form onSubmit={handleStartDubbing} className="space-y-6">
                
                {/* Drag and drop card */}
                <div className="border-2 border-dashed border-slate-700 hover:border-violet-500/50 transition rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-950/40 relative">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-violet-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-300">
                    {selectedFile ? selectedFile.name : "Tải lên tệp video từ máy tính của bạn"}
                  </span>
                  <span className="text-xs text-slate-500 mt-1">Hỗ trợ các định dạng MP4, MKV, MOV</span>
                </div>

                <div className="flex items-center my-4">
                  <div className="flex-grow border-t border-slate-800"></div>
                  <span className="mx-4 text-xs text-slate-500 font-bold tracking-wider uppercase">HOẶC DÁN ĐƯỜNG DẪN</span>
                  <div className="flex-grow border-t border-slate-800"></div>
                </div>

                {/* YouTube Link input */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">Đường dẫn YouTube</label>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Toggle Smart separation */}
                <div className="flex items-center gap-3 bg-slate-950/20 p-4 rounded-xl border border-slate-800/40">
                  <input
                    type="checkbox"
                    id="smart-sep"
                    checked={smartSeparation}
                    onChange={(e) => setSmartSeparation(e.target.checked)}
                    className="w-4 h-4 text-violet-600 bg-slate-950 border-slate-800 rounded focus:ring-violet-500"
                  />
                  <label htmlFor="smart-sep" className="text-sm text-slate-300 cursor-pointer">
                    <span className="font-semibold block text-slate-200">Tách giọng nói & nhạc nền (Demucs GPU)</span>
                    <span className="text-xs text-slate-400">Cô lập hoàn toàn giọng nói gốc để tham chiếu clone, giữ lại nhạc hiệu ứng.</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:opacity-95 font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10 disabled:opacity-50"
                >
                  {loading ? "Đang tải dữ liệu..." : "Bắt Đầu Nhận Dạng & Dịch Thuật"}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </button>

              </form>
            </div>

            {/* Language & Config sidecard */}
            <div className="bg-slate-900/60 backdrop-blur-sm p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <h2 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-3">Cấu Hình Dịch Thuật</h2>
              
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">Ngôn ngữ đích</label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 text-slate-100"
                >
                  <option value="English">English (Tiếng Anh)</option>
                  <option value="Vietnamese">Tiếng Việt (Vietnamese)</option>
                  <option value="Japanese">日本語 (Japanese)</option>
                  <option value="Korean">한국어 (Korean)</option>
                  <option value="Chinese">中文 (Chinese)</option>
                  <option value="French">Français (French)</option>
                  <option value="Spanish">Español (Spanish)</option>
                </select>
              </div>

              <div className="space-y-3 text-xs text-slate-400 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                <span className="font-semibold text-slate-300 block mb-1">Quy trình tự động gồm:</span>
                <p>1. Tách nhạc nền & giọng thoại (Demucs)</p>
                <p>2. Chuyển đổi giọng thoại thành văn bản tiếng gốc (Whisper)</p>
                <p>3. Dịch văn bản qua LLM (OpenAI/Gemini)</p>
                <p>4. Chờ duyệt bản dịch phụ đề từ bạn</p>
                <p>5. Sinh giọng đọc clone đè đồng bộ thời gian (OmniVoice)</p>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 2: PROCESSING SCREEN --- */}
        {jobId && job && job.status !== "awaiting_review" && job.status !== "completed" && job.status !== "failed" && (
          <div className="bg-slate-900/60 backdrop-blur-sm p-8 rounded-2xl border border-slate-800 max-w-2xl mx-auto shadow-xl">
            <h2 className="text-xl font-bold text-slate-200 text-center mb-6">Đang Xử Lý Quy Trình</h2>
            
            <div className="space-y-6">
              {/* Progress percentage bar */}
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full bg-violet-900/40 text-violet-300">
                      {job.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold inline-block text-violet-400">
                      {job.progress}%
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-2 text-xs flex rounded bg-slate-800">
                  <div
                    style={{ width: `${job.progress}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                  ></div>
                </div>
              </div>

              <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-center text-sm text-slate-300 font-medium">
                <span className="inline-block animate-pulse w-2 h-2 rounded-full bg-violet-400 mr-2"></span>
                {job.message || "Vui lòng chờ..."}
              </div>

              {/* Step indicator bubbles */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500 font-semibold pt-4">
                <div className={job.progress >= 10 ? "text-violet-400" : ""}>Tải Video</div>
                <div className={job.progress >= 25 ? "text-violet-400" : ""}>Tách Nhạc</div>
                <div className={job.progress >= 50 ? "text-violet-400" : ""}>Whisper ASR</div>
                <div className={job.progress >= 75 ? "text-violet-400" : ""}>LLM Dịch</div>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 3: SUBTITLE REVIEW & EDIT STUDIO --- */}
        {jobId && job && job.status === "awaiting_review" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left: Video Player & Audio Controls */}
            <div className="space-y-6">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-4">Video Xem Trước</h3>
                <div className="relative aspect-video rounded-xl bg-black overflow-hidden border border-slate-800">
                  <video
                    ref={videoPlayerRef}
                    src={api.getDubbingFileUrl(jobId, "video")}
                    controls
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onSeeked={handleVideoSeek}
                    className="w-full h-full object-contain"
                  />
                  
                  {/* Invisible background audio tracks sync'd with video seek */}
                  {job.vocals_audio_path && (
                    <audio ref={vocalsPlayerRef} src={api.getDubbingFileUrl(jobId, "vocals")} />
                  )}
                  {job.bgm_audio_path && (
                    <audio ref={bgmPlayerRef} src={api.getDubbingFileUrl(jobId, "bgm")} />
                  )}
                </div>

                {/* Separated Audio Mix Panel */}
                <div className="mt-6 space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Bộ trộn tách kênh âm thanh</h4>
                  
                  <div className="space-y-3">
                    {/* Vocals Volume */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-slate-300">Giọng Thoại Thoát Kênh</span>
                      <div className="flex items-center gap-3 w-2/3">
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={vocalsVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setVocalsVolume(val);
                            if (vocalsPlayerRef.current) vocalsPlayerRef.current.volume = val / 2;
                          }}
                          className="w-full accent-violet-500 bg-slate-800 h-1 rounded-lg"
                        />
                        <span className="text-[10px] text-slate-500 font-bold w-8 text-right">{Math.round(vocalsVolume * 100)}%</span>
                      </div>
                    </div>

                    {/* BGM Volume */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-slate-300">Nhạc Nền / Hiệu Ứng</span>
                      <div className="flex items-center gap-3 w-2/3">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={bgmVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setBgmVolume(val);
                            if (bgmPlayerRef.current) bgmPlayerRef.current.volume = val;
                          }}
                          className="w-full accent-violet-500 bg-slate-800 h-1 rounded-lg"
                        />
                        <span className="text-[10px] text-slate-500 font-bold w-8 text-right">{Math.round(bgmVolume * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={handleFinalize}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-sm font-semibold rounded-xl hover:opacity-95 transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                  >
                    {loading ? "Đang tiến hành..." : "Xác Nhận & Tiến Hành Lồng Tiếng"}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  </button>
                </div>

              </div>
            </div>

            {/* Right: Subtitle Editing Timeline */}
            <div className="flex flex-col h-[580px] bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">Phân Đoạn & Bản Dịch Phụ Đề</h3>
                <button
                  onClick={handleSaveSubtitles}
                  disabled={savingSubs}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-violet-300 rounded border border-slate-700 transition"
                >
                  {savingSubs ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>

              {/* Timeline segment list */}
              <div className="flex-grow overflow-y-auto p-6 space-y-4">
                {translatedSubs.map((seg, idx) => {
                  const origSeg = originalSubs[idx] || seg;
                  const isSelected = selectedSegId === seg.id;
                  return (
                    <div
                      key={seg.id}
                      onClick={() => jumpToSegment(seg.start, seg.id)}
                      className={`p-4 rounded-xl border transition cursor-pointer text-left ${
                        isSelected
                          ? "bg-slate-800/80 border-violet-500/50 shadow-md shadow-violet-500/5"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-violet-400 tracking-wider">PHÂN ĐOẠN #{seg.id}</span>
                        <span className="text-[10px] text-slate-500 font-bold bg-slate-900 px-2 py-0.5 rounded">
                          {seg.start.toFixed(2)}s → {seg.end.toFixed(2)}s ({(seg.end - seg.start).toFixed(1)}s)
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Original Text */}
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Tiếng gốc:</span>
                          <p className="text-xs text-slate-400 mt-0.5 italic">{origSeg.text}</p>
                        </div>
                        
                        {/* Translated input */}
                        <div>
                          <span className="text-[9px] uppercase font-bold text-violet-400 tracking-wider">Lồng tiếng ({targetLanguage}):</span>
                          <textarea
                            value={seg.text}
                            onChange={(e) => updateSubText(seg.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()} // Stop jump click
                            rows={2}
                            className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200 mt-1 focus:outline-none focus:border-violet-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>
        )}

        {/* --- STEP 4: FINALIZE IN PROGRESS SCREEN --- */}
        {jobId && job && (job.status === "generating_tts" || job.status === "mixing_audio" || job.status === "muxing_video") && (
          <div className="bg-slate-900/60 backdrop-blur-sm p-8 rounded-2xl border border-slate-800 max-w-2xl mx-auto shadow-xl text-center">
            <h2 className="text-xl font-bold text-slate-200 mb-6">Đang Tổng Hợp Video Thành Phẩm</h2>
            
            <div className="flex justify-center mb-8">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-violet-500/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 border-r-violet-500 animate-spin"></div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-violet-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-slate-300 font-semibold">{job.message || "Vui lòng chờ..."}</div>
              <div className="text-xs text-slate-500">Mô hình đang tổng hợp các file âm thanh lồng tiếng đè và ghép nhạc nền theo mốc thời gian...</div>
              
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${job.progress}%` }}
                  className="bg-violet-500 h-full transition-all duration-300"
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 5: FINAL OUTPUT PREVIEW & DOWNLOAD --- */}
        {jobId && job && job.status === "completed" && (
          <div className="max-w-4xl mx-auto bg-slate-900/60 backdrop-blur-sm p-8 rounded-2xl border border-slate-800 shadow-xl space-y-8">
            <div className="text-center">
              <div className="inline-flex w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 items-center justify-center text-green-400 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-200">Hoàn Tất Lồng Tiếng Video!</h2>
              <p className="text-sm text-slate-400 mt-2">Video của bạn đã được dịch thuật và lồng ghép giọng clone đồng bộ thời lượng thành công.</p>
            </div>

            {/* Video player */}
            <div className="aspect-video w-full max-w-2xl mx-auto rounded-xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
              <video
                src={api.getDubbingFileUrl(jobId, "output")}
                controls
                className="w-full h-full object-contain"
              />
            </div>

            {/* Download actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href={api.getDubbingFileUrl(jobId, "output")}
                download={`dubbed_video_${jobId}.mp4`}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-sm font-semibold rounded-xl hover:opacity-95 transition flex items-center justify-center gap-2 shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Tải Video Lồng Tiếng (MP4)
              </a>
              
              <button
                onClick={() => {
                  // Export SRT file directly in browser
                  const srtText = originalSubs.map((seg, idx) => {
                    const trans = translatedSubs[idx] || seg;
                    const format = (s: number) => {
                      const h = Math.floor(s / 3600);
                      const m = Math.floor((s % 3600) / 60);
                      const sec = Math.floor(s % 60);
                      const ms = Math.floor((s % 1) * 1000);
                      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
                    };
                    return `${idx + 1}\n${format(seg.start)} --> ${format(seg.end)}\n${trans.text}\n`;
                  }).join("\n");
                  
                  const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `subtitles_${jobId}.srt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Tải Phụ Đề SRT dịch
              </button>
            </div>
          </div>
        )}

        {/* --- STEP 6: FAILED SCREEN --- */}
        {jobId && job && job.status === "failed" && (
          <div className="bg-slate-900/60 backdrop-blur-sm p-8 rounded-2xl border border-slate-800 max-w-xl mx-auto shadow-xl text-center space-y-6">
            <div className="inline-flex w-12 h-12 rounded-full bg-red-500/20 border border-red-500/30 items-center justify-center text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-200">Xử Lý Thất Bại</h2>
            <p className="text-sm text-red-400">{job.error_message || "Đã xảy ra lỗi không xác định."}</p>
            
            <button
              onClick={resetState}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-sm font-semibold rounded-lg transition"
            >
              Thử lại
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
