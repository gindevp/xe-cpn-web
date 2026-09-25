import { apiRequest } from "./client";
import { asArray, fetchBranches } from "./domain-api";
import type { ReceiptRec, DayClosure, SurchargeConfig, Integrations, PricingRule, CodFeeTier, DoorFeeRule } from "../store";
import { DEFAULT_SURCHARGES, DEFAULT_COD_TIERS } from "../store";
export type ReceiptDTO = {
  id?: number;
  receiptCode: string;
  payerName: string;
  payerCode?: string;
  totalAmount: number;
  createdAt: string;
  createdByUsername: string;
  officeCode?: string;
  lines?: Array<{ orderCode?: string; amountCollected?: number }>;
  confirmedAt?: string | null;
  confirmedByUsername?: string | null;
  customerPaidAt?: string | null;
  confirmProofImage?: string | null;
};

export type DayClosureDTO = {
  id?: number;
  businessDate: string;
  status: "OPEN" | "CLOSED" | "REOPENED" | string;
  officeCode?: string;
  confirmedByUsername?: string;
  confirmedAt?: string;
  reopenedByUsername?: string;
  reopenedAt?: string;
};

export function mapReceipt(dto: ReceiptDTO): ReceiptRec {
  const createdAt =
    typeof dto.createdAt === "string" ? dto.createdAt : new Date(dto.createdAt).toISOString();
  const customerPaidAt = dto.customerPaidAt
    ? typeof dto.customerPaidAt === "string"
      ? dto.customerPaidAt
      : new Date(dto.customerPaidAt).toISOString()
    : createdAt;
  const lineAmounts: Record<string, number> = {};
  const orderCodes: string[] = [];
  for (const l of dto.lines ?? []) {
    const code = l.orderCode?.trim();
    if (!code) continue;
    orderCodes.push(code);
    if (l.amountCollected != null && Number.isFinite(Number(l.amountCollected))) {
      lineAmounts[code] = Number(l.amountCollected);
    }
  }
  return {
    code: dto.receiptCode,
    createdBy: dto.createdByUsername,
    createdAt,
    customerPaidAt,
    payer: dto.payerName,
    payerCode: dto.payerCode,
    total: Number(dto.totalAmount ?? 0),
    orderCodes,
    lineAmounts: Object.keys(lineAmounts).length ? lineAmounts : undefined,
    office: dto.officeCode,
    confirmedAt: dto.confirmedAt
      ? typeof dto.confirmedAt === "string"
        ? dto.confirmedAt
        : new Date(dto.confirmedAt).toISOString()
      : undefined,
    confirmedBy: dto.confirmedByUsername ?? undefined,
    confirmProofImage: dto.confirmProofImage?.trim() || undefined,
  };
}

export function mapDayClosure(dto: DayClosureDTO): DayClosure {
  return {
    office: dto.officeCode ?? "",
    date: dto.businessDate,
    confirmedBy: dto.confirmedByUsername ?? "",
    confirmedAt: dto.confirmedAt ?? new Date().toISOString(),
    reopenedBy: dto.reopenedByUsername,
    reopenedAt: dto.reopenedAt,
  };
}

export async function listReceiptCandidates(officeCode?: string, keyword?: string) {
  const q = new URLSearchParams();
  if (officeCode) q.set("officeCode", officeCode);
  if (keyword) q.set("keyword", keyword);
  return apiRequest<Array<{
    orderCode: string;
    receiverName: string;
    receiverPhone: string;
    fareAmount: number;
    paidAmount: number;
    dueAmount: number;
    status: string;
    fromOfficeCode?: string;
    debtOwnerUsername?: string;
    portion?: ReceiptPortion;
    collectedAt?: string;
  }>>(`/api/receipts/candidates?${q}`);
}

/** Phần tiền trên phiếu thu: VP gửi giữ / thu lúc giao (kèm COD). */
export type ReceiptPortion = "SENDER" | "DELIVERY";

