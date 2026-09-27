import { apiRequest } from "./client";

export type OfficeNetwork = {
  id: number;
  ipAddress: string;
  label?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
};

export function listOfficeNetworks(officeId: number): Promise<OfficeNetwork[]> {
  return apiRequest<OfficeNetwork[]>(`/api/offices/${officeId}/networks`);
}

export function addOfficeNetwork(officeId: number, ipAddress: string, label?: string): Promise<OfficeNetwork> {
  return apiRequest<OfficeNetwork>(`/api/offices/${officeId}/networks`, {
    method: "POST",
    body: { ipAddress, label },
  });
}

export function deleteOfficeNetwork(officeId: number, networkId: number): Promise<void> {
  return apiRequest<void>(`/api/offices/${officeId}/networks/${networkId}`, { method: "DELETE" });
}

export type AttendanceReportStaff = {
  login: string;
  staffCode?: string | null;
  displayName?: string | null;
  officeCode?: string | null;
  officeName?: string | null;
  active: boolean;
};

export type AttendanceReportRecord = {
  id: number;
  login: string;
  officeCode: string;
  officeName: string;
  checkedAt: string;
  clientIp?: string | null;
};

export type AttendanceReport = { staff: AttendanceReportStaff[]; records: AttendanceReportRecord[] };

/** from/to: YYYY-MM-DD (giờ VN). officeCode / login bỏ trống = toàn hệ thống. */
export function getAttendanceReport(params: {
  from: string;
  to: string;
  officeCode?: string;
  login?: string;
}): Promise<AttendanceReport> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.officeCode) q.set("officeCode", params.officeCode);
  if (params.login) q.set("login", params.login);
  return apiRequest<AttendanceReport>(`/api/attendance/report?${q.toString()}`);
}

export function getAttendancePhoto(id: number): Promise<{ id: number; photo: string | null }> {
  return apiRequest(`/api/attendance/records/${id}/photo`);
}

/** IP công cộng máy chủ đang thấy cho trình duyệt này. */
export function getMyPublicIp(): Promise<{ ip: string | null; forwardedFor?: string | null }> {
  return apiRequest(`/api/attendance/my-ip`);
}
