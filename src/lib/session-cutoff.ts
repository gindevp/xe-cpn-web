/** Giờ Việt Nam, không DST. Khớp BE SessionCutoff. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export type SessionPolicy = {
  enabled: boolean;
  logoutTime: string;
  timeZone?: string;
};

export function nextSessionEndMs(issuedAtMs: number, logoutTime: string): number {
  const [hh, mm] = logoutTime.split(":").map((p) => Number(p));
  const hour = Number.isFinite(hh) ? hh : 21;
  const minute = Number.isFinite(mm) ? mm : 0;
  const local = new Date(issuedAtMs + VN_OFFSET_MS);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const da = local.getUTCDate();
  const sameDay = Date.UTC(y, mo, da, hour, minute) - VN_OFFSET_MS;
  if (issuedAtMs < sameDay) return sameDay;
  return Date.UTC(y, mo, da + 1, hour, minute) - VN_OFFSET_MS;
}

export function jwtIssuedAtMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { iat?: number };
    return typeof json.iat === "number" ? json.iat * 1000 : null;
  } catch {
    return null;
  }
}

export function sessionHasEnded(token: string, policy: SessionPolicy, now = Date.now()): boolean {
  if (!policy.enabled) return false;
  const issued = jwtIssuedAtMs(token);
  if (issued == null) return false;
  return now >= nextSessionEndMs(issued, policy.logoutTime || "21:00");
}
