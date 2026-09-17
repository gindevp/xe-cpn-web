import type { Order } from "./mock-data";

/**
 * Ma trận sửa đơn theo sheet "trạng thái" (_X.E Chuyển phát nhanh.xlsx):
 * chỉ các trạng thái có ✓ mới cho sửa trong popup thông tin đơn.
 *
 * Ẩn: Thành công (DELIVERED/RETURNED), toàn bộ luồng Hoàn (RETURNING/returnStage),
 * Ngoại lệ (issue mở), Đang giao (DELIVERING / OUT_FOR_DELIVERY).
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

/** Đơn có được sửa field (gửi/nhận/COD/cân) theo ma trận trạng thái không. */
export function orderStatusAllowsFieldEdit(o: OrderEditShape | null | undefined): boolean {
  if (!o) return false;

  if (BLOCKED_STATUSES.has(o.status)) return false;

  // Luồng hoàn hàng — file không cho sửa
  if (o.returnStage) return false;

  // Ngoại lệ / thất lạc / hư hỏng đang mở
  if (o.issue && !o.issue.resolvedAt) return false;

  // Đang giao
  if (o.stage === "DELIVERING") return false;

  // Đã vào pipeline nhập kho / LC / fail / chờ giao lại
  if (o.stage) return EDITABLE_FORWARD_STAGES.has(o.stage);

  // Chưa có stage = Chờ bàn giao (chờ lấy / chờ nhận / đang lấy) — file cho sửa
  return o.status === "CONFIRMED" || o.status === "DRAFT" || o.status === "WAITING";
}
