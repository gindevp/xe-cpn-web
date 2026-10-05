import { apiRequest } from "./client";

export type InventoryCheckRow = {
  id: number;
  officeCode: string;
  checkedAt: string;
  checkedByUsername: string;
  checkedByName?: string;
  systemCount: number;
  checkedCount: number;
  missingCount: number;
  systemPkgCount?: number;
  checkedPkgCount?: number;
  missingPkgCount?: number;
  extraPkgCount?: number;
  systemCodes: string[];
  scannedCodes: string[];
  missingCodes: string[];
  status: InventoryCheckStatus;
  openedAt?: string;
  openedByName?: string;
  reopenedAt?: string;
  scanCount: number;
  participants: { username: string; name?: string; staffCode?: string; scanCount: number }[];
};

export type InventoryCheckStatus = "OPEN" | "COMPLETED" | "ABANDONED";

export const INVENTORY_STATUS_LABEL: Record<InventoryCheckStatus, string> = {
  OPEN: "Đang kiểm",
  COMPLETED: "Hoàn tất",
  ABANDONED: "Bỏ dở",
};

export const INVENTORY_STATUS_CLASS: Record<InventoryCheckStatus, string> = {
  OPEN: "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50",
  COMPLETED: "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  ABANDONED: "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-100",
};

const optStr = (v: unknown) => (v != null && v !== "" ? String(v) : undefined);

function mapRow(raw: Record<string, unknown>): InventoryCheckRow {
  const at = raw.checkedAt;
  const status = String(raw.status ?? "COMPLETED") as InventoryCheckStatus;
  return {
    status: status in INVENTORY_STATUS_LABEL ? status : "COMPLETED",
    openedAt: optStr(raw.openedAt),
    openedByName: optStr(raw.openedByName),
    reopenedAt: optStr(raw.reopenedAt),
    scanCount: Number(raw.scanCount ?? 0),
    participants: Array.isArray(raw.participants)
      ? (raw.participants as Record<string, unknown>[]).map((p) => ({
          username: String(p.username ?? ""),
          name: optStr(p.name),
          staffCode: optStr(p.staffCode),
          scanCount: Number(p.scanCount ?? 0),
        }))
      : [],
    id: Number(raw.id),
    officeCode: String(raw.officeCode ?? ""),
    checkedAt: typeof at === "string" ? at : at ? new Date(at as string).toISOString() : "",
    checkedByUsername: String(raw.checkedByUsername ?? ""),
    checkedByName: raw.checkedByName != null ? String(raw.checkedByName) : undefined,
    systemCount: Number(raw.systemCount ?? 0),
    checkedCount: Number(raw.checkedCount ?? 0),
    missingCount: Number(raw.missingCount ?? 0),
    systemPkgCount: raw.systemPkgCount != null ? Number(raw.systemPkgCount) : undefined,
    checkedPkgCount: raw.checkedPkgCount != null ? Number(raw.checkedPkgCount) : undefined,
    missingPkgCount: raw.missingPkgCount != null ? Number(raw.missingPkgCount) : undefined,
    extraPkgCount: raw.extraPkgCount != null ? Number(raw.extraPkgCount) : undefined,
    systemCodes: Array.isArray(raw.systemCodes) ? (raw.systemCodes as string[]) : [],
    scannedCodes: Array.isArray(raw.scannedCodes) ? (raw.scannedCodes as string[]) : [],
    missingCodes: Array.isArray(raw.missingCodes) ? (raw.missingCodes as string[]) : [],
  };
}

export async function listInventoryChecks(officeCode?: string, includeAbandoned = false) {
  const q = new URLSearchParams();
  if (officeCode) q.set("officeCode", officeCode);
  if (includeAbandoned) q.set("includeAbandoned", "true");
  const rows = await apiRequest<Record<string, unknown>[]>(
    `/api/inventory-checks${q.toString() ? `?${q}` : ""}`,
  );
  return (Array.isArray(rows) ? rows : []).map(mapRow);
}

export type InventoryCheckPhoto = {
  id: number;
  packageSeq: number;
  photo: string;
  capturedAt: string;
  capturedBy: string;
};

export type InventoryOrderScan = {
  count: number;
  lastScannedAt?: string;
  lastScannedBy?: string;
  lastScannedByCode?: string;
  lastScannedByName?: string;
};

/** Theo mã đơn (viết hoa): số ảnh kiện + lần quét cuối của một lần kiểm (không tải nội dung ảnh). */
export async function fetchInventoryCheckScans(
  checkId: number,
): Promise<Record<string, InventoryOrderScan>> {
  const rows = await apiRequest<
    {
      orderCode: string;
      count: number;
      lastScannedAt?: string | null;
      lastScannedBy?: string | null;
      lastScannedByCode?: string | null;
      lastScannedByName?: string | null;
    }[]
  >(`/api/inventory-checks/${checkId}/photo-orders`);
  const out: Record<string, InventoryOrderScan> = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    out[r.orderCode.toUpperCase()] = {
      count: Number(r.count),
      lastScannedAt: r.lastScannedAt ?? undefined,
      lastScannedBy: r.lastScannedBy ?? undefined,
      lastScannedByCode: r.lastScannedByCode ?? undefined,
      lastScannedByName: r.lastScannedByName ?? undefined,
    };
  }
  return out;
}

/** Ảnh đầu tiên của từng đơn (mã viết hoa → data URL); tối đa 100 mã một lần. */
export async function fetchInventoryCheckThumbnails(
  checkId: number,
  orderCodes: string[],
): Promise<Record<string, string>> {
  if (!orderCodes.length) return {};
  const q = new URLSearchParams();
  for (const c of orderCodes) q.append("codes", c);
  const rows = await apiRequest<{ orderCode: string; photo: string }[]>(
    `/api/inventory-checks/${checkId}/thumbnails?${q}`,
  );
  const out: Record<string, string> = {};
  for (const r of Array.isArray(rows) ? rows : []) out[r.orderCode.toUpperCase()] = r.photo;
  return out;
}

export async function fetchInventoryCheckPhotos(checkId: number, orderCode: string) {
  const rows = await apiRequest<InventoryCheckPhoto[]>(
    `/api/inventory-checks/${checkId}/photos?orderCode=${encodeURIComponent(orderCode)}`,
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createInventoryCheck(body: {
  officeCode: string;
  systemCodes: string[];
  scannedCodes: string[];
  missingCodes: string[];
  systemPkgCount?: number;
  checkedPkgCount?: number;
  missingPkgCount?: number;
  extraPkgCount?: number;
  checkedAt?: string;
}) {
  return mapRow(
    await apiRequest<Record<string, unknown>>("/api/inventory-checks", {
      method: "POST",
      body,
    }),
  );
}
