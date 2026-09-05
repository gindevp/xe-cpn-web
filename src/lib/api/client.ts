import { isNativeWebView } from "../native-shell";

const TOKEN_KEY = "xe-jwt";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void };
    __XE_NATIVE_API_BASE__?: string;
    __XE_NATIVE_TOKEN__?: string;
    __XE_NATIVE_OFFICE__?: string;
    __XE_NATIVE_LOGIN__?: string;
    __XE_NATIVE_ROLE__?: string;
    __xeApplyScan?: (code: string) => void;
  }
}

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const injected = window.__XE_NATIVE_API_BASE__?.replace(/\/$/, "");
    if (injected) return injected;
    if (isNativeWebView()) {
      const host = window.location.hostname;
      if (host && host !== "localhost" && !host.includes("vercel.app")) {
        return `${window.location.protocol}//${host}:7080`;
      }
    }
  }
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (raw ?? "").replace(/\/$/, "");
}

export function isApiEnabled(): boolean {
  return getApiBase().length > 0;
}

export function getToken(): string | null {
  if (typeof window !== "undefined" && window.__XE_NATIVE_TOKEN__) {
    return window.__XE_NATIVE_TOKEN__;
  }
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window !== "undefined") {
    if (token) window.__XE_NATIVE_TOKEN__ = token;
    else delete window.__XE_NATIVE_TOKEN__;
  }
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
};

export async function apiRequest<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const base = getApiBase();
  if (!base) throw new ApiError("API base URL not configured", 0);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const d = data as {
      title?: string;
      detail?: string;
      message?: string;
      properties?: { message?: string; params?: string };
      fieldErrors?: Array<{ field?: string; message?: string; objectName?: string }>;
    };
    const fields = (d?.fieldErrors ?? [])
      .map((f) => `${f.field ?? f.objectName ?? "?"}: ${f.message ?? ""}`)
      .filter((s) => s.trim() !== ":")
      .join("; ");
    const errKey = d?.message || d?.properties?.message || "";
    const human =
      errKey === "error.routeNotFound"
        ? "Không tìm thấy tuyến trên hệ thống — thêm/bật tuyến ở Master dữ liệu"
        : errKey === "error.officeNotFound"
          ? "Không tìm thấy văn phòng"
          : errKey === "error.vehicleNotFound"
            ? "Không tìm thấy xe"
            : errKey === "error.driverNotFound"
              ? "Không tìm thấy tài xế"
              : errKey.startsWith("error.")
                ? errKey
                : "";
    const detail =
      typeof d?.detail === "string" && d.detail && d.detail !== "null" ? d.detail : "";
    const msg =
      fields ||
      detail ||
      human ||
      (typeof d?.title === "string" && d.title !== "Bad Request" ? d.title : "") ||
      (typeof data === "string" && !data.includes("ProblemDetail") ? data : "") ||
      `HTTP ${res.status}`;
    throw new ApiError(String(msg), res.status, data);
  }
  return data as T;
}
