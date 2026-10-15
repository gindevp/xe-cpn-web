import { apiRequest } from "./client";

const BASE = "/api/integration-config/bidv";

export type BidvConfig = {
  enabled: boolean;
  mode: string;
  serviceId?: string | null;
  vaPrefix?: string | null;
  allowedIps?: string | null;
  apiKey?: string | null;
  apiKeyRequired: boolean;
  checksumRequired: boolean;
  secretConfigured: boolean;
  updatedAt?: string | null;
};

/** Trường null/không gửi = giữ nguyên; secretCode rỗng = giữ secret cũ. */
export type BidvConfigUpdate = {
  enabled?: boolean;
  serviceId?: string;
  secretCode?: string;
  vaPrefix?: string;
  allowedIps?: string;
  apiKeyRequired?: boolean;
  checksumRequired?: boolean;
};

export type BidvTestBill = {
  id: number;
  customerId: string;
  virtualAccount: string;
  customerName: string;
  amount: number;
  remark?: string | null;
  createdAt?: string | null;
  paidTransId?: string | null;
  paidAt?: string | null;
};

export type BidvTestBillCreate = {
  customerId: string;
  customerName: string;
  amount: number;
  remark?: string;
};

export type BidvCallLog = {
  id: number;
  calledAt: string;
  endpoint: string;
  clientIp?: string | null;
  customerId?: string | null;
  transId?: string | null;
  amount?: number | null;
  resultCode?: string | null;
  resultDesc?: string | null;
  checksumVariant?: string | null;
  durationMs?: number | null;
  requestBody?: string | null;
  responseBody?: string | null;
};

export type BidvSampleRequest = {
  type: "getbill" | "paybill";
  customerId: string;
  transId?: string;
  amount?: number;
};

export type BidvSample = {
  path: string;
  body: Record<string, unknown>;
  checksumInput: string;
};

export const fetchBidvConfig = () => apiRequest<BidvConfig>(BASE);

export const putBidvConfig = (body: BidvConfigUpdate) =>
  apiRequest<BidvConfig>(BASE, { method: "PUT", body });

export const regenerateBidvApiKey = () =>
  apiRequest<BidvConfig>(`${BASE}/api-key/regenerate`, { method: "POST" });

export const fetchBidvTestBills = () => apiRequest<BidvTestBill[]>(`${BASE}/test-bills`);

export const addBidvTestBill = (body: BidvTestBillCreate) =>
  apiRequest<BidvTestBill[]>(`${BASE}/test-bills`, { method: "POST", body });

export const deleteBidvTestBill = (id: number) =>
  apiRequest<BidvTestBill[]>(`${BASE}/test-bills/${id}`, { method: "DELETE" });

export const resetBidvTestPayments = () =>
  apiRequest<BidvTestBill[]>(`${BASE}/test-bills/reset`, { method: "POST" });

export const fetchBidvLogs = (limit = 100) =>
  apiRequest<BidvCallLog[]>(`${BASE}/logs?limit=${limit}`);

export const buildBidvSample = (body: BidvSampleRequest) =>
  apiRequest<BidvSample>(`${BASE}/sample`, { method: "POST", body });
