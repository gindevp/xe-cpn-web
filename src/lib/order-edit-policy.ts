import type { Order } from "./mock-data";

/**
 * Ma trận sửa đơn theo sheet "trạng thái" (_X.E Chuyển phát nhanh.xlsx):
 * chỉ các trạng thái có ✓ mới cho sửa trong popup thông tin đơn.
 *
 * Ẩn: Thành công (DELIVERED/RETURNED), toàn bộ luồng Hoàn (RETURNING/returnStage),
 * Ngoại lệ (issue mở), Đang giao (DELIVERING / OUT_FOR_DELIVERY).
 *
 * Sau nhập kho (WH_IN trở đi, kể cả PICKED đã lấy): chỉ sửa bên nhận + COD.
 */
const EDITABLE_FORWARD_STAGES = new Set([
  "PICKED",
  "WH_IN",
  "TRANSFER_PENDING",
  "TRANSFERRING",
  "DEST_WH_IN",
  "FAILED",
  "REDELIVER_WAIT",
]);

/** Đã lấy hàng / đã vào kho — không còn sửa bên gửi / cân / ghi chú. */
const POST_WAREHOUSE_STAGES = new Set([
  "PICKED",
  "WH_IN",
  "TRANSFER_PENDING",
  "TRANSFERRING",
  "DEST_WH_IN",
  "FAILED",
  "REDELIVER_WAIT",
]);

const BLOCKED_STATUSES = new Set([
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "RETURNING",
  "OUT_FOR_DELIVERY",
]);

type OrderEditShape = Pick<Order, "status" | "stage"> & {
  returnStage?: string | null;
  issue?: { resolvedAt?: string } | null;
};

export type OrderEditableFields = {
  sender: boolean;
  receiver: boolean;
  cod: boolean;
  packages: boolean;
  note: boolean;
};

const NONE: OrderEditableFields = {
  sender: false,
  receiver: false,
  cod: false,
  packages: false,
  note: false,
};

/** Đơn có được mở chế độ sửa theo ma trận trạng thái không. */
export function orderStatusAllowsFieldEdit(o: OrderEditShape | null | undefined): boolean {
  if (!o) return false;

  if (BLOCKED_STATUSES.has(o.status)) return false;
  if (o.returnStage) return false;
  if (o.issue && !o.issue.resolvedAt) return false;
  if (o.stage === "DELIVERING") return false;

  if (o.stage) return EDITABLE_FORWARD_STAGES.has(o.stage);

  return o.status === "CONFIRMED" || o.status === "DRAFT" || o.status === "WAITING";
}

/** Field nào được sửa (sau nhập kho chỉ nhận + COD). */
export function orderEditableFields(o: OrderEditShape | null | undefined): OrderEditableFields {
  if (!orderStatusAllowsFieldEdit(o) || !o) return NONE;

  // Chờ bàn giao (chưa có stage): đủ gửi / nhận / COD / cân / ghi chú
  if (!o.stage) {
    return { sender: true, receiver: true, cod: true, packages: true, note: true };
  }

  // Đã lấy / đã nhập kho trở đi
  if (POST_WAREHOUSE_STAGES.has(o.stage)) {
    return { sender: false, receiver: true, cod: true, packages: false, note: false };
  }

  return NONE;
}
