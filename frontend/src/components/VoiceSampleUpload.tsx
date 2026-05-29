import React, { useState, useRef } from "react";
import { Upload, FileAudio, Check, AlertCircle } from "lucide-react";
import { api } from "../api/client";

interface VoiceSampleUploadProps {
  onUploadSuccess: (voiceSampleId: string) => void;
  layout?: "classic" | "modern";
}

export const VoiceSampleUpload: React.FC<VoiceSampleUploadProps> = ({ onUploadSuccess, layout = "classic" }) => {
  const [file, setFile] = useState<File | null>(null);
  const [refText, setRefText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatusMsg(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const validExtensions = [".wav", ".mp3", ".flac"];
      const ext = droppedFile.name.substring(droppedFile.name.lastIndexOf(".")).toLowerCase();
      if (validExtensions.includes(ext)) {
        setFile(droppedFile);
        setStatusMsg(null);
      } else {
        setStatusMsg({ type: "error", text: "Vui lòng chỉ chọn tệp WAV, MP3 hoặc FLAC." });
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setStatusMsg(null);

    try {
      const res = await api.uploadVoiceSample(file, refText || undefined);
      setStatusMsg({
        type: "success",
        text: `Tải lên thành công! ID mẫu: ${res.voice_sample_id}`,
      });
      onUploadSuccess(res.voice_sample_id);
      // Reset inputs
      setFile(null);
      setRefText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err.message || "Đã xảy ra lỗi trong quá trình tải lên.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`rounded-2xl p-6 flex flex-col gap-5 shadow-lg transition-all ${
      layout === "modern" ? "bg-slate-950 border-2 border-slate-700/90" : "bg-slate-900 border border-slate-800"
    }`}>
      <div className="flex flex-col gap-1">
        <h2 className={`text-lg font-bold flex items-center gap-2 ${layout === "modern" ? "text-white font-extrabold" : "text-slate-100"}`}>
          <Upload className="w-5 h-5 text-indigo-400" />
          <span>1. Tải lên mẫu giọng nói</span>
        </h2>
        <p className={`text-xs ${layout === "modern" ? "text-slate-300" : "text-slate-400"}`}>
          Upload file âm thanh giọng nói của bạn để hệ thống clone giọng.
        </p>
      </div>

      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2.5 ${
            file
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".wav,.mp3,.flac"
            className="hidden"
          />
          {file ? (
            <>
              <FileAudio className="w-10 h-10 text-emerald-400" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-200 truncate max-w-[250px]">
                  {file.name}
                </span>
                <span className="text-xs text-slate-450">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 text-slate-500" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-300">
                  Kéo thả file hoặc Click để duyệt
                </span>
                <span className="text-xs text-slate-500">
                  Hỗ trợ: WAV, MP3, FLAC (Khuyên dùng WAV mono 24kHz)
                </span>
              </div>
            </>
          )}
        </div>

        {/* Ref Text */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">
            Nội dung chữ nói (ref_text) - Không bắt buộc
          </label>
          <textarea
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            placeholder="Nhập nội dung tương ứng với file ghi âm để tăng độ chính xác khi clone..."
            rows={2}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-650 resize-none"
          />
        </div>

        {statusMsg && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
              statusMsg.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}
          >
            {statusMsg.type === "success" ? (
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            )}
            <span className="break-all">{statusMsg.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || isUploading}
          className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
            file && !isUploading
              ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/10"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang tải lên...</span>
            </>
          ) : (
            <span>Tải lên mẫu</span>
          )}
        </button>
      </form>
    </div>
  );
};

// Simple loader helper since we references it
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