export async function listReceipts(params?: { officeCode?: string; size?: number }) {
  const q = new URLSearchParams();
  if (params?.officeCode) q.set("officeCode", params.officeCode);
  q.set("size", String(params?.size ?? 100));
  const page = await apiRequest<{ content: ReceiptDTO[] }>(`/api/receipts?${q}`);
  return (page.content ?? []).map(mapReceipt);
}

export async function createReceipt(body: {
  payerName: string;
  payerCode?: string;
  officeCode?: string;
  lines: Array<{ orderCode: string; amountCollected: number; portion?: ReceiptPortion }>;
}) {
  return mapReceipt(await apiRequest<ReceiptDTO>("/api/receipts", { method: "POST", body }));
}

export async function confirmReceipt(code: string, proofImage: string) {
  return mapReceipt(
    await apiRequest<ReceiptDTO>(`/api/receipts/${encodeURIComponent(code)}/confirm`, {
      method: "POST",
      body: { proofImage },
    }),
  );
}

export async function unconfirmReceipt(code: string) {
  return mapReceipt(
    await apiRequest<ReceiptDTO>(`/api/receipts/${encodeURIComponent(code)}/unconfirm`, {
      method: "POST",
    }),
  );
}

export async function getDayClosure(officeCode: string, businessDate: string) {
  const dto = await apiRequest<DayClosureDTO | null>(
    `/api/day-closures?officeCode=${encodeURIComponent(officeCode)}&businessDate=${encodeURIComponent(businessDate)}`,
  );
  return dto ? mapDayClosure(dto) : null;
}

export async function closeDayApi(officeCode: string, businessDate: string) {
  return mapDayClosure(
    await apiRequest<DayClosureDTO>("/api/day-closures", {
      method: "POST",
      body: { officeCode, businessDate },
    }),
  );
}

export async function reopenDayApi(officeCode: string, businessDate: string) {
  return mapDayClosure(
    await apiRequest<DayClosureDTO>("/api/day-closures/reopen", {
      method: "POST",
      body: { officeCode, businessDate },
    }),
  );
}

type SurchargeDTO = {
  homeDeliveryEnabled?: boolean;
  defaultHomeDeliveryAmount?: number;
  codEnabled?: boolean;
  codPercent?: number;
  codMinFee?: number;
  codTiersJson?: string | null;
  storageEnabled?: boolean;
  storageFreeDays?: number;
  storageFeePerDay?: number;
  insuranceEnabled?: boolean;
  insuranceThreshold?: number;
  insurancePercentUnder?: number;
  insurancePercentOver?: number;
  refundEnabled?: boolean;
  refundPercent?: number;
  doorOverKgStep?: number;
  doorOverKgFee?: number;
  doorOverKmStep?: number;
  doorOverKmFee?: number;
  doorDeliveryOverKgStep?: number;
  doorDeliveryOverKgFee?: number;
  doorDeliveryOverKmStep?: number;
  doorDeliveryOverKmFee?: number;
  updatedAt?: string;
};

function parseCodTiers(raw: string | null | undefined): CodFeeTier[] {
  if (!raw || !String(raw).trim()) return DEFAULT_COD_TIERS.map((t) => ({ ...t }));
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr) || !arr.length) return DEFAULT_COD_TIERS.map((t) => ({ ...t }));
    return arr.map((row: Record<string, unknown>) => ({
      minAmount: Number(row?.minAmount ?? 0),
      maxAmount: row?.maxAmount == null || row?.maxAmount === "" ? null : Number(row.maxAmount),
      feeAmount: row?.feeAmount == null || row?.feeAmount === "" ? null : Number(row.feeAmount),
      feePercent: row?.feePercent == null || row?.feePercent === "" ? null : Number(row.feePercent),
    }));
  } catch {
    return DEFAULT_COD_TIERS.map((t) => ({ ...t }));
  }
}

