export function getApiBaseUrl(): string {
  // If running locally, check local environment or default to localhost:7860
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl && !envUrl.includes("pages.dev")) return envUrl.replace(/\/$/, "");
    return "http://localhost:7860";
  }
  
  // For production, always use the fixed Hugging Face Space backend URL
  return "https://phucsd-omnivoice-gateway-backend.hf.space";
}

export function setApiBaseUrl(url: string) {
  // Disabled as requested: URL is fixed for all users
  void url;
}

export interface HealthResponse {
  status: string;
  app: string;
}

export interface VoiceSampleUploadResponse {
  voice_sample_id: string;
  status: string;
  message: string;
}

export interface VoiceSampleResponse {
  id: string;
  source_type: string;
  ref_text: string | null;
  duration: number | null;
  sample_rate: number | null;
  status: string;
  created_at: string;
  name: string | null;
  is_public: boolean;
  source_job_id: string | null;
  tags?: string[] | null;
  source_job_data?: Record<string, any> | null;
}

export interface VoiceSampleUpdateRequest {
  name?: string;
  tags?: string[];
  ref_text?: string;
  is_public?: boolean;
}

export interface VoiceDesignPreviewResponse {
  preview_id: string;
  job_id: string;
  status: string;
  message: string;
}

export interface VoiceDesignPreviewDetail {
  id: string;
  voice_request: string;
  instruct: string;
  preview_text: string;
  preview_audio_path: string | null;
  accepted_sample_id: string | null;
  status: string;
  created_at: string;
}

export interface AcceptPreviewResponse {
  voice_sample_id: string;
  status: string;
  message: string;
}

export interface TTSJobResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: string;
  message: string | null;
  progress: number;
  audio_url: string | null;
  error_message: string | null;
  job_type?: string;
  text?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  processing_time?: number;
  queue_time?: number;
  total_time?: number;
  params?: Record<string, any>;
  alignment?: any;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used_at: string | null;
}

export interface AdminApiKeyResponse extends ApiKeyResponse {
  user_id: string;
}

export interface UserCreateRequest {
  username: string;
  email: string;
  password: string;
  is_verified?: boolean;
  is_approved?: boolean;
  is_admin?: boolean;
}

export interface UserUpdateRequest {
  username?: string;
  email?: string;
  password?: string;
  is_verified?: boolean;
  is_approved?: boolean;
  is_admin?: boolean;
}

export interface SystemSettingsResponse {
  worker_mode: string;
  require_admin_approval: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_from: string;
  kaggle_username: string;
  kaggle_key: string;
  kaggle_kernel_ref: string;
  kaggle_kernel_slug: string;
  kaggle_kernel_title: string;
  kaggle_accelerator: string;
  kaggle_timeout_seconds: number;
  kaggle_idle_timeout_seconds: number;
  kaggle_worker_dir: string;
  ui_layout: string;
}

export interface SystemSettingsUpdateRequest {
  worker_mode?: string;
  require_admin_approval?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from?: string;
  kaggle_username?: string;
  kaggle_key?: string;
  kaggle_kernel_ref?: string;
  kaggle_kernel_slug?: string;
  kaggle_kernel_title?: string;
  kaggle_accelerator?: string;
  kaggle_timeout_seconds?: number;
  kaggle_idle_timeout_seconds?: number;
  kaggle_worker_dir?: string;
  ui_layout?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  
  const token = localStorage.getItem("VITE_JWT_TOKEN");
  const headers = new Headers(options?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  const newOptions = {
    ...options,
    headers
  };
  
  const response = await fetch(url, newOptions);
  
  if (!response.ok) {
    let errorDetail = "";
    try {
      const errData = await response.json();
      errorDetail = errData.detail || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(errorDetail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json() as Promise<T>;
}

export interface OmniVoiceParams {
  denoise?: boolean;
  guidance_scale?: number;
  t_shift?: number;
  position_temperature?: number;
  class_temperature?: number;
  layer_penalty_factor?: number;
  duration?: number;
  preprocess_prompt?: boolean;
  postprocess_output?: boolean;
  audio_chunk_duration?: number;
  audio_chunk_threshold?: number;
  with_alignment?: boolean;
}

export const api = {
  getApiBaseUrl,
  setApiBaseUrl,

  getHealth: async (): Promise<HealthResponse> => {
    return request<HealthResponse>("/health");
  },
  
  uploadVoiceSample: async (file: File, refText?: string, name?: string, customId?: string): Promise<VoiceSampleUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (refText) {
      formData.append("ref_text", refText);
    }
    if (name) {
      formData.append("name", name);
    }
    if (customId) {
      formData.append("custom_id", customId);
    }
    
    return request<VoiceSampleUploadResponse>("/v1/voice-samples", {
      method: "POST",
      body: formData,
    });
  },
  
  createVoiceDesignPreview: async (voiceRequest: string, previewText: string, speed?: number, numStep?: number, params?: OmniVoiceParams): Promise<VoiceDesignPreviewResponse> => {
    return request<VoiceDesignPreviewResponse>("/v1/voice-design/previews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        voice_request: voiceRequest, 
        preview_text: previewText,
        speed: speed !== undefined ? speed : 1.0,
        num_step: numStep !== undefined ? numStep : 32,
        ...params
      }),
    });
  },
  
