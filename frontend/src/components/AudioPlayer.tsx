import React, { useState, useEffect, useRef } from "react";
import { Download, Play, Pause, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerProps {
  url: string;
  title?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ url, title }) => {
  const token = localStorage.getItem("VITE_JWT_TOKEN");
  const authenticatedUrl = url ? `${url}${url.includes("?") ? "&" : "?"}token=${token || ""}` : "";

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Sync state with HTML5 Audio Element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    // Initial check in case it is already loaded
    if (audio.duration) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [authenticatedUrl]);

  // Adjust volume/mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Adjust playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(err => console.error("Audio playback error:", err));
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (newVol > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    const link = document.createElement("a");
    link.href = authenticatedUrl;
    link.download = title ? `${title.replace(/\s+/g, "_")}.wav` : "audio.wav";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
    return `${mm}:${ss}`;
  };

  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];

  const percentage = duration ? (currentTime / duration) * 100 : 0;
  const volPercentage = isMuted ? 0 : volume * 100;

  return (
    <div className="bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between gap-3 shadow-sm relative w-full select-none transition-all duration-200 hover:border-slate-700/60">
      <audio ref={audioRef} src={authenticatedUrl} />
      
      {/* Controls Container */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full border border-slate-800 hover:border-slate-600 bg-slate-900/60 hover:bg-slate-850 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm"
          title={isPlaying ? "Tạm dừng" : "Phát"}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </button>

        {/* Combined Time Readout */}
        <span className="text-[10px] font-mono font-bold text-slate-400 select-none shrink-0 tabular-nums min-w-[70px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Progress Timeline Slider */}
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={handleSeekChange}
        className="seekbar flex-grow"
        style={{
          background: `linear-gradient(to right, var(--color-slate-100) 0%, var(--color-slate-100) ${percentage}%, var(--color-slate-800) ${percentage}%, var(--color-slate-800) 100%)`
        }}
      />

      {/* Right Side Options */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Optional small title */}
        {title && (
          <span 
            className="text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-[80px] hidden lg:inline-block" 
            title={title}
          >
            {title}
          </span>
        )}

        {/* Speed Multiplier Button */}
        <div className="relative shrink-0 flex items-center">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="px-1.5 py-0.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded text-[9px] font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer select-none"
          >
            {playbackRate.toFixed(1)}x
          </button>
          
          {showSpeedMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSpeedMenu(false)} />
              <div className="absolute bottom-full right-0 mb-1.5 z-25 bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-xl flex flex-col gap-0.5 min-w-[65px] animate-fadeIn">
                {speeds.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setPlaybackRate(s);
                      setShowSpeedMenu(false);
                    }}
                    className={`px-2 py-0.5 text-left rounded-lg text-[9px] font-bold transition-colors cursor-pointer w-full ${
                      playbackRate === s
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-850"
                    }`}
                  >
                    {s.toFixed(2)}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Volume controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleMute}
            className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-0.5"
            title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="seekbar w-10 hidden sm:inline-block h-1"
            style={{
              background: `linear-gradient(to right, var(--color-slate-350) 0%, var(--color-slate-350) ${volPercentage}%, var(--color-slate-800) ${volPercentage}%, var(--color-slate-800) 100%)`
            }}
          />
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-0.5 shrink-0"
          title="Tải xuống tệp WAV"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