export function mapSurcharge(dto: SurchargeDTO | null | undefined): SurchargeConfig {
  if (!dto) return { ...DEFAULT_SURCHARGES, cod: { ...DEFAULT_SURCHARGES.cod, tiers: DEFAULT_COD_TIERS.map((t) => ({ ...t })) } };
  return {
    homeDelivery: {
      enabled: !!dto.homeDeliveryEnabled,
      amount: Number(dto.defaultHomeDeliveryAmount ?? 0),
    },
    cod: {
      enabled: !!dto.codEnabled,
      percent: Number(dto.codPercent ?? 0),
      minFee: Number(dto.codMinFee ?? 0),
      tiers: parseCodTiers(dto.codTiersJson),
    },
    storage: {
      enabled: !!dto.storageEnabled,
      freeDays: Number(dto.storageFreeDays ?? 0),
      feePerDay: Number(dto.storageFeePerDay ?? 0),
    },
    insurance: {
      enabled: !!dto.insuranceEnabled,
      threshold: Number(dto.insuranceThreshold ?? 0),
      percentUnder: Number(dto.insurancePercentUnder ?? 0),
      percentOver: Number(dto.insurancePercentOver ?? 0),
    },
    refund: {
      enabled: !!dto.refundEnabled,
      percent: Number(dto.refundPercent ?? 0),
    },
    doorOverage: {
      pickup: {
        kgStep: Number(dto.doorOverKgStep ?? 0),
        kgFee: Number(dto.doorOverKgFee ?? 0),
        kmStep: Number(dto.doorOverKmStep ?? 0),
        kmFee: Number(dto.doorOverKmFee ?? 0),
      },
      delivery: {
        kgStep: Number(dto.doorDeliveryOverKgStep ?? dto.doorOverKgStep ?? 0),
        kgFee: Number(dto.doorDeliveryOverKgFee ?? dto.doorOverKgFee ?? 0),
        kmStep: Number(dto.doorDeliveryOverKmStep ?? dto.doorOverKmStep ?? 0),
        kmFee: Number(dto.doorDeliveryOverKmFee ?? dto.doorOverKmFee ?? 0),
      },
    },
    updatedAt: dto.updatedAt,
  };
}

export function surchargeToDto(cfg: SurchargeConfig): SurchargeDTO {
  return {
    homeDeliveryEnabled: cfg.homeDelivery.enabled,
    defaultHomeDeliveryAmount: cfg.homeDelivery.amount,
    codEnabled: cfg.cod.enabled,
    codPercent: cfg.cod.percent,
    codMinFee: cfg.cod.minFee,
    codTiersJson: JSON.stringify(cfg.cod.tiers ?? []),
    storageEnabled: cfg.storage.enabled,
    storageFreeDays: cfg.storage.freeDays,
    storageFeePerDay: cfg.storage.feePerDay,
    insuranceEnabled: cfg.insurance.enabled,
    insuranceThreshold: cfg.insurance.threshold,
    insurancePercentUnder: cfg.insurance.percentUnder,
    insurancePercentOver: cfg.insurance.percentOver,
    refundEnabled: cfg.refund.enabled,
    refundPercent: cfg.refund.percent,
    doorOverKgStep: cfg.doorOverage?.pickup?.kgStep ?? 0,
    doorOverKgFee: cfg.doorOverage?.pickup?.kgFee ?? 0,
    doorOverKmStep: cfg.doorOverage?.pickup?.kmStep ?? 0,
    doorOverKmFee: cfg.doorOverage?.pickup?.kmFee ?? 0,
    doorDeliveryOverKgStep: cfg.doorOverage?.delivery?.kgStep ?? 0,
    doorDeliveryOverKgFee: cfg.doorOverage?.delivery?.kgFee ?? 0,
    doorDeliveryOverKmStep: cfg.doorOverage?.delivery?.kmStep ?? 0,
    doorDeliveryOverKmFee: cfg.doorOverage?.delivery?.kmFee ?? 0,
  };
}

