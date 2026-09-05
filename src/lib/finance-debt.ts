import type { Order } from "./mock-data";
import type { OrderX } from "./store";

export const UNKNOWN_DEBT_OWNER = "__unknown__";
export const UNKNOWN_DEBT_OWNER_LABEL = "Chưa xác định";

export function orderDueAmount(o: Pick<Order, "fare" | "paidAmount">, apiDue?: number): number {
  if (apiDue != null && Number.isFinite(apiDue)) return Math.max(0, apiDue);
  return Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0));
}

/** Người POD / giao thành công — chịu trách nhiệm trên phiếu thu. */
export function deliveryActorForOrder(o: OrderX, apiOwner?: string | null): string {
  const fromApi = apiOwner?.trim();
  if (fromApi) return fromApi;
  const pod = [...(o.events ?? [])]
    .reverse()
    .find((e) => ["POD", "POD_QUAY", "POD_HOME", "DELIVERED"].includes(String(e.action ?? "").toUpperCase()));
  if (pod?.by?.trim()) return pod.by.trim();
  const payments = o.payments ?? [];
  if (payments.length) {
    const lastPodPay = [...payments]
      .sort((a, b) => a.at.localeCompare(b.at))
      .reverse()
      .find((p) => /pod/i.test(p.note ?? "") || p.by?.trim());
    if (lastPodPay?.by?.trim()) return lastPodPay.by.trim();
  }
  return UNKNOWN_DEBT_OWNER;
}

/** @deprecated dùng deliveryActorForOrder — giữ alias cho chỗ gọi cũ */
export function debtOwnerForOrder(o: OrderX, apiOwner?: string | null): string {
  return deliveryActorForOrder(o, apiOwner);
}

export function debtOwnerLabel(owner: string): string {
  return owner === UNKNOWN_DEBT_OWNER ? UNKNOWN_DEBT_OWNER_LABEL : owner;
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Tạo đơn",
  CONFIRMED: "Xác nhận đơn",
  WH_IN: "Nhập kho gửi",
  ASSIGN_TRIP: "Gán lên xe",
  SCAN_OUT: "Xác nhận lên xe",
  SCAN_IN: "Nhập kho nhận",
  HUB_IN: "Nhập hub",
  HANDOVER: "Bàn giao chuyến",
  DEST_WH_IN: "Nhập kho giao",
  AT_DEST: "Đến kho giao",
  OUT_FOR_DELIVERY: "Đang giao",
  TAKE_JOB: "Shipper nhận việc",
  PUSH_SHIP: "Đẩy ship đối tác",
  POD: "Giao khách (tận nơi)",
  POD_QUAY: "Giao khách tại quầy",
  POD_HOME: "Giao khách tận nhà",
  DELIVERED: "Giao thành công",
  FAIL: "Giao thất bại",
  RECEIPT_CREATED: "Lập phiếu thu",
  CANCELLED: "Huỷ đơn",
  PRINT: "In tem",
  ORDER_EDIT: "Sửa đơn",
  PACKAGE_EDIT: "Sửa kiện",
  PACKAGE_REMOVE: "Xóa kiện",
  PATCH: "Cập nhật đơn",
};

export function orderEventContent(action?: string, detail?: string): string {
  const key = String(action ?? "").trim().toUpperCase();
  const base = EVENT_LABELS[key] ?? (action?.trim() || "Cập nhật");
  const d = detail?.trim();
  if (!d) return base;
  // Avoid duplicating if detail already is the label
  if (d.toLowerCase() === base.toLowerCase()) return base;
  if (/^trip\s+/i.test(d)) return `${base} ${d.replace(/^trip\s+/i, "").trim()}`.trim();
  if (key === "ASSIGN_TRIP" || key === "SCAN_OUT") {
    const plateOrTrip = d.replace(/^Trip\s+/i, "").trim();
    return `${base} ${plateOrTrip}`.trim();
  }
  return `${base}${d ? ` · ${d}` : ""}`;
}
