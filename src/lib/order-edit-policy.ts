import type { Order, Role } from "./mock-data";

/**
 * Ma trận sửa đơn theo sheet "trạng thái" (_X.E Chuyển phát nhanh.xlsx).
 *
 * Bỏ qua money_collect_* (web không có).
 * Field sheet chưa có UI (insurance, DxRxC, payment, ảnh SP…): chưa map.
 */

export type AdminIssueType = "EXCEPTION" | "LOST" | "DAMAGED";

/** Nguồn kho lúc AD ghi nhận vụ việc — quyết định CTA "Nhập kho gửi/giao" trên /ngoai-le. */
export type IssueFromStage = "WH_IN" | "DEST_WH_IN";

const FROM_STAGE_RE = /\|\s*FROM=(WH_IN|DEST_WH_IN)\s*$/;

/** AD ghi nhận ngoại lệ / thất lạc / hư hỏng — mọi trạng thái trừ giao/hoàn thành công. */
export function canAdminMarkIssue(
  o: Pick<Order, "status"> & { issue?: { type?: string; resolvedAt?: string } | null },
  role?: Role | null,
  type?: AdminIssueType,
): boolean {
  if (role !== "AD") return false;
  if (o.status === "DELIVERED" || o.status === "RETURNED") return false;
  if (type && o.issue && !o.issue.resolvedAt && o.issue.type === type) return false;
  return true;
}

/** @deprecated dùng canAdminMarkIssue(..., "LOST") */
export function canAdminMarkLost(
  o: Pick<Order, "status"> & { issue?: { type?: string; resolvedAt?: string } | null },
  role?: Role | null,
): boolean {
  return canAdminMarkIssue(o, role, "LOST");
}

export const ADMIN_ISSUE_LABEL: Record<AdminIssueType, string> = {
  EXCEPTION: "Ngoại lệ",
  LOST: "Thất lạc",
  DAMAGED: "Hư hỏng",
};

export const ISSUE_FROM_STAGE_LABEL: Record<IssueFromStage, string> = {
  WH_IN: "Nhập kho gửi",
  DEST_WH_IN: "Nhập kho giao",
};

/** Suy ra kho nguồn từ stage/status hiện tại (khi AD bấm vụ việc). */
export function resolveIssueFromStage(
  o: Pick<Order, "status"> & { stage?: string | null },
): IssueFromStage {
  const stage = o.stage ?? undefined;
  if (
    stage === "DEST_WH_IN" ||
    stage === "DELIVERING" ||
    stage === "FAILED" ||
    stage === "REDELIVER_WAIT"
  ) {
    return "DEST_WH_IN";
  }
  if (
    stage === "WH_IN" ||
    stage === "TRANSFER_PENDING" ||
    stage === "TRANSFERRING" ||
    stage === "PICKED"
  ) {
    return "WH_IN";
  }
  if (o.status === "AT_DEST" || o.status === "OUT_FOR_DELIVERY" || o.status === "FAILED_DELIVERY") {
    return "DEST_WH_IN";
  }
  return "WH_IN";
}

export function encodeIssueReason(detail: string, fromStage: IssueFromStage): string {
  const suffix = ` | FROM=${fromStage}`;
  const max = 1000;
  const base = detail.replace(FROM_STAGE_RE, "").trim();
  const clipped = base.slice(0, Math.max(0, max - suffix.length));
  return `${clipped}${suffix}`;
}

export function parseIssueFromStage(
  reason?: string | null,
  fallback: IssueFromStage = "DEST_WH_IN",
): IssueFromStage {
  const m = reason?.match(FROM_STAGE_RE);
  if (m?.[1] === "WH_IN" || m?.[1] === "DEST_WH_IN") return m[1];
  return fallback;
}

export function displayIssueReason(reason?: string | null): string {
  const t = reason?.replace(FROM_STAGE_RE, "").trim();
  return t || "-";
}

/** Ngoại lệ / hư hỏng bắt buộc nhập lý do; thất lạc không bắt buộc. */
export function adminIssueRequiresNote(type: AdminIssueType): boolean {
  return type === "EXCEPTION" || type === "DAMAGED";
}

export function issueFromStageOf(
  o: Pick<Order, "status"> & {
    stage?: string | null;
    issue?: { fromStage?: IssueFromStage; reason?: string } | null;
  },
): IssueFromStage {
  if (o.issue?.fromStage === "WH_IN" || o.issue?.fromStage === "DEST_WH_IN") return o.issue.fromStage;
  if (o.issue?.reason) return parseIssueFromStage(o.issue.reason, resolveIssueFromStage(o));
  return resolveIssueFromStage(o);
}

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
