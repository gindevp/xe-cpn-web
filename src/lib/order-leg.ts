import type { Order, OrderLeg } from "./mock-data";

type LegOrder = Pick<Order, "status" | "fromOffice" | "toOffice" | "finalToOffice" | "hubOffice" | "legs">;

/** Đơn tuyến tỉnh đi tỉnh qua VP trung chuyển. */
export function isTransitOrder(o: Pick<Order, "hubOffice">): boolean {
  return !!o.hubOffice?.trim();
}

/** Chặng đang chạy của đơn trung chuyển: chặng chưa tới nơi đầu tiên. Hoàn ngay tại kho VP gửi thì không tính chặng. */
export function activeTransitLeg(o: LegOrder): OrderLeg | undefined {
  if (!isTransitOrder(o)) return undefined;
  const leg = [...(o.legs ?? [])]
    .sort((a, b) => a.index - b.index)
    .find((l) => l.status === "PENDING" || l.status === "IN_TRANSIT");
  if (!leg) return undefined;
  if (o.status === "RETURNING" && leg.index === 0) return undefined;
  return leg;
}

function receiverOf(o: LegOrder): string {
  return (o.finalToOffice || o.toOffice || "").trim();
}

/** VP giữ hàng ở phía gửi (nhập kho gửi / gán xe / xếp lên xe). */
export function loadOriginOffice(o: LegOrder): string {
  const leg = activeTransitLeg(o);
  if (leg?.fromOffice) return leg.fromOffice;
  return o.status === "RETURNING" ? receiverOf(o) : o.fromOffice;
}

/** VP quét xuống hàng của chặng đang chạy (VP trung chuyển hoặc VP nhận; đơn hoàn: VP gửi gốc). */
export function unloadTargetOffice(o: LegOrder): string {
  const leg = activeTransitLeg(o);
  if (leg?.toOffice) return leg.toOffice;
  return o.status === "RETURNING" ? o.fromOffice : receiverOf(o);
}