export async function fetchSurchargePolicy() {
  return mapSurcharge(await apiRequest<SurchargeDTO>("/api/surcharge-policy", { auth: false }));
}

export async function putSurchargePolicy(cfg: SurchargeConfig) {
  return mapSurcharge(await apiRequest<SurchargeDTO>("/api/surcharge-policy", { method: "PUT", body: surchargeToDto(cfg) }));
}

type IntegrationDTO = {
  ahamoveApiKey?: string;
  ahamoveMobile?: string;
  ahamoveTokenFetchedAt?: string;
  grabToken?: string;
  xanhsmToken?: string;
  distanceApiToken?: string;
  goongMapTilesKey?: string;
  mapProvider?: string;
  telegramToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  updatedAt?: string;
};

export function mapIntegrations(dto: IntegrationDTO | null | undefined): Integrations {
  if (!dto) return {};
  const provider = (dto.mapProvider ?? "OSM").toUpperCase();
  return {
    ahamoveApiKey: dto.ahamoveApiKey,
    ahamoveMobile: dto.ahamoveMobile,
    ahamoveTokenFetchedAt: dto.ahamoveTokenFetchedAt,
    grabToken: dto.grabToken,
    xanhsmToken: dto.xanhsmToken,
    goongToken: dto.distanceApiToken,
    goongMapTilesKey: dto.goongMapTilesKey,
    mapProvider: provider === "GOONG" ? "GOONG" : "OSM",
    telegramToken: dto.telegramToken,
    telegramChatId: dto.telegramChatId,
    webhookUrl: dto.webhookUrl,
    webhookSecret: dto.webhookSecret,
    updatedAt: dto.updatedAt,
  };
}

export async function fetchIntegrationConfig() {
  return mapIntegrations(await apiRequest<IntegrationDTO>("/api/integration-config"));
}

export async function putIntegrationConfig(i: Integrations) {
  // Chỉ gửi field có giá trị — tránh "" xóa secret đã lưu trên BE.
  const body: Record<string, string> = {};
  if (i.ahamoveApiKey?.trim()) body.ahamoveApiKey = i.ahamoveApiKey.trim();
  if (i.ahamoveMobile?.trim()) body.ahamoveMobile = i.ahamoveMobile.trim();
  if (i.grabToken?.trim()) body.grabToken = i.grabToken.trim();
  if (i.xanhsmToken?.trim()) body.xanhsmToken = i.xanhsmToken.trim();
  if (i.goongToken?.trim()) body.distanceApiToken = i.goongToken.trim();
  if (i.goongMapTilesKey?.trim()) body.goongMapTilesKey = i.goongMapTilesKey.trim();
  if (i.mapProvider === "GOONG" || i.mapProvider === "OSM") body.mapProvider = i.mapProvider;
  if (i.telegramToken?.trim()) body.telegramToken = i.telegramToken.trim();
  if (i.telegramChatId?.trim()) body.telegramChatId = i.telegramChatId.trim();
  if (i.webhookUrl?.trim()) body.webhookUrl = i.webhookUrl.trim();
  if (i.webhookSecret?.trim()) body.webhookSecret = i.webhookSecret.trim();
  return mapIntegrations(
    await apiRequest<IntegrationDTO>("/api/integration-config", {
      method: "PUT",
      body,
    }),
  );
}

/** Chính sách bắt buộc cập nhật app mobile — app đọc bản public, admin sửa ở màn Tích hợp. */
export type MobileAppVersionPolicy = {
  minimumVersion: string;
  minimumAndroidVersionCode?: number | null;
  mandatoryUpdateEnabled: boolean;
};

export async function fetchMobileAppVersion() {
  const dto = await apiRequest<Partial<MobileAppVersionPolicy>>("/api/mobile/app-version");
  return {
    minimumVersion: dto?.minimumVersion ?? "1.0.0",
    minimumAndroidVersionCode: dto?.minimumAndroidVersionCode ?? null,
    mandatoryUpdateEnabled: dto?.mandatoryUpdateEnabled !== false,
  } satisfies MobileAppVersionPolicy;
}

