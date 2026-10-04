import { apiRequest } from "./client";

export type VehicleEventReportItem = {
  id: number;
  officeCode: string;
  officeName: string;
  eventType: "ARRIVE" | "DEPART";
  source: "TRIP" | "CRM";
  tripKey: string;
  tripCode?: string | null;
  externalTripId?: string | null;
  vehiclePlate?: string | null;
  driverName?: string | null;
  routeLabel?: string | null;
  plannedDepartAt?: string | null;
  eventAt: string;
  reportedBy?: string | null;
  reportedByName?: string | null;
  /** Lý do khi báo rời sau khi xe dừng quá ngưỡng. */
  reason?: string | null;
};

/** from/to: YYYY-MM-DD (giờ VN). officeCode bỏ trống = toàn hệ thống. */
export function getVehicleEventReport(params: {
  from: string;
  to: string;
  officeCode?: string;
}): Promise<{ events: VehicleEventReportItem[]; itineraries?: ItineraryOption[] }> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.officeCode) q.set("officeCode", params.officeCode);
  return apiRequest(`/api/vehicle-events/report?${q.toString()}`);
}

export type ItineraryOption = { code: string; name: string };

/** Lộ trình VP báo giờ: options = mọi lộ trình qua điểm của VP; không tích gì = hiện tất cả. */
export type OfficeVehicleItineraryConfig = {
  officeId: number;
  officeName: string;
  options: { code: string; name: string; selected: boolean }[];
};

/** Public: mã VP → lộ trình VP báo giờ; VP không có trong map = chưa giới hạn. */
export function getAllOfficeVehicleItineraries() {
  return apiRequest<Record<string, string[]>>("/api/offices/vehicle-itineraries", { auth: false });
}

/** Lộ trình hợp lệ cho đơn từ VP gửi: VP gửi đã cấu hình "Lộ trình áp dụng" thì lộ trình phải nằm trong danh sách đó. */
export function itinerariesAllowedFrom<T extends { code?: string }>(
  itineraries: T[],
  fromCode: string | undefined,
  byOffice: Record<string, string[]>,
): T[] {
  const from = fromCode ? byOffice[fromCode] : undefined;
  if (!from?.length) return itineraries;
  return itineraries.filter((it) => !!it.code && from.includes(it.code));
}

export function getOfficeVehicleItineraries(officeId: number) {
  return apiRequest<OfficeVehicleItineraryConfig>(`/api/offices/${officeId}/vehicle-itineraries`);
}

export function saveOfficeVehicleItineraries(officeId: number, itineraryCodes: string[]) {
  return apiRequest<OfficeVehicleItineraryConfig>(`/api/offices/${officeId}/vehicle-itineraries`, {
    method: "PUT",
    body: { itineraryCodes },
  });
}
