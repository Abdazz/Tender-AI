const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: "admin" | "viewer";
  password_reset_required: boolean;
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  role: "admin" | "viewer";
  is_active: boolean;
  password_reset_required: boolean;
}

export interface RunItem {
  run_id: string;
  status: string;
  started_at: string;
  finished_at?: string;
  duration_seconds?: number;
  stats?: { relevant_items: number };
}

export const api = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/api/v1/admin/login/simple", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: (token: string) =>
    request<{ username: string; email: string; role: string; password_reset_required: boolean }>(
      "/api/v1/admin/me",
      {},
      token
    ),

  changePassword: (token: string, current_password: string, new_password: string) =>
    request("/api/v1/admin/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }, token),

  listUsers: (token: string) =>
    request<{ users: UserOut[] }>("/api/v1/users", {}, token),

  createUser: (token: string, data: { username: string; email: string; role: string }) =>
    request<UserOut>("/api/v1/users", { method: "POST", body: JSON.stringify(data) }, token),

  updateUser: (token: string, id: string, data: { role?: string; is_active?: boolean }) =>
    request<UserOut>(`/api/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token),

  deleteUser: (token: string, id: string) =>
    request(`/api/v1/users/${id}`, { method: "DELETE" }, token),

  resetPassword: (token: string, id: string) =>
    request<UserOut>(`/api/v1/users/${id}/reset-password`, { method: "POST" }, token),

  getRuns: (token: string, page = 1, pageSize = 10) =>
    request<{ runs: RunItem[] }>(`/api/v1/runs?page=${page}&page_size=${pageSize}`, {}, token),

  triggerRun: (token: string) =>
    request("/api/v1/runs/trigger", { method: "POST", body: JSON.stringify({ triggered_by: "ui" }) }, token),

  getHealth: () =>
    request<{ status: string; components: Record<string, { status: string }> }>("/health"),

  getSources: (token: string) =>
    request<{ sources: unknown[] }>("/api/v1/sources?enabled_only=false", {}, token),
};
