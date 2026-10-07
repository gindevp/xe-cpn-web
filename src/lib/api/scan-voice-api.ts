import { ApiError, getApiBase, getToken } from "./client";

export type ScanVoiceType = "ok" | "err";

export type ScanVoiceMeta = {
  type: ScanVoiceType;
  configured: boolean;
  etag?: string | null;
  contentType?: string | null;
  fileName?: string | null;
  byteSize?: number;
  updatedAt?: string | null;
};

const LABEL: Record<ScanVoiceType, string> = {
  ok: "Quét đúng (Được)",
  err: "Quét sai (Sai)",
};

export function scanVoiceLabel(type: ScanVoiceType) {
  return LABEL[type];
}

async function scanVoiceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getApiBase();
  if (!base) throw new ApiError("API base URL not configured", 0);
  const token = getToken();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok && res.status !== 304) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      const d = JSON.parse(text) as { detail?: string; title?: string };
      msg = d.detail || d.title || msg;
    } catch {
      if (text && text.length < 300) msg = text;
    }
    throw new ApiError(msg, res.status);
  }
  return res;
}

export async function listScanVoices(): Promise<ScanVoiceMeta[]> {
  const res = await scanVoiceFetch("/api/scan-voices");
  const data = (await res.json()) as { voices?: ScanVoiceMeta[] };
  return data.voices ?? [];
}

export async function uploadScanVoice(type: ScanVoiceType, file: File): Promise<ScanVoiceMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await scanVoiceFetch(`/api/scan-voices/${type}`, { method: "PUT", body: form });
  return (await res.json()) as ScanVoiceMeta;
}

export async function deleteScanVoice(type: ScanVoiceType): Promise<void> {
  await scanVoiceFetch(`/api/scan-voices/${type}`, { method: "DELETE" });
}

export async function fetchScanVoiceBlob(type: ScanVoiceType): Promise<Blob> {
  const res = await scanVoiceFetch(`/api/scan-voices/${type}/file`);
  return res.blob();
}
