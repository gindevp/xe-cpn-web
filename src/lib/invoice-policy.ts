import type { OrderX } from "@/lib/store";

/** Khách phải yêu cầu HĐ công ty trong 3 tiếng kể từ khi thanh toán và đơn hoàn tất (BE `InvoicePolicy.WINDOW`). */
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

/** Sự kiện đơn hoàn tất (BE `InvoicePolicy.DONE_ACTIONS`): giao thành công hoặc hoàn xong về người gửi. */
const DONE_ACTIONS = new Set([...DELIVERED_ACTIONS, "RT_DONE", "TRANSITION_RETURNED"]);

/** Lúc đơn hoàn tất (ISO) — null nếu chưa giao thành công / chưa hoàn xong. */
export function orderDoneAt(o: OrderX): string | null {
  if (o.status !== "DELIVERED" && o.status !== "RETURNED") return null;
  const ev = [...(o.events ?? [])].reverse().find((e) => DONE_ACTIONS.has(String(e.action).toUpperCase()));
  return ev?.at ?? null;
}

/**
 * Hạn tự xuất / hạn khách yêu cầu HĐ công ty (BE `InvoicePolicy.deadline`): mốc thanh toán + 3 tiếng và đơn
 * đã hoàn tất — gửi trả hoàn tất muộn hơn thì hạn = lúc hoàn tất; chưa hoàn tất → null.
 */
export function invoiceDeadlineOf(o: OrderX): Date | null {
  const paidAt = orderPaidAt(o);
  const doneAt = orderDoneAt(o);
  if (!paidAt || !doneAt) return null;
  const paid = new Date(paidAt).getTime();
  const done = new Date(doneAt).getTime();
  if (!Number.isFinite(paid) || !Number.isFinite(done)) return null;
  return new Date(Math.max(paid + INVOICE_WINDOW_MS, done));
}

export function isPastDeadline(deadline?: Date | string | null, now = Date.now()) {
  if (!deadline) return false;
  const t = new Date(deadline).getTime();
  return Number.isFinite(t) && now > t;
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
  MANUAL: { text: "Bỏ xuất tự động", cls: "bg-indigo-100 text-indigo-800" },
  FAILED: { text: "Lỗi", cls: "bg-red-100 text-red-800" },
  PENDING: { text: "Đang xuất", cls: "bg-amber-100 text-amber-800" },
};

/** Nhãn loại đơn trên màn hoá đơn. Huỷ / ngoại lệ mở: BE không tự xuất, không xuất bù. */
export type InvoiceOrderFlag = "CANCELLED" | "EXCEPTION" | "RETURNING";

export function invoiceOrderFlag(r: { orderStatus?: string; openIssueType?: string | null }): InvoiceOrderFlag | null {
  if (r.orderStatus === "CANCELLED") return "CANCELLED";
  if (r.openIssueType) return "EXCEPTION";
  if (r.orderStatus === "RETURNING" || r.orderStatus === "RETURNED") return "RETURNING";
  return null;
}

export function isInvoiceAutoBlocked(flag: InvoiceOrderFlag | null) {
  return flag === "CANCELLED" || flag === "EXCEPTION";
}

const ISSUE_TYPE_TEXT: Record<string, string> = {
  EXCEPTION: "Ngoại lệ",
  LOST: "Ngoại lệ · thất lạc",
  DAMAGED: "Ngoại lệ · hư hỏng",
};

export function invoiceOrderFlagLabel(
  flag: InvoiceOrderFlag,
  openIssueType?: string | null,
): { text: string; cls: string } {
  if (flag === "CANCELLED") return { text: "Đơn huỷ", cls: "bg-red-100 text-red-800" };
  if (flag === "EXCEPTION") {
    return { text: ISSUE_TYPE_TEXT[openIssueType ?? ""] ?? "Ngoại lệ", cls: "bg-orange-100 text-orange-800" };
  }
  return { text: "Đơn hoàn", cls: "bg-violet-100 text-violet-800" };
}

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  COMPANY: "Doanh nghiệp",
  PERSONAL: "Cá nhân",
};
