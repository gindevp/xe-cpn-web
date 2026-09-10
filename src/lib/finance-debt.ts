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
  CREATE: "Tạo đơn",
  DRAFT_CREATE: "Tạo nháp",
  CONFIRMED: "Xác nhận đơn",
  CONFIRM: "Xác nhận đơn",
  WH_IN: "Nhập kho gửi",
  WAREHOUSE_RECEIVE: "Nhập kho gửi",
  PICKUP_START: "Bắt đầu lấy hàng",
  PICKUP_STARTED: "Bắt đầu lấy hàng",
  PICKUP_RECEIVED: "Nhận hàng từ người gửi",
  ASSIGN_TRIP: "Gán lên xe",
  SCAN_OUT: "Xác nhận lên xe",
  SCAN_REMOVE: "Gỡ khỏi chuyến",
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
  FAIL_48H: "Giao thất bại — hết 48h",
  FAIL_MAX: "Giao thất bại — đủ 3 lần",
  RECEIPT_CREATED: "Lập phiếu thu",
  CANCELLED: "Huỷ đơn",
  AUTO_CANCEL: "Tự huỷ nháp quá hạn",
  RESTORE: "Khôi phục đơn",
  PRINT: "In tem",
  ORDER_EDIT: "Sửa đơn",
  PACKAGE_EDIT: "Sửa kiện",
  PACKAGE_REMOVE: "Xóa kiện",
  PATCH: "Cập nhật đơn",
  LEG_ARRIVE_DEST: "Chặng đến VP đích",
  LEG_ARRIVE_HUB: "Chặng đến hub",
  LEG_ADVANCE: "Chuyển chặng tiếp",
  LEG_START: "Bắt đầu chặng",
  RETURN_START: "Bắt đầu hoàn",
  RT_DONE: "Hoàn thành công",
  EVENT: "Cập nhật",
};

/** Detail tiếng Anh cứng từ BE — dịch hoặc bỏ nếu đã trùng nghĩa với nhãn action. */
const DETAIL_VI: Record<string, string> = {
  "public draft": "",
  "confirmed from draft": "",
  "internal create": "",
  "restored to confirmed": "Về trạng thái đã xác nhận",
  "pickup started": "",
  "received at warehouse": "",
  "last leg arrived": "Chặng cuối đã đến",
  "advanced to next leg": "Chuyển sang chặng tiếp",
  "internal shipper": "Shipper nội bộ",
};

function looksLikeEnglishCode(s: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(s);
}

function translateDetail(detail: string): string {
  const raw = detail.trim();
  if (!raw) return "";
  const mapped = DETAIL_VI[raw.toLowerCase()];
  if (mapped !== undefined) return mapped;
  // "Trip TRIPCODE" / "Chuyến TRIPCODE" / "Hub GP" — giữ phần hữu ích
  const trip = /^(?:trip|chuyến)\s+(.+)$/i.exec(raw);
  if (trip) return trip[1].trim();
  const hub = /^hub\s+(.+)$/i.exec(raw);
  if (hub) return `Hub ${hub[1].trim()}`;
  return raw;
}

export function orderEventContent(action?: string, detail?: string): string {
  const key = String(action ?? "").trim().toUpperCase();
  let base = EVENT_LABELS[key];
  if (!base) {
    if (key.startsWith("TRANSITION_")) {
      const status = key.slice("TRANSITION_".length);
      base = `Chuyển trạng thái ${EVENT_LABELS[status] ?? status.toLowerCase().replace(/_/g, " ")}`;
    } else if (looksLikeEnglishCode(key)) {
      base = "Cập nhật";
    } else {
      base = action?.trim() || "Cập nhật";
    }
  }
  const d = translateDetail(detail ?? "");
  if (!d) return base;
  if (d.toLowerCase() === base.toLowerCase()) return base;
  if (key === "ASSIGN_TRIP" || key === "SCAN_OUT" || key === "SCAN_REMOVE" || key === "HANDOVER") {
    return `${base} ${d}`.trim();
  }
  return `${base} · ${d}`;
}
