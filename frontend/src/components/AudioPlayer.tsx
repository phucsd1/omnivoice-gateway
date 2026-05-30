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
  const volume = 1;
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

  return (
    <div className="bg-card border border-border rounded-xl p-2 flex flex-col gap-1.5 shadow-sm relative w-full select-none transition-all duration-200 hover:border-border/60">
      <audio ref={audioRef} src={authenticatedUrl} />
      
      {/* Top Row: Play, Time, Title (Left) & Speed, Mute, Download (Right) */}
      <div className="flex items-center justify-between gap-2 w-full">
        {/* Left Part */}
        <div className="flex items-center gap-2 min-w-0 flex-grow">
          <button
            onClick={togglePlay}
            className="w-6.5 h-6.5 rounded-full border border-border bg-card/60 hover:bg-muted text-foreground flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm"
            title={isPlaying ? "Tạm dừng" : "Phát"}
          >
            {isPlaying ? (
              <Pause className="w-2.5 h-2.5 fill-current" />
            ) : (
              <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
            )}
          </button>
          
          <div className="flex flex-col min-w-0 leading-tight">
            {title && (
              <span className="text-[9px] font-extrabold text-foreground uppercase tracking-wider truncate max-w-[110px]" title={title}>
                {title}
              </span>
            )}
            <span className="text-[9px] font-mono font-bold text-muted-foreground tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right Part */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Waveform Bouncing Bars (hidden on small layouts) */}
          <div className="hidden sm:flex items-end gap-0.5 h-3.5 w-6 px-0.5 shrink-0 overflow-hidden bg-background/40 rounded border border-border/40 justify-center">
            <div className={`w-[1.5px] bg-primary rounded-full transition-all duration-300 ${isPlaying ? 'animate-wave-bar-1' : 'h-1'}`} />
            <div className={`w-[1.5px] bg-primary rounded-full transition-all duration-300 ${isPlaying ? 'animate-wave-bar-2' : 'h-2.5'}`} />
            <div className={`w-[1.5px] bg-purple-500 rounded-full transition-all duration-300 ${isPlaying ? 'animate-wave-bar-3' : 'h-1.5'}`} />
          </div>

          {/* Speed Selector */}
          <div className="relative flex items-center">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="px-1 py-0.5 bg-background hover:bg-muted border border-border rounded text-[9px] font-bold text-muted-foreground transition-colors cursor-pointer select-none"
            >
              {playbackRate.toFixed(1)}x
            </button>
            
            {showSpeedMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSpeedMenu(false)} />
                <div className="absolute bottom-full right-0 mb-1.5 z-25 bg-card border border-border rounded-xl p-1 shadow-xl flex flex-col gap-0.5 min-w-[55px] animate-fadeIn">
                  {speeds.map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        setPlaybackRate(s);
                        setShowSpeedMenu(false);
                      }}
                      className={`px-1.5 py-0.5 text-left rounded-lg text-[9px] font-bold transition-colors cursor-pointer w-full ${
                        playbackRate === s
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {s.toFixed(1)}x
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Volume Mute */}
          <button
            onClick={toggleMute}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 shrink-0"
            title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
          >
            {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 shrink-0"
            title="Tải xuống tệp WAV"
          >
            <Download className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Timeline Slider (Full-width) */}
      <div className="w-full flex items-center">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeekChange}
          className="seekbar w-full"
          style={{
            background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, var(--slider-track) ${percentage}%, var(--slider-track) 100%)`
          }}
        />
      </div>
    </div>
  );
};
