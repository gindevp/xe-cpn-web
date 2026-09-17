import type { Order } from "./mock-data";

/**
 * Ma trận sửa đơn theo sheet "trạng thái" (_X.E Chuyển phát nhanh.xlsx).
 *
 * Bỏ qua money_collect_* (web không có).
 * Field sheet chưa có UI (insurance, DxRxC, payment, ảnh SP…): chưa map.
 */

const POST_WAREHOUSE_STAGES = new Set([
  "PICKED",
  "WH_IN",
  "TRANSFER_PENDING",
  "TRANSFERRING",
  "DEST_WH_IN",
  "FAILED",
  "REDELIVER_WAIT",
]);

type OrderEditShape = Pick<
  Order,
  "status" | "stage" | "homePickup" | "pickingAt" | "pickupStaff" | "pickedUpAt"
> & {
  returnStage?: string | null;
  issue?: { resolvedAt?: string } | null;
};

export type OrderEditableFields = {
  sender: boolean;
  receiver: boolean;
  cod: boolean;
  packages: boolean;
  note: boolean;
  senderAddress: boolean;
  receiverAddress: boolean;
  homePickup: boolean;
  homeDelivery: boolean;
  returnContact: boolean;
};

const NONE: OrderEditableFields = {
  sender: false,
  receiver: false,
  cod: false,
  packages: false,
  note: false,
  senderAddress: false,
  receiverAddress: false,
  homePickup: false,
  homeDelivery: false,
  returnContact: false,
};

const FULL_PRE: OrderEditableFields = {
  sender: true,
  receiver: true,
  cod: true,
  packages: true,
  note: true,
  senderAddress: true,
  receiverAddress: true,
  homePickup: true,
  homeDelivery: true,
  returnContact: true,
};

/** Ship đang lấy — sheet: không sửa bên gửi / địa chỉ gửi / lấy tận nơi. */
const PICKING: OrderEditableFields = {
  sender: false,
  receiver: true,
  cod: true,
  packages: true,
  note: true,
  senderAddress: false,
  receiverAddress: true,
  homePickup: false,
  homeDelivery: true,
  returnContact: true,
};

/** Sau nhập kho / pipeline tới chờ giao lại. */
const POST_WH: OrderEditableFields = {
  sender: false,
  receiver: true,
  cod: true,
  packages: false,
  note: true,
  senderAddress: false,
  receiverAddress: true,
  homePickup: false,
  homeDelivery: true,
  returnContact: true,
};

const RETURN_ONLY: OrderEditableFields = {
  ...NONE,
  returnContact: true,
};

function isPickingPhase(o: OrderEditShape): boolean {
  if (o.stage || o.pickedUpAt) return false;
  if (!o.homePickup) return false;
  return Boolean(o.pickupStaff || o.pickingAt);
}

function anyEditable(f: OrderEditableFields): boolean {
  return Object.values(f).some(Boolean);
}

/** Field nào được sửa theo ma trận. */
export function orderEditableFields(o: OrderEditShape | null | undefined): OrderEditableFields {
  if (!o) return NONE;

  if (o.status === "DELIVERED" || o.status === "CANCELLED" || o.status === "RETURNED") return NONE;
  if (o.issue && !o.issue.resolvedAt) return NONE;

  // Hoàn fail: chỉ return contact
  if (o.returnStage === "RT_FAILED") return RETURN_ONLY;
  // Các giai đoạn hoàn khác: không sửa
  if (o.returnStage || o.status === "RETURNING") return NONE;

  // Đang giao: chỉ return contact
  if (o.stage === "DELIVERING" || o.status === "OUT_FOR_DELIVERY") return RETURN_ONLY;

  if (o.stage && POST_WAREHOUSE_STAGES.has(o.stage)) return POST_WH;

  if (isPickingPhase(o)) return PICKING;

  if (o.status === "CONFIRMED" || o.status === "DRAFT" || o.status === "WAITING") return FULL_PRE;

  return NONE;
}

/** Đơn có được mở chế độ sửa không. */
export function orderStatusAllowsFieldEdit(o: OrderEditShape | null | undefined): boolean {
  return anyEditable(orderEditableFields(o));
}
