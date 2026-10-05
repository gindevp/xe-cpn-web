import type { OrderX } from "@/lib/store";

export function ahamoveDue(o: OrderX): number {
  return Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0));
}

/** Đã nhận tiền tài xế ứng nhưng không giao được → phải trả lại tài xế trước khi giao lại. */
export function ahamoveRefundDue(o: OrderX): boolean {
  return (
    (o.partnerCodAmount ?? 0) > 0 &&
    !!o.partnerCodCollectedAt &&
    o.status !== "OUT_FOR_DELIVERY" &&
    o.status !== "DELIVERED"
  );
}

/** Tài xế phải ứng cước nhưng NV chưa xác nhận đã nhận tiền. */
export function ahamoveAdvancePending(o: OrderX): boolean {
  return (
    (o.partnerCodAmount ?? 0) > 0 &&
    !o.partnerCodCollectedAt &&
    (o.status === "OUT_FOR_DELIVERY" || o.status === "DELIVERED")
  );
}

/**
 * Lý do không gọi Ahamove được; null = đủ điều kiện.
 * Đơn người nhận trả còn nợ → tài xế ứng cước (xem {@link ahamoveDue}); người gửi trả / ghi nợ còn nợ thì chặn.
 */
export function ahamoveBlockReason(o: OrderX | undefined): string | null {
  if (!o) return "Không tìm thấy đơn";
  if (o.status !== "AT_DEST" && o.status !== "FAILED_DELIVERY") return "Đơn không ở kho VP nhận";
  if (!o.homeDelivery) return "Đơn không phải giao tận nơi";
  if ((o.codAmount ?? 0) > 0) return "Đơn có COD — chưa hỗ trợ qua Ahamove";
  if (ahamoveRefundDue(o))
    return `Chưa hoàn ${(o.partnerCodAmount ?? 0).toLocaleString("vi-VN")}đ tiền ứng cho tài xế Ahamove lần trước`;
  const due = ahamoveDue(o);
  if (due > 0 && o.onCredit) return "Đơn ghi nợ cước — không gọi Ahamove ứng cước";
  if (due > 0 && o.collectForm !== "NHAN_TRA")
    return `Đơn người gửi trả còn nợ ${due.toLocaleString("vi-VN")}đ — VP gửi thu trước`;
  return null;
}
