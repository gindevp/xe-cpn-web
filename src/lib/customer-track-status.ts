import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from "./mock-data";
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
