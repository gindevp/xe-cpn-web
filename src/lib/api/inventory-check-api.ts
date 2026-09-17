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
};

function mapRow(raw: Record<string, unknown>): InventoryCheckRow {
  const at = raw.checkedAt;
  return {
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

export async function listInventoryChecks(officeCode?: string) {
  const q = new URLSearchParams();
  if (officeCode) q.set("officeCode", officeCode);
  const rows = await apiRequest<Record<string, unknown>[]>(
    `/api/inventory-checks${q.toString() ? `?${q}` : ""}`,
  );
  return (Array.isArray(rows) ? rows : []).map(mapRow);
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
