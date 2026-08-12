import { apiRequest } from "./client";
import type { ReceiptRec, DayClosure, SurchargeConfig, Integrations, PricingRule } from "../store";

const FALLBACK_SURCHARGE: SurchargeConfig = {
  homeDelivery: { enabled: true, amount: 20000 },
  cod: { enabled: false, percent: 1, minFee: 10000 },
  storage: { enabled: true, freeDays: 3, feePerDay: 10000 },
  insurance: { enabled: true, threshold: 10000000, percentUnder: 1.5, percentOver: 1 },
  refund: { enabled: false, percent: 50 },
};
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
  return {
    code: dto.receiptCode,
    createdBy: dto.createdByUsername,
    createdAt: typeof dto.createdAt === "string" ? dto.createdAt : new Date(dto.createdAt).toISOString(),
    payer: dto.payerName,
    payerCode: dto.payerCode,
    total: Number(dto.totalAmount ?? 0),
    orderCodes: (dto.lines ?? []).map((l) => l.orderCode!).filter(Boolean),
    office: dto.officeCode,
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
  }>>(`/api/receipts/candidates?${q}`);
}

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
  lines: Array<{ orderCode: string; amountCollected: number }>;
}) {
  return mapReceipt(await apiRequest<ReceiptDTO>("/api/receipts", { method: "POST", body }));
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
  storageEnabled?: boolean;
  storageFreeDays?: number;
  storageFeePerDay?: number;
  insuranceEnabled?: boolean;
  insuranceThreshold?: number;
  insurancePercentUnder?: number;
  insurancePercentOver?: number;
  refundEnabled?: boolean;
  refundPercent?: number;
  updatedAt?: string;
};

