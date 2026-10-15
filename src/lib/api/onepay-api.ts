import { apiRequest } from "./client";

const BASE = "/api/integration-config/onepay";

export type OnePayConfig = {
  enabled: boolean;
  environment: "SANDBOX" | "PRODUCTION";
  baseUrl: string;
  partnerId?: string | null;
  partnerKeyConfigured: boolean;
  bankSwift?: string | null;
  ipnUrl?: string | null;
  invoiceTtlHours: number;
  signatureRequired: boolean;
  insecureSsl: boolean;
  updatedAt?: string | null;
};

/** Trường không gửi = giữ nguyên; partnerKey rỗng = giữ key cũ. */
export type OnePayConfigUpdate = {
  enabled?: boolean;
  environment?: "SANDBOX" | "PRODUCTION";
  partnerId?: string;
  partnerKey?: string;
  bankSwift?: string;
  ipnUrl?: string;
  invoiceTtlHours?: number;
  signatureRequired?: boolean;
  insecureSsl?: boolean;
};

export type OnePayInvoiceState = "UNPAID" | "PAID" | "EXPIRED" | "AMOUNT_MISMATCH";

export type OnePayInvoice = {
  id: number;
  purpose: string;
  userReference: string;
  invoiceReference: string;
  payerName: string;
  amount: number;
  description?: string | null;
  state: OnePayInvoiceState;
  accountNumber?: string | null;
  bankName?: string | null;
  qrData?: string | null;
  vaState?: string | null;
  expiresAt?: string | null;
  paidTransId?: string | null;
  paidAmount?: number | null;
  paidAt?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type OnePayCallLog = {
  id: number;
  calledAt: string;
  direction: "IN" | "OUT";
  action: string;
  httpStatus?: number | null;
  result: string;
  message?: string | null;
  reference?: string | null;
  transId?: string | null;
  amount?: number | null;
  clientIp?: string | null;
  durationMs?: number | null;
  requestBody?: string | null;
  responseBody?: string | null;
};

export type OnePaySampleIpn = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type OnePayTestResult = {
  ok: boolean;
  message: string;
  httpStatus?: number | null;
  response?: string | null;
};

export const fetchOnePayConfig = () => apiRequest<OnePayConfig>(BASE);

export const putOnePayConfig = (body: OnePayConfigUpdate) =>
  apiRequest<OnePayConfig>(BASE, { method: "PUT", body });

export const testOnePayConnection = () =>
  apiRequest<OnePayTestResult>(`${BASE}/test-connection`, { method: "POST" });

export const fetchOnePayInvoices = () => apiRequest<OnePayInvoice[]>(`${BASE}/invoices`);

export const createOnePayInvoice = (body: {
  payerName: string;
  amount: number;
  description?: string;
}) => apiRequest<OnePayInvoice>(`${BASE}/invoices`, { method: "POST", body });

export const refreshOnePayInvoice = (id: number) =>
  apiRequest<OnePayInvoice>(`${BASE}/invoices/${id}/refresh`, { method: "POST" });

export const setOnePayAccountState = (id: number, active: boolean) =>
  apiRequest<OnePayInvoice>(`${BASE}/invoices/${id}/account-state?active=${active}`, {
    method: "POST",
  });

export const deleteOnePayInvoice = (id: number) =>
  apiRequest<OnePayInvoice[]>(`${BASE}/invoices/${id}`, { method: "DELETE" });

export const buildOnePaySampleIpn = (body: {
  invoiceId: number;
  amount?: number;
  apiBase?: string;
}) => apiRequest<OnePaySampleIpn>(`${BASE}/sample-ipn`, { method: "POST", body });

export const fetchOnePayLogs = (limit = 100) =>
  apiRequest<OnePayCallLog[]>(`${BASE}/logs?limit=${limit}`);
