/**
 * Ô nhập số thập phân toàn dự án (cân nặng, km, %, định mức…):
 * dấu phẩy và dấu chấm đều là **dấu thập phân** — gõ `3,5` hay `3.5` đều ra `3.5`.
 *
 * Không dùng cho ô tiền VNĐ (xem MoneyInput) vì ở đó dấu phân cách là dấu nghìn.
 */

/** Giữ chữ số + 1 dấu thập phân, `,` → `.`. Không parse để còn gõ dở được `3.`. */
export function sanitizeDecimalText(raw: string): string {
  let s = String(raw ?? "")
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, ".");
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
}

/** Chỉ giữ chữ số — dùng cho ô số nguyên. */
export function sanitizeIntegerText(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

/** `""` / `"."` → null (ô trống). */
export function parseDecimalText(raw: string): number | null {
  const s = sanitizeDecimalText(raw).trim();
  if (!s || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
