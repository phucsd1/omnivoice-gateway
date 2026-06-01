import React, { useState, useEffect } from "react";
import { Volume2, Lock, Globe, Trash2, Copy, Check, Search, Sparkles, Play, Pause } from "lucide-react";
import { api } from "../api/client";
import type { VoiceSampleResponse } from "../api/client";

interface VoiceLibraryPanelProps {
  onUseVoice: (voiceId: string) => void;
  layout?: "classic" | "modern";
  currentPlayUrl: string | null;
  globalPlayerPlaying: boolean;
  onPlayAudio: (url: string, title: string) => void;
  onTogglePlay: () => void;
  activeVoiceSampleId?: string | null;
}

export const VoiceLibraryPanel: React.FC<VoiceLibraryPanelProps> = ({
  onUseVoice,
  currentPlayUrl,
  globalPlayerPlaying,
  onPlayAudio,
  onTogglePlay,
  activeVoiceSampleId,
}) => {
  const [voices, setVoices] = useState<VoiceSampleResponse[]>([]);
  const [filter, setFilter] = useState<"all" | "private" | "public">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchVoices = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.listVoiceSamples();
      setVoices(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể tải danh sách giọng mẫu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteVoiceSample(id);
      setVoices(prev => prev.filter(v => v.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      alert(`Lỗi khi xóa giọng: ${err.message || "Vui lòng thử lại sau."}`);
    }
  };

  // Filter and search logic
  const filteredVoices = voices.filter((v) => {
    const matchesSearch =
      (v.name && v.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.ref_text && v.ref_text.toLowerCase().includes(searchQuery.toLowerCase()));

    if (filter === "private") return matchesSearch && !v.is_public;
    if (filter === "public") return matchesSearch && v.is_public;
    return matchesSearch;
  });

  return (
    <div className="bg-card/75 dark:bg-[#151618]/95 border border-border/80 dark:border-[#2a2b2f]/80 backdrop-blur-md rounded-[var(--radius-card)] p-fluid-card flex flex-col gap-fluid shadow-xl transition-all duration-300">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-fluid-lg font-bold text-foreground flex items-center gap-2.5">
            <Volume2 className="w-5 h-5 text-primary" />
            <span>Thư viện Giọng nói (Voice Library)</span>
          </h2>
          <p className="text-fluid-sm text-muted-foreground">
            Quản lý các giọng nói được tải lên hoặc sinh từ thiết kế để sử dụng làm mẫu clone giọng.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-grow">
          <Search className="absolute left-3.5 top-3.5 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo tên, ID, hoặc văn bản tham chiếu..."
            className="w-full pl-10 pr-4 h-10 bg-white dark:bg-[#131416] border border-border/80 dark:border-[#2a2b2f]/80 rounded-full text-fluid-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 transition-colors font-semibold shadow-inner"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex bg-background/85 dark:bg-[#131416]/85 border border-border/80 dark:border-[#2a2b2f]/80 rounded-full p-1 shrink-0 self-start lg:self-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-1.5 rounded-full text-fluid-sm font-bold transition-all cursor-pointer ${
              filter === "all" ? "bg-card dark:bg-[#1f2023] text-foreground shadow-sm border border-border/80 dark:border-[#2d2e33]" : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            Tất cả ({voices.length})
          </button>
          <button
            onClick={() => setFilter("private")}
            className={`px-4 py-1.5 rounded-full text-fluid-sm font-bold transition-all cursor-pointer ${
              filter === "private" ? "bg-card dark:bg-[#1f2023] text-foreground shadow-sm border border-border/80 dark:border-[#2d2e33]" : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            Cá nhân ({voices.filter(v => !v.is_public).length})
          </button>
          <button
            onClick={() => setFilter("public")}
            className={`px-4 py-1.5 rounded-full text-fluid-sm font-bold transition-all cursor-pointer ${
              filter === "public" ? "bg-card dark:bg-[#1f2023] text-foreground shadow-sm border border-border/80 dark:border-[#2d2e33]" : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            Cộng đồng ({voices.filter(v => v.is_public).length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold rounded-2xl">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <span className="text-xs font-bold text-muted-foreground">Đang tải danh sách giọng mẫu...</span>
        </div>
      ) : filteredVoices.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-3xl text-muted-foreground text-xs font-semibold">
          {searchQuery ? "Không tìm thấy giọng nói khớp với điều kiện tìm kiếm." : "Thư viện giọng nói trống. Hãy tải lên hoặc thiết kế giọng nói để bắt đầu!"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-fluid">
          {filteredVoices.map((voice) => {
            const audioUrl = `${api.getApiBaseUrl()}/v1/voice-samples/${voice.id}/audio`;
            return (
              <div
                key={voice.id}
                className={`bg-card dark:bg-[#1f2023] border rounded-[var(--radius-card)] p-fluid-card flex flex-col justify-between gap-4 transition-all duration-300 group relative shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.08)] ${
                  activeVoiceSampleId === voice.id
                    ? "border-primary/60 dark:border-primary/50 shadow-md shadow-primary/5 ring-1 ring-primary/20"
                    : "border-border/80 dark:border-[#2d2e33] hover:border-border/40 dark:hover:border-[#3d3e45]"
                }`}
              >
                {/* Delete Confirm Overlay */}
                {deleteConfirmId === voice.id && (
                  <div className="absolute inset-0 bg-card/98 rounded-[var(--radius-card)] p-fluid-card flex flex-col justify-center items-center gap-3.5 z-10 animate-fadeIn border border-border">
                    <span className="text-fluid-sm font-bold text-center text-foreground leading-normal">
                      Bạn có chắc chắn muốn xóa giọng mẫu "{voice.name || voice.id}"?
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3.5 h-9 bg-muted hover:bg-muted border border-border text-fluid-sm font-bold text-foreground rounded-full cursor-pointer transition-all flex items-center justify-center"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => handleDelete(voice.id)}
                        className="px-3.5 h-9 bg-destructive hover:bg-destructive/90 text-fluid-sm font-bold text-white rounded-full cursor-pointer transition-all flex items-center justify-center"
                      >
                        Đồng ý Xóa
                      </button>
                    </div>
                  </div>
                )}

                {/* Top Info */}
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-fluid-sm text-foreground truncate group-hover:text-foreground transition-colors">
                        {voice.name || "Giọng không tên"}
                      </span>
                      {activeVoiceSampleId === voice.id && (
                        <span className="bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary px-2 py-0.5 rounded-full flex items-center gap-1 mt-1 w-max animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                          <span>Đang dùng</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {/* Visibility Badge */}
                      {voice.is_public ? (
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1 select-none">
                          <Globe className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Công khai</span>
                        </span>
                      ) : (
                        <span className="bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-full flex items-center gap-1 select-none">
                          <Lock className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-400" />
                          <span>Riêng tư</span>
                        </span>
                      )}

                      {/* Source Type Badge */}
                      {voice.source_type === "uploaded" && (
                        <span className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 text-[10px] font-bold text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full select-none">
                          Tải lên
                        </span>
                      )}
                      {voice.source_type === "saved_favorite" && (
                        <span className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/60 text-[10px] font-bold text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full select-none">
                          Yêu thích
                        </span>
                      )}
                      {voice.source_type !== "uploaded" && voice.source_type !== "saved_favorite" && (
                        <span className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60 text-[10px] font-bold text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full select-none">
                          Thiết kế
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ID row with copy capability */}
                  <div className="flex items-center gap-1.5 text-fluid-xs text-muted-foreground font-mono">
                    <span className="font-bold text-muted-foreground">ID:</span>
                    <span className="truncate max-w-[130px] select-all bg-card border border-border px-2 py-0.5 rounded-md font-bold text-muted-foreground">
                      {voice.id}
                    </span>
                    <button
                      onClick={(e) => handleCopyId(voice.id, e)}
                      className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-muted-foreground cursor-pointer"
                      title="Sao chép ID"
                    >
                      {copiedId === voice.id ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Ref text section */}
                  {voice.ref_text && (
                    <div className="bg-background/80 dark:bg-[#131416]/90 border border-border/80 dark:border-[#2d2e33]/80 rounded-2xl p-3 max-h-[100px] overflow-y-auto text-fluid-sm text-foreground leading-normal scrollbar-thin">
                      <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Văn bản tham khảo</p>
                      {voice.ref_text}
                    </div>
                  )}

                  {voice.duration && (
                    <span className="text-fluid-xs font-bold text-muted-foreground">
                      Thời lượng: {voice.duration.toFixed(1)} giây
                    </span>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex flex-col gap-3 pt-3 border-t border-border">
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        if (currentPlayUrl === audioUrl) {
                          onTogglePlay();
                        } else {
                          onPlayAudio(audioUrl, voice.name || voice.id);
                        }
                      }}
                      className={`p-2 border rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                        currentPlayUrl === audioUrl && globalPlayerPlaying
                          ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                          : "border-border hover:border-primary/40 hover:bg-muted text-foreground"
                      }`}
                      title={currentPlayUrl === audioUrl && globalPlayerPlaying ? "Tạm dừng" : "Nghe thử"}
                    >
                      {currentPlayUrl === audioUrl && globalPlayerPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      onClick={() => onUseVoice(voice.id)}
                      className="flex-grow h-10 bg-gradient-to-r from-primary to-accent text-white hover:brightness-105 font-bold text-fluid-sm rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-primary/10 active:scale-[0.98]"
                    >
                      <Sparkles className="w-3.5 h-3.5 fill-current" />
                      <span>Sử dụng giọng này</span>
                    </button>

                    {/* Only show delete button for user owned voices */}
                    {!voice.is_public && (
                      <button
                        onClick={() => setDeleteConfirmId(voice.id)}
                        className="p-2 border border-border hover:border-destructive/35 hover:bg-destructive/5 text-muted-foreground hover:text-destructive rounded-full transition-all cursor-pointer shrink-0"
                        title="Xóa khỏi thư viện"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
