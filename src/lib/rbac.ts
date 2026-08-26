import { useSyncExternalStore } from "react";
import type { Role } from "./mock-data";

export type ScreenKey =
  | "dashboard"
  | "van-don"
  | "cho-ban-giao"
  | "nhap-kho-luan-chuyen"
  | "giao-thanh-cong"
  | "cho-giao-lai"
  | "don-hoan"
  | "don-huy"
  | "ngoai-le"
  | "phieu-thu"
  | "danh-sach-phieu-thu"
  | "quan-ly-don-cod"

  | "hang-cho-len-xe"
  | "duyet-huy"
  | "hang-sap-ve"
  | "dieu-chinh"
  | "hoan-hang"
  | "chuyen"
  | "quet-xuat"
  | "quet-nhap"
  | "doi-soat"
  | "pod-quay"
  | "giao-tan-nha"
  | "day-ship"
  | "bao-cao-thu"
  | "bang-gia"
  | "master"
  | "tai-khoan"
  | "tich-hop"
  | "phu-phi"
  | "kiem-ke"
  | "bao-cao-gio"
  | "ton-kho"
  | "nhom-quyen"
  | "tac-vu";

// Y = read+write, R = read-only, N = no access
type Perm = "Y" | "R" | "N";

const MATRIX: Record<ScreenKey, Partial<Record<Role, Perm>>> = {
  dashboard: { BL: "R", DH: "Y", TCN: "Y", KT: "R", AD: "Y" },
  "van-don": { Q: "Y", TCN: "Y", DH: "Y", KT: "R", BL: "R", BX: "R", G: "R", AD: "Y" },
  /** Mobile task home — entry only; cards still filtered per target screen */
  "tac-vu": { Q: "Y", BX: "Y", G: "Y", TCN: "Y", DH: "Y", KT: "Y", BL: "R", AD: "Y" },

  "nhap-kho-luan-chuyen": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", BX: "Y", KT: "R", BL: "R", AD: "Y" },
  "giao-thanh-cong": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", BX: "Y", KT: "R", BL: "R", AD: "Y" },
  "cho-giao-lai": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", KT: "R", BL: "R", AD: "Y" },
  "cho-ban-giao": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", KT: "R", BL: "R", AD: "Y" },
  "don-huy": { Q: "R", TCN: "Y", DH: "Y", KT: "R", BL: "R", AD: "Y" },
  "ngoai-le": { Q: "Y", TCN: "Y", DH: "Y", G: "R", KT: "R", BL: "R", AD: "Y" },
  "phieu-thu": { Q: "Y", TCN: "Y", DH: "Y", KT: "Y", BL: "R", AD: "Y" },
  "danh-sach-phieu-thu": { Q: "R", TCN: "Y", DH: "Y", KT: "Y", BL: "R", AD: "Y" },
  "quan-ly-don-cod": { Q: "R", TCN: "Y", DH: "Y", KT: "Y", BL: "R", AD: "Y" },
  "don-hoan": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", BX: "Y", KT: "R", BL: "R", AD: "Y" },
  "hang-cho-len-xe": { Q: "Y", TCN: "Y", DH: "Y", BX: "Y", AD: "Y" },
  "duyet-huy": { Q: "Y", TCN: "Y", DH: "Y", AD: "Y" },
  "hang-sap-ve": { Q: "Y", TCN: "Y", DH: "Y", BX: "R", BL: "R", AD: "Y" },
  "dieu-chinh": { TCN: "Y", DH: "Y", AD: "Y" },
  "hoan-hang": { Q: "Y", TCN: "Y", DH: "Y", AD: "Y" },
  chuyen: { BX: "Y", TCN: "Y", DH: "Y", BL: "R", AD: "Y" },
  "quet-xuat": { BX: "Y", DH: "Y", AD: "Y" },
  "quet-nhap": { BX: "Y", Q: "Y", DH: "Y", AD: "Y" },
  "doi-soat": { BX: "Y", TCN: "Y", DH: "Y", BL: "R", AD: "Y" },
  "pod-quay": { Q: "Y", TCN: "Y", DH: "Y", BX: "Y", AD: "Y" },
  "giao-tan-nha": { G: "Y", BX: "Y", TCN: "R", DH: "R", AD: "Y" },
  "day-ship": { Q: "Y", DH: "Y", AD: "Y" },
  "bao-cao-thu": { KT: "Y", Q: "R", TCN: "R", DH: "R", BL: "R", AD: "Y" },
  "bang-gia": { AD: "Y", TCN: "R", DH: "R", BL: "R" },
  master: { DH: "Y", AD: "Y" },
  "tai-khoan": { AD: "Y" },
  "nhom-quyen": { AD: "Y" },
  "tich-hop": { AD: "Y" },
  "phu-phi": { AD: "Y", DH: "R" },
  "ton-kho": { Q: "Y", TCN: "Y", DH: "Y", BX: "R", KT: "R", BL: "R", AD: "Y" },
  "kiem-ke": { Q: "Y", TCN: "Y", DH: "Y", BX: "R", KT: "R", BL: "R", AD: "Y" },
  "bao-cao-gio": { Q: "R", TCN: "Y", DH: "Y", BX: "R", KT: "R", BL: "R", AD: "Y" },
};

