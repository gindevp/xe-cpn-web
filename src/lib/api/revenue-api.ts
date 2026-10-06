import { apiRequest } from "./client";

export type RevenueKind = "ALL" | "BACKLOG" | "RECEIPT";

export type RevenueRow = {
  orderCode: string;
  createdAt?: string;
  officeCode: string;
  officeName: string;
  /** RECEIPT = dòng phiếu thu, BACKLOG = đơn tồn còn phải thu. */
  source: "RECEIPT" | "BACKLOG";
  receiptCode?: string | null;
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
  "orderCode" | "createdAt" | "officeCode" | "officeName" | "source" | "receiptCode" | "status"
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
