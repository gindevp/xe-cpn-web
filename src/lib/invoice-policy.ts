import type { OrderX } from "@/lib/store";

/** Khách phải yêu cầu HĐ công ty trong 3 tiếng kể từ khi thanh toán (BE `InvoicePolicy.WINDOW`). */
export const INVOICE_WINDOW_MS = 3 * 60 * 60 * 1000;

const DELIVERED_ACTIONS = new Set(["POD", "POD_QUAY", "DELIVERED", "TRANSITION_DELIVERED"]);

/** Gửi trả thanh toán lúc nhập kho gửi; các hình thức khác thanh toán đủ khi giao thành công. */
export function paidAtWarehouseIn(paymentTerm?: string) {
  return !paymentTerm || paymentTerm === "GUI_TRA";
}

/** Người mua HĐ cá nhân = người trả cước. */
export function senderPays(paymentTerm?: string) {
  return paymentTerm !== "NHAN_TRA" && paymentTerm !== "COD";
}

export function payerPhoneOf(o: Pick<OrderX, "collectForm" | "senderPhone" | "receiverPhone">) {
  return (senderPays(o.collectForm) ? o.senderPhone : o.receiverPhone)?.trim() ?? "";
}

/** Mốc thanh toán của đơn (ISO) — null nếu chưa tới. */
export function orderPaidAt(o: OrderX): string | null {
  if (o.status === "DRAFT" || o.status === "CANCELLED") return null;
  if (paidAtWarehouseIn(o.collectForm)) return o.pickedUpAt ?? null;
  if (o.status !== "DELIVERED") return null;
  const ev = [...(o.events ?? [])].reverse().find((e) => DELIVERED_ACTIONS.has(String(e.action).toUpperCase()));
  return ev?.at ?? null;
}

export function deadlineOf(paidAt?: string | null): Date | null {
  if (!paidAt) return null;
  const t = new Date(paidAt).getTime();
  return Number.isFinite(t) ? new Date(t + INVOICE_WINDOW_MS) : null;
}

export function isPastDeadline(paidAt?: string | null, now = Date.now()) {
  const d = deadlineOf(paidAt);
  return d != null && now > d.getTime();
}

export type InvoiceState = "NOT_ISSUED" | "COMPANY" | "PERSONAL" | "MANUAL" | "FAILED" | "PENDING";

export function invoiceStateOf(status?: string, type?: string): InvoiceState {
  if (status === "MANUAL") return "MANUAL";
  if (status === "ISSUED" || status === "DUPLICATE") return type === "COMPANY" ? "COMPANY" : "PERSONAL";
  if (status === "FAILED") return "FAILED";
  if (status === "PENDING") return "PENDING";
  return "NOT_ISSUED";
}

export const INVOICE_STATE_LABEL: Record<InvoiceState, { text: string; cls: string }> = {
  NOT_ISSUED: { text: "Chưa xuất", cls: "bg-slate-100 text-slate-700" },
  COMPANY: { text: "Đã xuất DN", cls: "bg-emerald-100 text-emerald-800" },
  PERSONAL: { text: "Đã xuất cá nhân", cls: "bg-sky-100 text-sky-800" },
  MANUAL: { text: "Đã tích xuất cá nhân", cls: "bg-indigo-100 text-indigo-800" },
  FAILED: { text: "Lỗi", cls: "bg-red-100 text-red-800" },
  PENDING: { text: "Đang xuất", cls: "bg-amber-100 text-amber-800" },
};

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  COMPANY: "Doanh nghiệp",
  PERSONAL: "Cá nhân",
};