/**
 * Effective permissions of the signed-in staff, served by `GET /api/account`.
 * Null = API off (mock/dev) or not loaded yet → fall back to MATRIX.
 */
let runtimePerms: Partial<Record<ScreenKey, Perm>> | null = null;
let runtimeSystemAdmin = false;
let runtimeVersion = 0;
const runtimeListeners = new Set<() => void>();

function notifyRuntime() {
  runtimeVersion += 1;
  for (const fn of runtimeListeners) fn();
}

function subscribeRuntimePermissions(fn: () => void): () => void {
  runtimeListeners.add(fn);
  return () => {
    runtimeListeners.delete(fn);
  };
}

/** Re-render screens/nav when permissions arrive from the API after mount. */
export function useRbacVersion() {
  return useSyncExternalStore(
    subscribeRuntimePermissions,
    () => runtimeVersion,
    () => runtimeVersion,
  );
}

export function setRuntimePermissions(
  perms: Record<string, string> | undefined | null,
  systemAdmin = false,
) {
  runtimeSystemAdmin = systemAdmin;
  if (!perms || !Object.keys(perms).length) {
    runtimePerms = null;
    notifyRuntime();
    return;
  }
  const next: Partial<Record<ScreenKey, Perm>> = {};
  for (const [key, value] of Object.entries(perms)) {
    if (key in MATRIX) next[key as ScreenKey] = value === "Y" || value === "R" ? value : "N";
  }
  runtimePerms = next;
  notifyRuntime();
}

export function clearRuntimePermissions() {
  runtimePerms = null;
  runtimeSystemAdmin = false;
  notifyRuntime();
}

export function hasRuntimePermissions() {
  return runtimePerms != null;
}

export function can(role: Role | undefined, screen: ScreenKey): Perm {
  if (!role) return "N";
  if (runtimeSystemAdmin) return "Y";
  if (runtimePerms) return runtimePerms[screen] ?? "N";
  return MATRIX[screen]?.[role] ?? "N";
}

export function canRead(role: Role | undefined, screen: ScreenKey) {
  const p = can(role, screen);
  return p === "Y" || p === "R";
}

export function canWrite(role: Role | undefined, screen: ScreenKey) {
  return can(role, screen) === "Y";
}

// Read-only account: no write grant anywhere (BL by default, or a group with no Y).
export function isReadOnlyRole(role: Role | undefined) {
  if (runtimeSystemAdmin) return false;
  if (runtimePerms) return !Object.values(runtimePerms).some((p) => p === "Y");
  return role === "BL";
}