export async function putMobileAppVersion(p: MobileAppVersionPolicy) {
  return apiRequest<MobileAppVersionPolicy>("/api/admin/mobile-app-version", {
    method: "PUT",
    body: {
      minimumVersion: p.minimumVersion,
      minimumAndroidVersionCode: p.minimumAndroidVersionCode ?? null,
      mandatoryUpdateEnabled: p.mandatoryUpdateEnabled,
    },
  });
}

/** Chính sách bảo trì — public GET; admin PUT ở màn Bảo trì. */
export type MaintenancePolicy = {
  enabled: boolean;
  blockAll: boolean;
  blockAppStaff: boolean;
  blockAppCustomer: boolean;
  blockWebStaff: boolean;
  blockWebCustomer: boolean;
  title: string;
  message: string;
  imageUrl: string | null;
};

export type MaintenanceChannel = "APP_STAFF" | "APP_CUSTOMER" | "WEB_STAFF" | "WEB_CUSTOMER";

export function emptyMaintenancePolicy(): MaintenancePolicy {
  return {
    enabled: false,
    blockAll: false,
    blockAppStaff: false,
    blockAppCustomer: false,
    blockWebStaff: false,
    blockWebCustomer: false,
    title: "Hệ thống đang bảo trì",
    message: "Vui lòng quay lại sau. Xin cảm ơn.",
    imageUrl: null,
  };
}

export function mapMaintenancePolicy(dto?: Partial<MaintenancePolicy> | null): MaintenancePolicy {
  const base = emptyMaintenancePolicy();
  if (!dto) return base;
  return {
    enabled: dto.enabled === true,
    blockAll: dto.blockAll === true,
    blockAppStaff: dto.blockAppStaff === true,
    blockAppCustomer: dto.blockAppCustomer === true,
    blockWebStaff: dto.blockWebStaff === true,
    blockWebCustomer: dto.blockWebCustomer === true,
    title: (dto.title ?? base.title).trim() || base.title,
    message: (dto.message ?? base.message).trim() || base.message,
    imageUrl: dto.imageUrl?.trim() ? dto.imageUrl.trim() : null,
  };
}

/** Kênh có bị chặn không (enabled + all hoặc flag kênh). */
export function isMaintenanceChannelBlocked(
  policy: MaintenancePolicy | null | undefined,
  channel: MaintenanceChannel,
): boolean {
  if (!policy?.enabled) return false;
  if (policy.blockAll) return true;
  switch (channel) {
    case "APP_STAFF":
      return policy.blockAppStaff;
    case "APP_CUSTOMER":
      return policy.blockAppCustomer;
    case "WEB_STAFF":
      return policy.blockWebStaff;
    case "WEB_CUSTOMER":
      return policy.blockWebCustomer;
    default:
      return false;
  }
}

export type SessionPolicy = {
  enabled: boolean;
  logoutTime: string;
  timeZone?: string;
};

export async function fetchSessionPolicy() {
  const dto = await apiRequest<Partial<SessionPolicy>>("/api/session-policy", { auth: false });
  return {
    enabled: dto.enabled !== false,
    logoutTime: dto.logoutTime?.trim() || "21:00",
    timeZone: dto.timeZone || "Asia/Ho_Chi_Minh",
  };
}

export async function putSessionPolicy(p: SessionPolicy) {
  const dto = await apiRequest<Partial<SessionPolicy>>("/api/admin/session-policy", {
    method: "PUT",
    body: { enabled: p.enabled, logoutTime: p.logoutTime },
  });
  return {
    enabled: dto.enabled !== false,
    logoutTime: dto.logoutTime?.trim() || "21:00",
    timeZone: dto.timeZone || "Asia/Ho_Chi_Minh",
  };
}

export async function fetchMaintenancePolicy() {
  const dto = await apiRequest<Partial<MaintenancePolicy>>("/api/maintenance", { auth: false });
  return mapMaintenancePolicy(dto);
}