export function mapSurcharge(dto: SurchargeDTO | null | undefined): SurchargeConfig {
  if (!dto) return { ...FALLBACK_SURCHARGE };
  return {
    homeDelivery: {
      enabled: !!dto.homeDeliveryEnabled,
      amount: Number(dto.defaultHomeDeliveryAmount ?? FALLBACK_SURCHARGE.homeDelivery.amount),
    },
    cod: {
      enabled: !!dto.codEnabled,
      percent: Number(dto.codPercent ?? FALLBACK_SURCHARGE.cod.percent),
      minFee: Number(dto.codMinFee ?? FALLBACK_SURCHARGE.cod.minFee),
    },
    storage: {
      enabled: !!dto.storageEnabled,
      freeDays: Number(dto.storageFreeDays ?? FALLBACK_SURCHARGE.storage.freeDays),
      feePerDay: Number(dto.storageFeePerDay ?? FALLBACK_SURCHARGE.storage.feePerDay),
    },
    insurance: {
      enabled: !!dto.insuranceEnabled,
      threshold: Number(dto.insuranceThreshold ?? FALLBACK_SURCHARGE.insurance.threshold),
      percentUnder: Number(dto.insurancePercentUnder ?? FALLBACK_SURCHARGE.insurance.percentUnder),
      percentOver: Number(dto.insurancePercentOver ?? FALLBACK_SURCHARGE.insurance.percentOver),
    },
    refund: {
      enabled: !!dto.refundEnabled,
      percent: Number(dto.refundPercent ?? FALLBACK_SURCHARGE.refund.percent),
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
    storageEnabled: cfg.storage.enabled,
    storageFreeDays: cfg.storage.freeDays,
    storageFeePerDay: cfg.storage.feePerDay,
    insuranceEnabled: cfg.insurance.enabled,
    insuranceThreshold: cfg.insurance.threshold,
    insurancePercentUnder: cfg.insurance.percentUnder,
    insurancePercentOver: cfg.insurance.percentOver,
    refundEnabled: cfg.refund.enabled,
    refundPercent: cfg.refund.percent,
  };
}

export async function fetchSurchargePolicy() {
  return mapSurcharge(await apiRequest<SurchargeDTO>("/api/surcharge-policy"));
}

export async function putSurchargePolicy(cfg: SurchargeConfig) {
  return mapSurcharge(await apiRequest<SurchargeDTO>("/api/surcharge-policy", { method: "PUT", body: surchargeToDto(cfg) }));
}

type IntegrationDTO = {
  ahamoveToken?: string;
  grabToken?: string;
  xanhsmToken?: string;
  distanceApiToken?: string;
  telegramToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  updatedAt?: string;
};

export function mapIntegrations(dto: IntegrationDTO | null | undefined): Integrations {
  if (!dto) return {};
  return {
    ahamoveToken: dto.ahamoveToken,
    grabToken: dto.grabToken,
    xanhsmToken: dto.xanhsmToken,
    goongToken: dto.distanceApiToken,
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
  return mapIntegrations(
    await apiRequest<IntegrationDTO>("/api/integration-config", {
      method: "PUT",
      body: {
        ahamoveToken: i.ahamoveToken,
        grabToken: i.grabToken,
        xanhsmToken: i.xanhsmToken,
        distanceApiToken: i.goongToken,
        telegramToken: i.telegramToken,
        telegramChatId: i.telegramChatId,
        webhookUrl: i.webhookUrl,
        webhookSecret: i.webhookSecret,
      },
    }),
  );
}

export async function fetchPricingRules() {
  const data = await apiRequest<any>("/api/pricing-rules?size=200");
  const rows = Array.isArray(data) ? data : data?.content ?? [];
  return rows.map((r: any, i: number): PricingRule => ({
    id: String(r.id ?? `PR-${i}`),
    route: r.route?.code || r.route?.name || r.routeCode || r.routeName || r.route || "",
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
  }));
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

export async function savePricingRule(rule: PricingRule) {
  const routes = await apiRequest<any[]>("/api/routes?size=200");
  const arr = Array.isArray(routes) ? routes : (routes as any)?.content ?? [];
  const route = arr.find((r: any) => r.name === rule.route || r.code === rule.route) || arr[0];
  const body = {
    ruleCode: `PR-${rule.id}`.slice(0, 40),
    tierLabel: (rule.tier || `${rule.minKg}-${rule.maxKg}kg`).slice(0, 50),
    minKg: rule.minKg,
    maxKg: rule.maxKg,
    unitPrice: rule.unit,
    surchargeAmount: rule.surcharge ?? 0,
    dimDivisor: rule.dimDivisor ?? 6000,
    kmMin: rule.kmMin,
    kmRate: rule.kmRate,
    stepGram: rule.stepG,
    addFeeAmount: rule.addFee,
    effectiveFrom: rule.effectiveFrom || new Date().toISOString(),
    effectiveTo: rule.effectiveTo,
    active: true,
    route: route?.id != null ? { id: route.id } : undefined,
  };
  const id = persistedId(rule.id);
  if (id != null) {
    return apiRequest(`/api/pricing-rules/${id}`, { method: "PUT", body: { ...body, id } });
  }
  return apiRequest("/api/pricing-rules", { method: "POST", body });
}

export async function deletePricingRule(id: string) {
  const num = persistedId(id);
  if (num == null) return;
  await apiRequest(`/api/pricing-rules/${num}`, { method: "DELETE" });
}

export async function fetchDoorFeeRules() {
  const data = await apiRequest<any>("/api/door-fee-rules?size=200");
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

export async function deleteDoorFeeRule(id: string) {
  const num = persistedId(id);
  if (num == null) return;
  await apiRequest(`/api/door-fee-rules/${num}`, { method: "DELETE" });
}

export async function fetchProductPriceRules() {
  const data = await apiRequest<any>("/api/product-price-rules?size=200");
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
    groupName: (rule.group || "Khác").slice(0, 100),
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

export async function fetchCollectionsReport(officeCode?: string, date?: string) {
  const q = new URLSearchParams();
  if (officeCode) q.set("officeCode", officeCode);
  if (date) q.set("date", date);
  return apiRequest<Record<string, unknown>>(`/api/reports/collections?${q}`);
}
