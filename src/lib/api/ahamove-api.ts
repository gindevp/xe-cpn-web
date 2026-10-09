import { apiRequest } from "./client";

export type AhamovePickupKmResult = {
  serviceId?: string;
  distanceMeters?: number | null;
  distanceKm?: number | null;
  /** Phí Ahamove ước tính (VND) — chi phí đối tác, không phải cước khách. */
  totalPrice?: number | null;
  /** TIER_2..TIER_4 khi phí đã cộng hàng cồng kềnh theo kích thước/cân nặng của đơn. */
  bulkyTier?: string | null;
  services?: Array<{ id?: string; _id?: string; name?: string }>;
};

export async function estimatePickupKm(body: {
  officeLat: number;
  officeLng: number;
  officeAddress?: string;
  /** Bỏ trống → Ahamove ước tính theo {@link pinAddress}. */
  pinLat?: number;
  pinLng?: number;
  pinAddress?: string;
  /** Có mã đơn thì ước tính kèm kích thước và cân nặng của đơn. */
  orderCode?: string;
  /** "" = tiêu chuẩn. TIER_2/3/4 = phụ phí NV chọn. Bỏ trống field = tự xét theo kiện. */
  bulkyTier?: string;
}): Promise<AhamovePickupKmResult> {
  return apiRequest<AhamovePickupKmResult>("/api/ahamove/estimate-pickup-km", {
    method: "POST",
    body,
  });
}
