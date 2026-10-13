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

/** Nhãn ảnh POD. Ảnh cũ còn ghi "Nhận" / "Giao". */
export function podMomentLabel(label?: string | null): string {
  const s = (label ?? "").trim();
  if (s === "Nhận" || s === "Lúc nhận" || s === "Shipper nhận") return "Shipper nhận";
  if (s === "Giao" || s === "Lúc giao" || s === "Shipper giao") return "Shipper giao";
  if (s === "Điều phối giao ship") return "Điều phối giao ship";
  return s;
}

/** Lý do hủy / giao thất bại Ahamove (fail_comment, cancel_comment) sang tiếng Việt. Câu tiếng Việt giữ nguyên. */
const AHAMOVE_FAIL_REASON_VI: Array<[RegExp, string]> = [
  [/recipient does not show up/i, "Người nhận không có mặt"],
  [/cannot contact recipient|could not contact recipient|unable to contact recipient/i, "Không liên lạc được người nhận"],
  [/does not (pick up|answer) the phone|not answering|phone.*(off|busy)/i, "Người nhận không nghe máy"],
  [/reschedul/i, "Người nhận hẹn giao lại"],
  [/change(s|d)? (the )?(delivery )?(address|location)|wrong address|incorrect address/i, "Sai hoặc đổi địa chỉ giao"],
  [/refus(e|es|ed)/i, "Người nhận từ chối nhận hàng"],
  [/wrong phone|incorrect phone|invalid phone/i, "Sai số điện thoại người nhận"],
  [/sender (asks|asked) to return|return to sender/i, "Người gửi yêu cầu hoàn hàng"],
  [/auto cancel, no driver accepted/i, "Tự hủy vì không có tài xế nhận"],
  [/driver asked( me)? to cancel|supplier asked/i, "Tài xế yêu cầu hủy"],
  [/waited too long/i, "Chờ quá lâu"],
  [/too far/i, "Tài xế quá xa"],
  [/don'?t want to (book|order)/i, "Khách không muốn gửi nữa"],
  [/change order/i, "Khách muốn đổi thông tin đơn"],
];

export function ahamoveFailReasonVi(raw?: string | null): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const body = text.replace(/^ahamove:\s*/i, "");
  for (const [pattern, vi] of AHAMOVE_FAIL_REASON_VI) {
    if (pattern.test(body)) return vi;
  }
  return text;
}

/** Ahamove còn chạy (chưa COMPLETED / FAILED / CANCELLED) — khớp BE AhamoveDispatchService.partnerActive. */
export function ahamoveActive(o: OrderX | undefined): boolean {
  if (!o || o.partnerCode !== "AHAMOVE" || !o.partnerOrderId || !o.partnerStatus) return false;
  return !["CANCELLED", "COMPLETED", "FAILED"].includes(o.partnerStatus.trim().toUpperCase());
}

/** POD tay bị chặn khi Ahamove đang giao (webhook tự POD); Admin vẫn được POD tay khi webhook không về. */
export function ahamovePodBlocked(o: OrderX | undefined, role: string | undefined): boolean {
  return ahamoveActive(o) && role !== "AD";
}

/**
 * Lý do không gọi Ahamove được; null = đủ điều kiện.
 * Đơn còn nợ (người gửi hay người nhận trả) → tài xế ứng toàn bộ số nợ (xem {@link ahamoveDue}); ghi nợ cước thì chặn.
 */
/** Lấy tận nơi: chỉ đơn chờ lấy, người nhận trả cước, không thu tiền lúc lấy. */
export function ahamovePickupBlockReason(o: OrderX | undefined): string | null {
  if (!o) return "Không tìm thấy đơn";
  if (o.status !== "CONFIRMED" && o.status !== "WAITING") return "Đơn không còn ở chờ lấy hàng";
  if (!o.homePickup) return "Đơn không phải lấy tận nơi";
  if (o.pickedUpAt) return "Đơn đã nhập kho";
  if (o.collectForm && o.collectForm !== "NHAN_TRA") return "Đơn lấy tận nơi chỉ người nhận thanh toán";
  if (ahamoveActive(o)) return "Đơn đang có chuyến Ahamove";
  return null;
}

export function ahamoveBlockReason(o: OrderX | undefined): string | null {
  if (!o) return "Không tìm thấy đơn";
  if (o.status !== "AT_DEST" && o.status !== "FAILED_DELIVERY") return "Đơn không ở kho VP nhận";
  if (!o.homeDelivery) return "Đơn không phải giao tận nơi";
  if ((o.codAmount ?? 0) > 0) return "Đơn có COD — chưa hỗ trợ qua Ahamove";
  if (ahamoveRefundDue(o))
    return `Chưa hoàn ${(o.partnerCodAmount ?? 0).toLocaleString("vi-VN")}đ tiền ứng cho tài xế Ahamove lần trước`;
  const due = ahamoveDue(o);
  if (due > 0 && o.onCredit) return "Đơn ghi nợ cước — không gọi Ahamove ứng cước";
  return null;
}
