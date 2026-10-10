/**
 * Tên người — chỉ chữ (kể cả dấu tiếng Việt) và khoảng trắng.
 *
 * Không viết lại chuỗi trong lúc gõ. Bộ gõ tiếng Việt xóa chữ cuối rồi thay;
 * ghi đè value hoặc chặn ký tự ẩn của bộ gõ làm mất chữ phía trước: VIỆT → ỆT.
 * Chữ hoa khi rời ô hoặc khi lưu.
 */

/** Ký tự không phải chữ hoặc khoảng trắng. */
const NOT_NAME_CHAR = /[^\p{L}\p{M}\s]/u;

/** Số, dấu câu, ký hiệu — bị dọn khỏi ô tên sau khi ngừng gõ. */
const BLOCKED_TYPING_CHAR = /[\p{N}\p{P}\p{S}]/gu;

/** true khi chuỗi có số/dấu câu/ký hiệu. */
export function hasBlockedTypingChar(s: string): boolean {
  BLOCKED_TYPING_CHAR.lastIndex = 0;
  return BLOCKED_TYPING_CHAR.test(String(s ?? ""));
}

/** Bỏ số/dấu câu/ký hiệu, giữ nguyên khoảng trắng. */
export function stripBlockedTypingChars(s: string): string {
  return String(s ?? "").replace(BLOCKED_TYPING_CHAR, "");
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
