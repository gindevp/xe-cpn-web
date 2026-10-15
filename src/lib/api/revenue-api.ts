import { apiRequest } from "./client";

export type RevenueKind = "ALL" | "BACKLOG" | "RECEIPT";

export type RevenueRow = {
  orderCode: string;
  createdAt?: string;
  officeCode: string;
  officeName: string;
  /** RECEIPT = đã thu đủ, BACKLOG = còn phải thu. */
  source: "RECEIPT" | "BACKLOG";
  receiptCode?: string | null;
  status: string;
  goodsFare: number;
  deliveryFee: number;
  pickupFee: number;
  codFee: number;
  declaredFee: number;
  storageFee: number;
  returnFee: number;
  discount: number;
  total: number;
  /** Phí trả Ahamove. Tổng doanh thu đã trừ khoản này một lần. */
  ahamoveFee?: number;
  /** Phí giao tận nơi khi giao nội bộ. Đã nằm trong tổng doanh thu, chỉ để xem. */
  internalDeliveryFee?: number;
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