export async function putMaintenancePolicy(p: MaintenancePolicy) {
  return mapMaintenancePolicy(
    await apiRequest<Partial<MaintenancePolicy>>("/api/admin/maintenance", {
      method: "PUT",
      body: {
        enabled: p.enabled,
        blockAll: p.blockAll,
        blockAppStaff: p.blockAppStaff,
        blockAppCustomer: p.blockAppCustomer,
        blockWebStaff: p.blockWebStaff,
        blockWebCustomer: p.blockWebCustomer,
        title: p.title,
        message: p.message,
        imageUrl: p.imageUrl,
      },
    }),
  );
}

export function mapPricingRuleDto(r: any, i = 0): PricingRule {
  return {
    id: String(r.id ?? `PR-${i}`),
    route:
      r.branch?.name ||
      r.branch?.code ||
      r.route?.code ||
      r.route?.name ||
      r.routeCode ||
      r.routeName ||
      r.route ||
      "",
    tier: r.tierLabel || `${r.minKg ?? 0}-${r.maxKg ?? 0}kg`,
    minKg: Number(r.minKg ?? 0),
    maxKg: Number(r.maxKg ?? 0),
    unit: Number(r.unitPrice ?? r.unit ?? 0),
    surcharge: Number(r.surchargeAmount ?? r.surcharge ?? 0),
    dimDivisor: r.dimDivisor != null ? Number(r.dimDivisor) : 6000,
    effectiveFrom: r.effectiveFrom || new Date().toISOString(),
    effectiveTo: r.effectiveTo,
    kmMin: r.kmMin != null ? Number(r.kmMin) : undefined,
    kmRate: r.kmRate != null ? Number(r.kmRate) : undefined,
    stepG: r.stepGram != null ? Number(r.stepGram) : 0,
    addFee: r.addFeeAmount != null ? Number(r.addFeeAmount) : 0,
  };
}

export async function fetchPricingRules() {
  const data = await apiRequest<any>("/api/pricing-rules?size=500", { auth: false });
  const rows = Array.isArray(data) ? data : data?.content ?? [];
  return rows.map((r: any, i: number) => mapPricingRuleDto(r, i));
}

/** Avoid re-fetching branches on every pricing save (was making create feel slow). */
let branchesCache: { at: number; rows: Array<{ id: number; code: string; name: string }> } | null = null;

async function getBranchesCached(): Promise<Array<{ id: number; code: string; name: string }>> {
  if (branchesCache && Date.now() - branchesCache.at < 60_000) {
    return branchesCache.rows;
  }
  const rows = asArray(await fetchBranches(false)) as Array<{ id: number; code: string; name: string }>;
  branchesCache = { at: Date.now(), rows };
  return rows;
}

export function invalidatePricingBranchesCache() {
  branchesCache = null;
}

export async function fetchDashboardReport(officeCode?: string, date?: string) {
  const q = new URLSearchParams();
  if (officeCode) q.set("officeCode", officeCode);
  if (date) q.set("date", date);
  const qs = q.toString();
  return apiRequest<Record<string, number>>(`/api/reports/dashboard${qs ? `?${qs}` : ""}`);
}

function persistedId(id: string | undefined): number | null {
  if (id && /^\d+$/.test(id)) return Number(id);
  return null;
}

