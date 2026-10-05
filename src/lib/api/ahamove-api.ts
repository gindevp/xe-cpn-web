import { apiRequest } from "./client";

export type AhamovePickupKmResult = {
  serviceId?: string;
  distanceMeters?: number | null;
  distanceKm?: number | null;
  /** Phí Ahamove ước tính (VND) — chi phí đối tác, không phải cước khách. */
  totalPrice?: number | null;
  services?: Array<{ id?: string; _id?: string; name?: string }>;
};

export async function estimatePickupKm(body: {
  officeLat: number;
  officeLng: number;
  officeAddress?: string;
  pinLat: number;
  pinLng: number;
  pinAddress?: string;
}): Promise<AhamovePickupKmResult> {
  return apiRequest<AhamovePickupKmResult>("/api/ahamove/estimate-pickup-km", {
    method: "POST",
    body,
  });
}
