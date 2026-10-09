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
  /** Lý do khi báo rời muộn so với giờ đón. */
  reason?: string | null;
  /** Giờ đón tại VP = giờ xuất bến ± phút lệch của lộ trình (bản ghi cũ = giờ xuất bến). */
  pickupAt?: string | null;
  /** Lượt báo rời có ảnh xe — tải qua getVehicleEventPhoto. */
  hasPhoto?: boolean;
};

export function getVehicleEventPhoto(eventId: number) {
  return apiRequest<{ eventId: number; photo: string; capturedAt?: string | null; capturedBy?: string | null }>(
    `/api/vehicle-events/${eventId}/photo`,
  );
}

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
  /** offsetMinutes: phút lệch giờ đón so với giờ xuất bến (-120 = sớm 120p, 30 = muộn 30p). */
  options: { code: string; name: string; selected: boolean; offsetMinutes?: number | null }[];
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

export type VehicleDayItem = {
  externalTripId: string;
  vehiclePlate?: string | null;
  driverName?: string | null;
  routeLabel?: string | null;
  plannedDepartAt?: string | null;
  pickupAt?: string | null;
  arrivedAt?: string | null;
  arrivedBy?: string | null;
  departedAt?: string | null;
  departedBy?: string | null;
};

export type VehicleDayBoard = {
  officeCode: string;
  officeName: string;
  items: VehicleDayItem[];
};

/** Lộ trình VP của nhân viên đang đăng nhập báo giờ. */
export function getVehicleItineraries() {
  return apiRequest<ItineraryOption[]>("/api/vehicle-events/itineraries");
}

/** Xe CRM xuất bến hôm nay của một lộ trình, kèm giờ đã báo đến/rời tại VP. */
export function getVehicleDayTrips(itineraryCode: string) {
  const q = new URLSearchParams({ itineraryCode });
  return apiRequest<VehicleDayBoard>(`/api/vehicle-events/day-trips?${q}`);
}

export function getVehiclePhotoPolicy() {
  return apiRequest<{ departPhotoRequired: boolean }>("/api/vehicle-events/photo-policy");
}

export function saveVehiclePhotoPolicy(departPhotoRequired: boolean) {
  return apiRequest<{ departPhotoRequired: boolean }>("/api/vehicle-events/photo-policy", {
    method: "PUT",
    body: { departPhotoRequired },
  });
}

/** Báo lại cùng chuyến thì máy chủ trả giờ đã ghi. Không gửi ảnh. */
export function reportVehicleEvent(body: {
  eventType: "ARRIVE" | "DEPART";
  externalTripId: string;
  vehiclePlate?: string | null;
  driverName?: string | null;
  routeLabel?: string | null;
  plannedDepartAt?: string | null;
  itineraryCode?: string;
  reason?: string;
}) {
  return apiRequest<{ reportedAt?: string | null; reportedBy?: string | null }>("/api/vehicle-events", {
    method: "POST",
    body: { ...body, source: "CRM" },
  });
}

export function saveOfficeVehicleItineraries(
  officeId: number,
  itineraryCodes: string[],
  offsets: { code: string; offsetMinutes: number }[] = [],
) {
  return apiRequest<OfficeVehicleItineraryConfig>(`/api/offices/${officeId}/vehicle-itineraries`, {
    method: "PUT",
    body: { itineraryCodes, offsets },
  });
}
