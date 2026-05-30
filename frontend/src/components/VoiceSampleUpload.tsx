import React, { useState, useRef } from "react";
import { Upload, FileAudio, Check, AlertCircle } from "lucide-react";
import { api } from "../api/client";

interface VoiceSampleUploadProps {
  onUploadSuccess: (voiceSampleId: string) => void;
  layout?: "classic" | "modern";
}

export const VoiceSampleUpload: React.FC<VoiceSampleUploadProps> = ({ onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [refText, setRefText] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [customId, setCustomId] = useState("");
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
      const res = await api.uploadVoiceSample(
        file, 
        refText || undefined, 
        voiceName || undefined, 
        customId || undefined
      );
      setStatusMsg({
        type: "success",
        text: `Tải lên thành công! ID mẫu: ${res.voice_sample_id}`,
      });
      onUploadSuccess(res.voice_sample_id);
      // Reset inputs
      setFile(null);
      setRefText("");
      setVoiceName("");
      setCustomId("");
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
    <div className="bg-card border border-border rounded-3xl p-6 flex flex-col gap-5 shadow-xl transition-all duration-300 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-xl pointer-events-none" />

      <div className="flex flex-col gap-1 relative z-10">
        <h2 className="text-sm font-extrabold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          <span>Tải lên giọng nói</span>
        </h2>
        <p className="text-xs text-muted-foreground font-medium mt-1">
          Tải lên tệp âm thanh giọng nói của bạn để làm mẫu clone giọng.
        </p>
      </div>

      <form onSubmit={handleUpload} className="flex flex-col gap-4 relative z-10">
        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 ${
            file
              ? "border-success/50 bg-success/5"
              : "border-border hover:border-border bg-background/40 hover:bg-background/60"
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
              <FileAudio className="w-8 h-8 text-success" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                  {file.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-bold">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-muted-foreground">
                  Kéo thả file hoặc Click để duyệt
                </span>
                <span className="text-[9px] text-muted-foreground font-semibold">
                  Hỗ trợ: WAV, MP3, FLAC (Khuyên dùng WAV mono 24kHz)
                </span>
              </div>
            </>
          )}
        </div>

        {/* Ref Text */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
            Nội dung chữ nói (ref_text) - Không bắt buộc
          </label>
          <div className="relative flex flex-col bg-background border border-border/40 rounded-xl p-3 focus-within:border-primary/30 transition-all shadow-inner">
            <textarea
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              placeholder="Nhập nội dung tương ứng với file ghi âm để tăng độ chính xác khi clone..."
              rows={2}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none font-medium leading-relaxed"
            />
          </div>
        </div>

        {/* Name and Custom ID fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
              Tên gợi nhớ (Tùy chọn)
            </label>
            <div className="relative flex flex-col bg-background border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-primary/30 transition-all shadow-inner">
              <input
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="Ví dụ: Giọng Thùy Chi..."
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-semibold"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
              Mã ID giọng nói (slug - Tùy chọn)
            </label>
            <div className="relative flex flex-col bg-background border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-primary/30 transition-all shadow-inner">
              <input
                type="text"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                placeholder="Ví dụ: giong_thuy_chi"
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-mono font-semibold"
              />
            </div>
          </div>
        </div>


        {statusMsg && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
              statusMsg.type === "success"
                ? "bg-success/10 border-success/20 text-success"
                : "bg-destructive/10 border-destructive/20 text-destructive"
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
          className={`w-full py-3 px-6 rounded-full font-bold text-sm transition-all duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-md border ${
            file && !isUploading
              ? "bg-gradient-to-r from-primary to-accent text-white border-none shadow-lg shadow-primary/15 hover:brightness-105"
              : "bg-muted text-muted-foreground border-transparent cursor-not-allowed"
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
