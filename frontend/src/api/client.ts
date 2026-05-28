export function getApiBaseUrl(): string {
  const stored = localStorage.getItem("VITE_API_BASE_URL");
  if (stored !== null && !stored.includes("pages.dev")) return stored.replace(/\/$/, "");
  
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && !envUrl.includes("pages.dev")) return envUrl.replace(/\/$/, "");
  
  return "https://phucsd-omnivoice-gateway-backend.hf.space";
}

export function setApiBaseUrl(url: string) {
  localStorage.setItem("VITE_API_BASE_URL", url.trim());
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

export const api = {
  getApiBaseUrl,
  setApiBaseUrl,

  
  getHealth: async (): Promise<HealthResponse> => {
    return request<HealthResponse>("/health");
  },
  
  uploadVoiceSample: async (file: File, refText?: string): Promise<VoiceSampleUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (refText) {
      formData.append("ref_text", refText);
    }
    
    return request<VoiceSampleUploadResponse>("/v1/voice-samples", {
      method: "POST",
      body: formData,
    });
  },
  
  createVoiceDesignPreview: async (voiceRequest: string, previewText: string, speed?: number, numStep?: number): Promise<VoiceDesignPreviewResponse> => {
    return request<VoiceDesignPreviewResponse>("/v1/voice-design/previews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        voice_request: voiceRequest, 
        preview_text: previewText,
        speed: speed !== undefined ? speed : 1.0,
        num_step: numStep !== undefined ? numStep : 32
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
  
  createTTSJob: async (mode: string, text: string, voiceSampleId?: string, instruct?: string, speed?: number, numStep?: number): Promise<TTSJobResponse> => {
    return request<TTSJobResponse>("/v1/tts/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        text,
        voice_sample_id: voiceSampleId || null,
        instruct: instruct || null,
        speed: speed !== undefined ? speed : 1.0,
        num_step: numStep !== undefined ? numStep : 32
      }),
    });
  },
  
  getJobStatus: async (jobId: string): Promise<JobStatusResponse> => {
    return request<JobStatusResponse>(`/v1/jobs/${jobId}?t=${Date.now()}`);
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

  register: async (username: string, password: string): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>("/v1/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  },

  getMe: async (): Promise<UserMeResponse> => {
    return request<UserMeResponse>(`/v1/auth/me?t=${Date.now()}`);
  },

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
};

export interface UserMeResponse {
  id: string;
  username: string;
  has_api_key: boolean;
  api_key: string | null;
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


