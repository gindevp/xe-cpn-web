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

/** IP công cộng máy chủ đang thấy cho trình duyệt này. */
export function getMyPublicIp(): Promise<{ ip: string | null; forwardedFor?: string | null }> {
  return apiRequest(`/api/attendance/my-ip`);
}
