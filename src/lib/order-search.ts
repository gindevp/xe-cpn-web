import type { OrderX } from "./store";

/** Normalize phone for substring match (ignore spaces/dashes). */
export function digitsOnly(s?: string | null): string {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Match order by mã đơn / draft, SĐT gửi|nhận, tên người nhận (và gửi).
 * Phone needs ≥3 digits to avoid noisy matches.
 */
export function orderMatchesQuery(o: Pick<
  OrderX,
  "code" | "draftCode" | "receiverName" | "senderName" | "receiverPhone" | "senderPhone"
>, raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;
  const qLower = q.toLocaleLowerCase("vi-VN");
  const qDigits = digitsOnly(q);

  if (o.code?.toLocaleLowerCase("vi-VN").includes(qLower)) return true;
  if (o.draftCode?.toLocaleLowerCase("vi-VN").includes(qLower)) return true;

  if (o.receiverName?.toLocaleLowerCase("vi-VN").includes(qLower)) return true;
  if (o.senderName?.toLocaleLowerCase("vi-VN").includes(qLower)) return true;

  if (qDigits.length >= 3) {
    if (digitsOnly(o.receiverPhone).includes(qDigits)) return true;
    if (digitsOnly(o.senderPhone).includes(qDigits)) return true;
  }
  return false;
}

export function rankOrderMatch(
  o: Pick<OrderX, "code" | "draftCode" | "receiverName" | "receiverPhone" | "senderPhone">,
  raw: string,
): number {
  const q = raw.trim();
  const qLower = q.toLocaleLowerCase("vi-VN");
  const qDigits = digitsOnly(q);
  if (o.code?.toLocaleLowerCase("vi-VN") === qLower || o.draftCode?.toLocaleLowerCase("vi-VN") === qLower) {
    return 100;
  }
  if (o.code?.toLocaleLowerCase("vi-VN").startsWith(qLower)) return 90;
  if (qDigits.length >= 3 && (digitsOnly(o.receiverPhone) === qDigits || digitsOnly(o.senderPhone) === qDigits)) {
    return 80;
  }
  if (o.receiverName?.toLocaleLowerCase("vi-VN") === qLower) return 70;
  return 10;
}
