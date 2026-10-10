/**
 * Tên người — chỉ chữ (kể cả dấu tiếng Việt) và khoảng trắng.
 *
 * Không viết lại chuỗi trong lúc gõ. Bộ gõ tiếng Việt xóa chữ cuối rồi thay;
 * React ghi đè value (kể cả viết hoa) làm mất chữ phía trước: VIỆT → ỆT.
 * Chữ hoa khi rời ô hoặc khi lưu.
 */

/** Ký tự không phải chữ hoặc khoảng trắng. */
const NOT_NAME_CHAR = /[^\p{L}\p{M}\s]/u;

/** true khi mọi ký tự là chữ hoặc khoảng trắng. */
export function isPersonNameText(s: string): boolean {
  return ![...String(s ?? "")].some((ch) => NOT_NAME_CHAR.test(ch));
}

/** Bỏ số/ký hiệu. Không gộp khoảng trắng — dùng khi dán. */
export function stripNameChars(s: string): string {
  return [...String(s ?? "")].filter((ch) => !NOT_NAME_CHAR.test(ch)).join("");
}

/** Chốt tên: bỏ ký tự lạ, gộp khoảng trắng. Chữ hoa chỉ khi upper. */
export function normalizePersonName(s: string, upper = true): string {
  const cleaned = stripNameChars(s).replace(/\s+/g, " ").trim();
  return upper ? cleaned.toLocaleUpperCase("vi-VN") : cleaned;
}

/** Chuẩn hoá khi chốt tên trên đơn: chữ hoa tiếng Việt. */
export function toUpperName(s: string): string {
  return normalizePersonName(s, true);
}
