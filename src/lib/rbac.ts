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
  | "ton-kho";

// Y = read+write, R = read-only, N = no access
type Perm = "Y" | "R" | "N";

const MATRIX: Record<ScreenKey, Partial<Record<Role, Perm>>> = {
  dashboard: { BL: "R", DH: "Y", TCN: "Y", KT: "R", AD: "Y" },
  "van-don": { Q: "Y", TCN: "Y", DH: "Y", KT: "R", BL: "R", BX: "R", G: "R", AD: "Y" },

  "nhap-kho-luan-chuyen": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", BX: "Y", KT: "R", BL: "R", AD: "Y" },
  "giao-thanh-cong": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", KT: "R", BL: "R", AD: "Y" },
  "cho-giao-lai": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", KT: "R", BL: "R", AD: "Y" },
  "cho-ban-giao": { Q: "Y", TCN: "Y", DH: "Y", G: "Y", KT: "R", BL: "R", AD: "Y" },
  "don-huy": { Q: "R", TCN: "Y", DH: "Y", KT: "R", BL: "R", AD: "Y" },
  "ngoai-le": { Q: "Y", TCN: "Y", DH: "Y", G: "R", KT: "R", BL: "R", AD: "Y" },
  "phieu-thu": { Q: "Y", TCN: "Y", DH: "Y", KT: "Y", BL: "R", AD: "Y" },
  "danh-sach-phieu-thu": { Q: "R", TCN: "Y", DH: "Y", KT: "Y", BL: "R", AD: "Y" },
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
  "pod-quay": { Q: "Y", TCN: "Y", AD: "Y" },
  "giao-tan-nha": { G: "Y", TCN: "R", DH: "R", AD: "Y" },
  "day-ship": { Q: "Y", DH: "Y", AD: "Y" },
  "bao-cao-thu": { KT: "Y", Q: "R", TCN: "R", DH: "R", BL: "R", AD: "Y" },
  "bang-gia": { AD: "Y", TCN: "R", DH: "R", BL: "R" },
  master: { DH: "Y", AD: "Y" },
  "tai-khoan": { AD: "Y" },
  "tich-hop": { AD: "Y" },
  "phu-phi": { AD: "Y", DH: "R" },
  "ton-kho": { Q: "Y", TCN: "Y", DH: "Y", BX: "R", KT: "R", BL: "R", AD: "Y" },
  "kiem-ke": { Q: "Y", TCN: "Y", DH: "Y", BX: "R", KT: "R", BL: "R", AD: "Y" },
  "bao-cao-gio": { Q: "R", TCN: "Y", DH: "Y", BX: "R", KT: "R", BL: "R", AD: "Y" },
};

export function can(role: Role | undefined, screen: ScreenKey): Perm {
  if (!role) return "N";
  return MATRIX[screen]?.[role] ?? "N";
}

export function canRead(role: Role | undefined, screen: ScreenKey) {
  const p = can(role, screen);
  return p === "Y" || p === "R";
}

export function canWrite(role: Role | undefined, screen: ScreenKey) {
  return can(role, screen) === "Y";
}

// BL is read-only everywhere; used for hiding write buttons globally.
export function isReadOnlyRole(role: Role | undefined) {
  return role === "BL";
}
