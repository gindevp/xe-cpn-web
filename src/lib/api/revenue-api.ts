import { apiRequest } from "./client";

export type RevenueKind = "ALL" | "BACKLOG" | "DELIVERED";

export type RevenueRow = {
  orderCode: string;
  createdAt?: string;
  officeCode: string;
  officeName: string;
  /** SENDER = tiền thu phía gửi, DELIVERY = tiền thu lúc giao. */
  side: "SENDER" | "DELIVERY";
  status: string;
  goodsFare: number;
  deliveryFee: number;
  pickupFee: number;
  codFee: number;
  declaredFee: number;
  discount: number;
  total: number;
};

export type RevenueTotals = Omit<
  RevenueRow,
  "orderCode" | "createdAt" | "officeCode" | "officeName" | "side" | "status"
>;

export type RevenueReport = {
  from: string;
  to: string;
  officeCode?: string | null;
  kind: RevenueKind;
  rows: RevenueRow[];
  totals: RevenueTotals;
};

export function getRevenueReport(params: {
  from: string;
  to: string;
  officeCode?: string;
  kind: RevenueKind;
}) {
  const q = new URLSearchParams({ from: params.from, to: params.to, kind: params.kind });
  if (params.officeCode) q.set("officeCode", params.officeCode);
  return apiRequest<RevenueReport>(`/api/reports/revenue?${q}`);
}
