import type { OrderX } from "./store";

export type ExtraFarePayer = "SENDER" | "RECEIVER";

/** Người gửi trả, đã trả đủ cước (không công nợ). */
export function senderPaidFull(o: Pick<OrderX, "collectForm" | "onCredit" | "paidAmount" | "fare">): boolean {
  if (o.collectForm !== "GUI_TRA" || o.onCredit) return false;
  const paid = o.paidAmount ?? 0;
  return paid > 0 && paid >= (o.fare ?? 0);
}

/** Sửa đơn có thể làm cước tăng: cước mới lớn hơn, hoặc bật lấy/giao tận nơi (máy chủ tính lại phí). */
export function patchMayRaiseFare(prev: OrderX, patch: Partial<OrderX>): boolean {
  if (patch.fare !== undefined && patch.fare > (prev.fare ?? 0)) return true;
  if (patch.homeDelivery === true && !prev.homeDelivery) return true;
  if (patch.homePickup === true && !prev.homePickup) return true;
  return false;
}

/** Hàng còn ở kho gửi (người gửi thường còn ở quầy) → mặc định người gửi trả thêm. */
export function defaultExtraFarePayer(o: OrderX): ExtraFarePayer {
  const stage = (o as OrderX & { stage?: string }).stage;
  const atSenderWh = o.status === "CONFIRMED" && (!stage || stage === "WH_IN" || stage === "PICKED");
  return atSenderWh ? "SENDER" : "RECEIVER";
}

type Pending = {
  order: OrderX;
  newFare?: number;
  resolve: (v: ExtraFarePayer | null) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

export function subscribeExtraFarePayer(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function currentExtraFarePayerRequest(): Pending | null {
  return pending;
}

/** Hỏi ai trả phần cước tăng thêm; null = huỷ sửa. */
export function requestExtraFarePayer(order: OrderX, newFare?: number): Promise<ExtraFarePayer | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = {
      order,
      newFare,
      resolve: (v) => {
        pending = null;
        listeners.forEach((l) => l());
        resolve(v);
      },
    };
    listeners.forEach((l) => l());
  });
}
