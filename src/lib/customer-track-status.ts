import {
  ORDER_ISSUE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  isAutoException,
  openIssueType,
  type Order,
  type OrderIssueType,
  type OrderStatus,
} from "./mock-data";
import { packageCount, warehouseInSeqs } from "./package-label";
import { isPendingHandover } from "./pending-handover";

type TrackLike = Pick<
  Order,
  | "status"
  | "homePickup"
  | "qrDropOff"
  | "pickedUpAt"
  | "pickingAt"
  | "pickupStaff"
  | "tripCode"
  | "stage"
>;

const PIPELINE_TAB_LABEL: Record<string, string> = {
  PICKED: "Lấy hàng thành công",
  WH_IN: "Nhập kho gửi",
  TRANSFER_PENDING: "Đợi trung chuyển giao",
  TRANSFERRING: "Hàng trên xe",
  DEST_WH_IN: "Nhập kho giao",
  DELIVERING: "Đang giao hàng",
  FAILED: "Giao hàng không thành công",
  REDELIVER_WAIT: "Chờ giao lại",
};

/** Tab Chờ bàn giao — cùng rule với màn cho-ban-giao. */
function pendingHandoverTabLabel(o: TrackLike): string | null {
  if (!isPendingHandover(o)) return null;
  // qrDropOff = khách mang đến; legacy DRAFT drop-off vẫn map cùng tab.
  if (o.qrDropOff || (o.status === "DRAFT" && !o.homePickup)) return "Chờ nhận hàng";
  if (!o.homePickup) return null;
  const picking = Boolean(o.pickupStaff || o.pickingAt);
  return picking ? "Đang lấy hàng" : "Chờ lấy hàng";
}

function derivePipelineStage(o: TrackLike): string | null {
  if (["DELIVERED", "CANCELLED", "RETURNED", "RETURNING", "DRAFT"].includes(o.status)) return null;
  switch (o.status) {
    case "FAILED_DELIVERY":
      return "FAILED";
    case "OUT_FOR_DELIVERY":
      return "DELIVERING";
    case "AT_DEST":
      return "DEST_WH_IN";
    case "IN_TRANSIT":
      return "TRANSFERRING";
    case "WAITING":
      return "TRANSFER_PENDING";
    default:
      break;
  }
  if (o.pickedUpAt) return "WH_IN";
  if (o.homePickup && o.pickingAt) return "PICKED";
  if (o.homePickup || o.qrDropOff) return null;
  if (o.status === "CONFIRMED") return "WH_IN";
  return null;
}

function pipelineStageOf(o: TrackLike): string | null {
  if (["DELIVERED", "CANCELLED", "RETURNED", "RETURNING", "DRAFT"].includes(o.status)) return null;
  return o.stage ?? derivePipelineStage(o);
}

/**
 * Nhãn trạng thái tra cứu khách = tên tab vận hành đơn đang ở
 * (Chờ lấy hàng / Nhập kho gửi / Hàng trên xe / …).
 */
export function customerTrackStatusLabel(o: TrackLike): string {
  const pending = pendingHandoverTabLabel(o);
  if (pending) return pending;

  const stage = pipelineStageOf(o);
  if (stage && PIPELINE_TAB_LABEL[stage]) return PIPELINE_TAB_LABEL[stage];

  return ORDER_STATUS_LABEL[o.status as OrderStatus] ?? String(o.status);
}

const TERMINAL_TAB_LABEL: Partial<Record<OrderStatus, string>> = {
  DELIVERED: "Giao thành công",
  RETURNED: "Hoàn thành công",
  CANCELLED: "Đơn huỷ",
};

/**
 * Nhãn trạng thái nội bộ = tên tab đơn đang nằm trên màn vận hành
 * (cùng rule stageOf / matchesPipelineTab của nhap-kho-luan-chuyen).
 */
export function orderTabStatusLabel(
  o: TrackLike &
    Pick<Order, "note" | "quantity" | "updatedAt" | "createdAt"> & {
      issue?: { type: OrderIssueType; resolvedAt?: string } | null;
    },
): string {
  const issue = openIssueType(o.issue);
  if (issue) return ORDER_ISSUE_STATUS_LABEL[issue];
  // Cùng rule tab Hàng ngoại lệ: quá 2 ngày ở kho đích mà chưa có sự cố ghi nhận.
  if (isAutoException(o)) return ORDER_ISSUE_STATUS_LABEL.EXCEPTION;
  const terminal = TERMINAL_TAB_LABEL[o.status];
  if (terminal) return terminal;

  if (o.status === "RETURNING") {
    const tab = o.stage ? pipelineTabOfStage(o, o.stage) : null;
    return tab ? `Hoàn · ${tab}` : ORDER_STATUS_LABEL.RETURNING;
  }

  const pending = pendingHandoverTabLabel(o);
  if (pending) return pending;

  let stage: string | null | undefined = o.stage;
  if (o.status === "FAILED_DELIVERY" && stage !== "FAILED" && stage !== "REDELIVER_WAIT") stage = "FAILED";
  else if (o.status === "OUT_FOR_DELIVERY" && stage !== "DELIVERING") stage = "DELIVERING";
  else stage = stage ?? derivePipelineStage(o);

  const tab = stage ? pipelineTabOfStage(o, stage) : null;
  return tab ?? ORDER_STATUS_LABEL[o.status] ?? String(o.status);
}

/** Hàng trên xe đã nhập kho giao đủ kiện thì nằm ở tab Nhập kho giao. */
function pipelineTabOfStage(o: Pick<Order, "note" | "quantity">, stage: string): string | null {
  if (stage === "TRANSFERRING" && warehouseInSeqs(o).length >= packageCount(o)) {
    return PIPELINE_TAB_LABEL.DEST_WH_IN;
  }
  return PIPELINE_TAB_LABEL[stage] ?? null;
}
