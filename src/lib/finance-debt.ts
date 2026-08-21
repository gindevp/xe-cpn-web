import type { Order } from "./mock-data";
import type { OrderX } from "./store";

export const UNKNOWN_DEBT_OWNER = "__unknown__";
export const UNKNOWN_DEBT_OWNER_LABEL = "Chưa xác định";

export function orderDueAmount(o: Pick<Order, "fare" | "paidAmount">, apiDue?: number): number {
  if (apiDue != null && Number.isFinite(apiDue)) return Math.max(0, apiDue);
  return Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0));
}

export function debtOwnerForOrder(o: OrderX, apiOwner?: string | null): string {
  const fromApi = apiOwner?.trim();
  if (fromApi) return fromApi;
  const payments = o.payments ?? [];
  if (payments.length) {
    const last = [...payments].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (last?.by?.trim()) return last.by.trim();
  }
  if (o.pickupStaff?.trim()) return o.pickupStaff.trim();
  const created = (o.events ?? []).find((e) => e.action === "CREATED");
  if (created?.by?.trim()) return created.by.trim();
  return UNKNOWN_DEBT_OWNER;
}

export function debtOwnerLabel(owner: string): string {
  return owner === UNKNOWN_DEBT_OWNER ? UNKNOWN_DEBT_OWNER_LABEL : owner;
}
