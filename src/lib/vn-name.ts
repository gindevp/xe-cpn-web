/**
 * Tên người — chỉ chữ (kể cả dấu tiếng Việt) và khoảng trắng.
 *
 * Không viết lại chuỗi trong lúc gõ. Bộ gõ tiếng Việt xóa chữ cuối rồi thay;
 * ghi đè value hoặc chặn ký tự ẩn của bộ gõ làm mất chữ phía trước: VIỆT → ỆT.
 * Chữ hoa khi rời ô hoặc khi lưu.
 */

/** Ký tự không phải chữ hoặc khoảng trắng. */
const NOT_NAME_CHAR = /[^\p{L}\p{M}\s]/u;

/**
 * Số, dấu câu, ký hiệu — chặn được ngay lúc gõ.
 * Không gồm ký tự ẩn (U+200B, U+202F…) mà Unikey/EVKey chèn rồi xoá để đặt dấu:
 * chặn chúng thì backspace của bộ gõ xoá nhầm chữ thật.
 */
const BLOCKED_TYPING_CHAR = /[\p{N}\p{P}\p{S}]/u;

/** true khi chuỗi gõ vào có số/dấu câu/ký hiệu. */
export function hasBlockedTypingChar(s: string): boolean {
  return BLOCKED_TYPING_CHAR.test(String(s ?? ""));
}

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
