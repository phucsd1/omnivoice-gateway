import React, { useState, useEffect } from "react";
import { Volume2, Lock, Globe, Trash2, Copy, Check, Search, Sparkles } from "lucide-react";
import { api } from "../api/client";
import type { VoiceSampleResponse } from "../api/client";
import { AudioPlayer } from "./AudioPlayer";

interface VoiceLibraryPanelProps {
  onUseVoice: (voiceId: string) => void;
  layout?: "classic" | "modern";
}

export const VoiceLibraryPanel: React.FC<VoiceLibraryPanelProps> = ({ onUseVoice, layout = "modern" }) => {
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
    <div className={`rounded-2xl p-6 flex flex-col gap-6 shadow-lg transition-all ${
      layout === "modern" ? "bg-slate-950 border-2 border-slate-700/90" : "bg-slate-900 border border-slate-800"
    }`}>
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <Volume2 className="w-5 h-5 text-indigo-400 animate-pulse" />
            <span>Thư viện Giọng nói (Voice Library)</span>
          </h2>
          <p className="text-xs text-slate-350">
            Quản lý các giọng nói được tải lên hoặc sinh từ thiết kế để sử dụng lại làm mẫu clone giọng.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-grow">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo tên, ID, hoặc ref_text..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-205 placeholder:text-slate-550 focus:outline-none focus:border-indigo-500 font-semibold"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filter === "all" ? "bg-slate-850 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Tất cả ({voices.length})
          </button>
          <button
            onClick={() => setFilter("private")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filter === "private" ? "bg-slate-850 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Cá nhân ({voices.filter(v => !v.is_public).length})
          </button>
          <button
            onClick={() => setFilter("public")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filter === "public" ? "bg-slate-850 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Cộng đồng ({voices.filter(v => v.is_public).length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs font-semibold rounded-xl">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
          <span className="text-xs font-bold">Đang tải danh sách giọng mẫu...</span>
        </div>
      ) : filteredVoices.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
          {searchQuery ? "Không tìm thấy giọng nói khớp với điều kiện tìm kiếm." : "Thư viện giọng nói trống. Hãy tải lên hoặc thiết kế giọng nói để bắt đầu!"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVoices.map((voice) => {
            const audioUrl = `${api.getApiBaseUrl()}/v1/voice-samples/${voice.id}/audio`;
            return (
              <div
                key={voice.id}
                className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-slate-700/60 transition-all shadow-sm group relative"
              >
                {/* Delete Confirm Overlay */}
                {deleteConfirmId === voice.id && (
                  <div className="absolute inset-0 bg-slate-950/95 rounded-2xl p-4 flex flex-col justify-center items-center gap-3 z-10 animate-fadeIn">
                    <span className="text-xs font-bold text-center text-slate-205">
                      Bạn có chắc chắn muốn xóa giọng mẫu "{voice.name || voice.id}"?
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 rounded-lg cursor-pointer transition-all"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => handleDelete(voice.id)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white rounded-lg cursor-pointer transition-all"
                      >
                        Đồng ý Xóa
                      </button>
                    </div>
                  </div>
                )}

                {/* Top Info */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-extrabold text-sm text-white truncate group-hover:text-slate-300 transition-colors">
                      {voice.name || "Giọng không tên"}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Visibility Badge */}
                      {voice.is_public ? (
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-extrabold text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" />
                          <span>Public</span>
                        </span>
                      ) : (
                        <span className="bg-slate-800 border border-slate-750 text-[9px] font-extrabold text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          <span>Private</span>
                        </span>
                      )}

                      {/* Source Type Badge */}
                      <span className="bg-slate-950 border border-slate-850 text-[9px] font-extrabold text-slate-500 px-2 py-0.5 rounded-full capitalize select-none">
                        {voice.source_type === "uploaded" ? "Tải lên" : voice.source_type === "saved_favorite" ? "Yêu thích" : "Thiết kế"}
                      </span>
                    </div>
                  </div>

                  {/* ID row with copy capability */}
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-450 font-mono">
                    <span className="font-bold text-slate-500">ID:</span>
                    <span className="truncate max-w-[130px] select-all bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded font-bold text-slate-350">
                      {voice.id}
                    </span>
                    <button
                      onClick={(e) => handleCopyId(voice.id, e)}
                      className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-slate-300 cursor-pointer"
                      title="Sao chép ID để gọi tham chiếu API"
                    >
                      {copiedId === voice.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Ref text section */}
                  {voice.ref_text && (
                    <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-3 max-h-[80px] overflow-y-auto text-xs text-slate-300 leading-normal scrollbar-thin">
                      <p className="font-extrabold text-[9px] text-slate-500 uppercase tracking-wider mb-1">Văn bản tham khảo</p>
                      {voice.ref_text}
                    </div>
                  )}

                  {voice.duration && (
                    <span className="text-[10px] font-bold text-slate-500">
                      Thời lượng mẫu: {voice.duration.toFixed(1)} giây
                    </span>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex flex-col gap-2.5 pt-2.5 border-t border-slate-850/80">
                  <AudioPlayer url={audioUrl} title={voice.name || voice.id} />
                  
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => onUseVoice(voice.id)}
                      className="flex-grow py-2 px-3 bg-slate-100 text-slate-950 hover:bg-white font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm hover:translate-y-[-0.5px]"
                    >
                      <Sparkles className="w-3.5 h-3.5 fill-current" />
                      <span>Sử dụng</span>
                    </button>

                    {/* Only show delete button for user owned voices */}
                    {!voice.is_public && (
                      <button
                        onClick={() => setDeleteConfirmId(voice.id)}
                        className="p-2.5 border border-slate-800 hover:border-rose-500/35 hover:bg-rose-500/5 text-slate-450 hover:text-rose-450 rounded-xl transition-all cursor-pointer"
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