function toInstant(v?: string) {
  if (!v) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00.000Z`;
  return v;
}

export async function savePricingRule(
  rule: PricingRule,
  opts?: { branches?: Array<{ id: number; code: string; name: string }> },
): Promise<PricingRule> {
  const branches = opts?.branches ?? (await getBranchesCached());
  const branch = branches.find((b) => b.name === rule.route || b.code === rule.route);
  if (!branch?.id) {
    throw new Error(`Không tìm thấy tuyến «${rule.route}» trên server. Không lưu được bảng giá.`);
  }
  const id = persistedId(rule.id);
  const body: Record<string, unknown> = {
    ruleCode: id != null ? `PR${id}`.slice(0, 40) : `PR${Date.now()}${Math.random().toString(36).slice(2, 6)}`.slice(0, 40),
    tierLabel: (rule.tier || `${rule.minKg}-${rule.maxKg}kg`).slice(0, 50),
    minKg: rule.minKg,
    maxKg: rule.maxKg,
    unitPrice: rule.unit,
    surchargeAmount: rule.surcharge ?? 0,
    dimDivisor: rule.dimDivisor ?? 6000,
    kmMin: rule.kmMin ?? 2,
    kmRate: rule.kmRate ?? 5000,
    stepGram: rule.stepG ?? 0,
    addFeeAmount: rule.addFee ?? 0,
    effectiveFrom: toInstant(rule.effectiveFrom),
    effectiveTo: rule.effectiveTo ? toInstant(rule.effectiveTo) : undefined,
    active: true,
    branch: { id: branch.id },
  };
  const res =
    id != null
      ? await apiRequest(`/api/pricing-rules/${id}`, { method: "PUT", body: { ...body, id } })
      : await apiRequest("/api/pricing-rules", { method: "POST", body });
  const mapped = mapPricingRuleDto(res);
  // API may omit branch name on write response — keep UI route label
  if (!mapped.route) mapped.route = rule.route;
  return mapped;
}

export async function deletePricingRule(id: string) {
  const num = persistedId(id);
  if (num == null) return;
  await apiRequest(`/api/pricing-rules/${num}`, { method: "DELETE" });
}

/**
 * Copy all weight bands from one branch (tuyến) onto other branches.
 * Runs deletes (optional) then creates in parallel; one final list refresh is caller's job or return here.
 */
export async function copyPricingToRoutes(opts: {
  sourceRoute: string;
  targetRoutes: string[];
  rules: PricingRule[];
  replaceExisting: boolean;
}): Promise<{ copiedTo: string[]; skipped: string[] }> {
  const sourceRules = opts.rules
    .filter((r) => r.route === opts.sourceRoute)
    .slice()
    .sort((a, b) => a.minKg - b.minKg);
  if (!sourceRules.length) {
    throw new Error(`Tuyến «${opts.sourceRoute}» chưa có mức cước để copy`);
  }
  const targets = [...new Set(opts.targetRoutes.map((t) => t.trim()).filter(Boolean))].filter(
    (t) => t !== opts.sourceRoute,
  );
  if (!targets.length) {
    throw new Error("Chọn ít nhất một tuyến đích");
  }

  const branches = await getBranchesCached();
  const copiedTo: string[] = [];
  const skipped: string[] = [];

  await Promise.all(
    targets.map(async (target) => {
      const branch = branches.find((b) => b.name === target || b.code === target);
      if (!branch?.id) {
        skipped.push(target);
        return;
      }
      const existing = opts.rules.filter((r) => r.route === target);
      if (existing.length && !opts.replaceExisting) {
        skipped.push(target);
        return;
      }
      if (existing.length && opts.replaceExisting) {
        await Promise.all(existing.map((r) => deletePricingRule(r.id)));
      }
      // Sequential within route so ruleCode timestamps stay unique; parallel across routes above
      for (const src of sourceRules) {
        await savePricingRule(
          {
            ...src,
            id: `PR-COPY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            route: target,
            effectiveFrom: new Date().toISOString(),
            effectiveTo: undefined,
          },
          { branches },
        );
      }
      copiedTo.push(target);
    }),
  );

  return { copiedTo, skipped };
}

