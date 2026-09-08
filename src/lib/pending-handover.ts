import type { Order } from "./mock-data";

type HandoverOrder = Pick<
  Order,
  "homePickup" | "qrDropOff" | "pickedUpAt" | "tripCode" | "status" | "fromOffice"
>;

/** Trạng thái đã rời luồng chờ bàn giao (đã đi tuyến / kết thúc). */
const CLOSED_STATUSES = ["CANCELLED", "DELIVERED", "RETURNED", "IN_TRANSIT", "AT_DEST"];

/** Đơn thuộc màn "Chờ bàn giao": lấy tận nơi hoặc khách quét QR tại bưu cục, chưa nhập kho. */
export function isPendingHandover(o: HandoverOrder): boolean {
  if (!o.homePickup && !o.qrDropOff) return false;
  if (o.pickedUpAt) return false; // đã nhập kho → sang Đơn chờ gán xe
  if (o.tripCode) return false;
  return !CLOSED_STATUSES.includes(o.status);
}

/**
 * Đơn chờ bàn giao trong phạm vi xem của user — dùng cho cả danh sách màn và badge trên nav
 * để hai chỗ không lệch số. Không phải admin thì chỉ thấy đơn của VP mình.
 */
export function pendingHandoverOrders<T extends HandoverOrder>(
  orders: T[],
  opts: { allOffices: boolean; office?: string },
): T[] {
  return orders.filter((o) => {
    if (!isPendingHandover(o)) return false;
    if (!opts.allOffices && opts.office && o.fromOffice !== opts.office) return false;
    return true;
  });
}
