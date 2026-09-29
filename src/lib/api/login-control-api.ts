import { apiRequest } from "./client";

export type LoginTrustRow = {
  id: number;
  userLogin: string;
  displayName?: string | null;
  roleCode?: string | null;
  kind: "IP" | "DEVICE";
  value: string;
  label?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  requestedAt: string;
  lastSeenAt?: string | null;
  lastIp?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
};

export type UserSessionRow = {
  id: number;
  userLogin: string;
  displayName?: string | null;
  roleCode?: string | null;
  channel: "WEB" | "APP";
  ip?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastSeenAt?: string | null;
  expiresAt?: string | null;
};

const BASE = "/api/admin/login-control";

export function listLoginTrusts(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<LoginTrustRow[]>(`${BASE}/trusts${q}`);
}

export function decideLoginTrust(id: number, action: "approve" | "reject" | "revoke") {
  return apiRequest<void>(`${BASE}/trusts/${id}/${action}`, { method: "POST" });
}

export function listUserSessions() {
  return apiRequest<UserSessionRow[]>(`${BASE}/sessions`);
}

export function revokeUserSession(id: number) {
  return apiRequest<void>(`${BASE}/sessions/${id}/revoke`, { method: "POST" });
}
