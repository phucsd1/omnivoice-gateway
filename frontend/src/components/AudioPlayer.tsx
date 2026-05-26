import React from "react";
import { Download, Play } from "lucide-react";

interface AudioPlayerProps {
  url: string;
  title?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ url, title }) => {
  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    const link = document.createElement("a");
    link.href = url;
    link.download = title ? `${title.replace(/\s+/g, "_")}.wav` : "audio.wav";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-md">
      {title && (
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
          <Play className="w-3.5 h-3.5" />
          <span>{title}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <audio src={url} controls className="w-full flex-grow accent-indigo-500 h-10" />
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Tải file WAV</span>
        </button>
      </div>
    </div>
  );
};