export async function fetchDoorFeeRules() {
  const data = await apiRequest<any>("/api/door-fee-rules?size=200", { auth: false });
  const rows = Array.isArray(data) ? data : data?.content ?? [];
  return rows.map((r: any) => ({
    id: String(r.id),
    kind: (r.kind === "DELIVERY" ? "DELIVERY" : "PICKUP") as "PICKUP" | "DELIVERY",
    minKg: Number(r.minKg ?? 0),
    maxKg: Number(r.maxKg ?? 0),
    minKm: Number(r.minKm ?? 0),
    maxKm: Number(r.maxKm ?? 0),
    fee: Number(r.feeAmount ?? r.fee ?? 0),
  }));
}

export async function saveDoorFeeRule(rule: { id: string; kind: "PICKUP" | "DELIVERY"; minKg: number; maxKg: number; minKm: number; maxKm: number; fee: number }) {
  const body = {
    kind: rule.kind,
    minKg: rule.minKg,
    maxKg: rule.maxKg,
    minKm: rule.minKm,
    maxKm: rule.maxKm,
    feeAmount: rule.fee,
    active: true,
  };
  const id = persistedId(rule.id);
  if (id != null) {
    return apiRequest(`/api/door-fee-rules/${id}`, { method: "PUT", body: { ...body, id } });
  }
  return apiRequest("/api/door-fee-rules", { method: "POST", body });
}

export async function persistDoorFeeRules(rows: DoorFeeRule[], previous: DoorFeeRule[]) {
  const removed = previous.filter((p) => !rows.some((r) => r.id === p.id));
  for (const r of removed) await deleteDoorFeeRule(r.id);
  for (const r of rows) await saveDoorFeeRule(r);
  return fetchDoorFeeRules();
}

export async function deleteDoorFeeRule(id: string) {
  const num = persistedId(id);
  if (num == null) return;
  await apiRequest(`/api/door-fee-rules/${num}`, { method: "DELETE" });
}

export async function fetchProductPriceRules() {
  const data = await apiRequest<any>("/api/product-price-rules?size=200", { auth: false });
  const rows = Array.isArray(data) ? data : data?.content ?? [];
  return rows.map((r: any) => ({
    id: String(r.id),
    group: r.groupName ?? r.group ?? "",
    name: r.productName ?? r.name ?? "",
    currentPrice: Number(r.currentPrice ?? 0),
    price: Number(r.appliedPrice ?? r.price ?? 0),
    note: r.note,
  }));
}

export async function saveProductPriceRule(rule: { id: string; group: string; name: string; currentPrice: number; price: number; note?: string }) {
  const body = {
    groupName: (rule.group || "").trim().slice(0, 100),
    productName: (rule.name || "Hàng").slice(0, 150),
    currentPrice: rule.currentPrice ?? 0,
    appliedPrice: rule.price ?? 0,
    note: rule.note,
    active: true,
  };
  const id = persistedId(rule.id);
  if (id != null) {
    return apiRequest(`/api/product-price-rules/${id}`, { method: "PUT", body: { ...body, id } });
  }
  return apiRequest("/api/product-price-rules", { method: "POST", body });
}

export async function deleteProductPriceRule(id: string) {
  const num = persistedId(id);
  if (num == null) return;
  await apiRequest(`/api/product-price-rules/${num}`, { method: "DELETE" });
}

export async function testIntegrationConfig() {
  return apiRequest<Record<string, unknown>>("/api/integration-config/test", { method: "POST", body: {} });
}

/** Thử đổi API key + SĐT → Bearer token Ahamove. */
export async function testAhamoveApiKey(body?: { ahamoveApiKey?: string; ahamoveMobile?: string }) {
  return apiRequest<{
    ok?: boolean;
    ahamoveTokenOk?: boolean;
    ahamoveError?: string;
    ahamoveTokenFetchedAt?: string;
    message?: string;
  }>("/api/integration-config/test-ahamove", {
    method: "POST",
    body: body ?? {},
  });
}

export async function fetchCollectionsReport(officeCode?: string, date?: string) {
  const q = new URLSearchParams();
  if (officeCode) q.set("officeCode", officeCode);
  if (date) q.set("date", date);
  return apiRequest<Record<string, unknown>>(`/api/reports/collections?${q}`);
}
