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
}): Promise<{ events: VehicleEventReportItem[] }> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.officeCode) q.set("officeCode", params.officeCode);
  return apiRequest(`/api/vehicle-events/report?${q.toString()}`);
}