  getPreviewInfo: async (previewId: string): Promise<VoiceDesignPreviewDetail> => {
    return request<VoiceDesignPreviewDetail>(`/v1/voice-design/previews/${previewId}?t=${Date.now()}`);
  },
  
  acceptPreview: async (previewId: string): Promise<AcceptPreviewResponse> => {
    return request<AcceptPreviewResponse>(`/v1/voice-design/previews/${previewId}/accept`, {
      method: "POST",
    });
  },
  
  createTTSJob: async (mode: string, text: string, voiceSampleId?: string, instruct?: string, speed?: number, numStep?: number, params?: OmniVoiceParams, refText?: string): Promise<TTSJobResponse> => {
    return request<TTSJobResponse>("/v1/tts/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        text,
        voice_sample_id: voiceSampleId || null,
        ref_text: refText || null,
        instruct: instruct || null,
        speed: speed !== undefined ? speed : 1.0,
        num_step: numStep !== undefined ? numStep : 32,
        ...params
      }),
    });
  },
  
  getJobStatus: async (jobId: string): Promise<JobStatusResponse> => {
    return request<JobStatusResponse>(`/v1/jobs/${jobId}?t=${Date.now()}`);
  },
  
  listJobs: async (): Promise<JobStatusResponse[]> => {
    return request<JobStatusResponse[]>("/v1/jobs");
  },

  deleteJob: async (jobId: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>(`/v1/jobs/${jobId}`, {
      method: "DELETE",
    });
  },

  getSettings: async (): Promise<SystemSettings> => {
    return request<SystemSettings>(`/v1/settings?t=${Date.now()}`);
  },

  updateSettings: async (payload: SettingsUpdateRequest): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>("/v1/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  },

  testKaggleConnection: async (): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>("/v1/settings/test-kaggle", {
      method: "POST",
    });
  },

  pushNotebook: async (): Promise<{ success: boolean; message: string; url?: string }> => {
    return request<{ success: boolean; message: string; url?: string }>("/v1/settings/push-notebook", {
      method: "POST",
    });
  },

  login: async (username: string, password: string): Promise<{ access_token: string; token_type: string }> => {
    return request<{ access_token: string; token_type: string }>("/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  },

  register: async (username: string, password: string, email: string): Promise<{ status: string; message: string; debug_code?: string }> => {
    return request<{ status: string; message: string; debug_code?: string }>("/v1/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password, email }),
    });
  },

  verifyEmail: async (username: string, code: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>("/v1/auth/verify-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, code }),
    });
  },

  resendCode: async (username: string): Promise<{ status: string; message: string; debug_code?: string }> => {
    return request<{ status: string; message: string; debug_code?: string }>("/v1/auth/resend-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });
  },

  oauthMock: async (email: string, username: string, oauthProvider: string, oauthId: string): Promise<{ access_token: string; token_type: string }> => {
    return request<{ access_token: string; token_type: string }>("/v1/auth/oauth/mock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, username, oauth_provider: oauthProvider, oauth_id: oauthId }),
    });
  },

  getMe: async (): Promise<UserMeResponse> => {
    return request<UserMeResponse>(`/v1/auth/me?t=${Date.now()}`);
  },

  // Multi-API Keys (User side)
  getUserApiKeys: async (): Promise<ApiKeyResponse[]> => {
    return request<ApiKeyResponse[]>("/v1/auth/apikeys");
  },

  createUserApiKey: async (name: string): Promise<ApiKeyResponse> => {
    return request<ApiKeyResponse>("/v1/auth/apikeys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  },

  deleteUserApiKey: async (keyId: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>(`/v1/auth/apikeys/${keyId}`, {
      method: "DELETE",
    });
  },

  // Deprecated single API key calls
  generateApiKey: async (): Promise<{ status: string; message: string; api_key: string }> => {
    return request<{ status: string; message: string; api_key: string }>("/v1/auth/apikey", {
      method: "POST",
    });
  },

  revokeApiKey: async (): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>("/v1/auth/apikey", {
      method: "DELETE",
    });
  },

  // Admin Portal endpoints
  getAdminUsers: async (): Promise<UserAdminResponse[]> => {
    return request<UserAdminResponse[]>("/v1/admin/users");
  },

  adminCreateUser: async (payload: UserCreateRequest): Promise<UserAdminResponse> => {
    return request<UserAdminResponse>("/v1/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  },

  adminUpdateUser: async (userId: string, payload: UserUpdateRequest): Promise<UserAdminResponse> => {
    return request<UserAdminResponse>(`/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  },

  // Deprecated simple update
  updateUser: async (userId: string, isVerified?: boolean, isAdmin?: boolean): Promise<UserAdminResponse> => {
    return request<UserAdminResponse>(`/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_verified: isVerified, is_admin: isAdmin }),
    });
  },

  deleteUser: async (userId: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>(`/v1/admin/users/${userId}`, {
      method: "DELETE",
    });
  },

  adminGetUserApiKeys: async (userId: string): Promise<AdminApiKeyResponse[]> => {
    return request<AdminApiKeyResponse[]>(`/v1/admin/users/${userId}/apikeys`);
  },

  adminCreateUserApiKey: async (userId: string, name: string): Promise<AdminApiKeyResponse> => {
    return request<AdminApiKeyResponse>(`/v1/admin/users/${userId}/apikeys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  },

  adminDeleteApiKey: async (keyId: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>(`/v1/admin/apikeys/${keyId}`, {
      method: "DELETE",
    });
  },

  adminGetSystemSettings: async (): Promise<SystemSettingsResponse> => {
    return request<SystemSettingsResponse>("/v1/admin/settings");
  },

  adminUpdateSystemSettings: async (payload: SystemSettingsUpdateRequest): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>("/v1/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  },

  getAdminStats: async (): Promise<AdminStatsResponse> => {
    return request<AdminStatsResponse>("/v1/admin/stats");
  },

  getAdminLogs: async (statusCode?: number): Promise<ApiLogResponse[]> => {
    const url = statusCode !== undefined ? `/v1/admin/logs?status_code=${statusCode}` : "/v1/admin/logs";
    return request<ApiLogResponse[]>(url);
  },

  listVoiceSamples: async (tag?: string): Promise<VoiceSampleResponse[]> => {
    const params = tag ? `?tag=${encodeURIComponent(tag)}` : "";
    return request<VoiceSampleResponse[]>(`/v1/voice-samples${params}`);
  },

  saveFavoriteVoice: async (payload: { job_id?: string; preview_id?: string; name: string; is_public: boolean; ref_text: string; custom_id?: string; tags?: string[] }): Promise<VoiceSampleUploadResponse> => {
    return request<VoiceSampleUploadResponse>("/v1/voice-samples/save-favorite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  },

  updateVoiceSample: async (voiceSampleId: string, payload: VoiceSampleUpdateRequest): Promise<VoiceSampleResponse> => {
    return request<VoiceSampleResponse>(`/v1/voice-samples/${voiceSampleId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  },

  deleteVoiceSample: async (voiceSampleId: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>(`/v1/voice-samples/${voiceSampleId}`, {
      method: "DELETE",
    });
  },
};

export interface UserMeResponse {
  id: string;
  username: string;
  email: string | null;
  is_verified: boolean;
  is_admin: boolean;
  has_api_key: boolean;
  api_key: string | null;
  created_at: string;
}

export interface UserAdminResponse {
  id: string;
  username: string;
  email: string | null;
  is_verified: boolean;
  is_approved: boolean;
  is_admin: boolean;
  oauth_provider: string | null;
  created_at: string;
}

export interface AdminStatsResponse {
  total_users: number;
  verified_users: number;
  active_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  total_api_calls: number;
}

export interface ApiLogResponse {
  id: string;
  user_id: string | null;
  username: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string | null;
  duration_ms: number;
  created_at: string;
}

export interface SystemSettings {
  kaggle_username: string;
  kaggle_key_configured: boolean;
  kaggle_kernel_ref: string;
  kaggle_kernel_slug: string;
  kaggle_kernel_title: string;
  kaggle_accelerator: string;
  kaggle_timeout_seconds: number;
  kaggle_worker_dir: string;
  worker_mode: string;
  ui_layout: string;
}

export interface SettingsUpdateRequest {
  kaggle_username?: string;
  kaggle_key?: string;
  kaggle_kernel_ref?: string;
  kaggle_kernel_slug?: string;
  kaggle_kernel_title?: string;
  kaggle_accelerator?: string;
  kaggle_timeout_seconds?: number;
  kaggle_worker_dir?: string;
}
