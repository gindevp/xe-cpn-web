/**
 * Tên người — chỉ chữ (kể cả dấu tiếng Việt) và khoảng trắng.
 *
 * Chỉ chuẩn hoá khi **chốt giá trị** (blur/submit). Tuyệt đối không biến đổi chuỗi chữ
 * và không dùng CSS uppercase trong lúc đang gõ: bộ gõ tiếng Việt gửi backspace +
 * ký tự thay thế, viết lại hoặc text-transform làm mất chữ phía trước (VIỆT → ỆT).
 * Số và ký hiệu bị chặn ở beforeinput, không viết lại cả chuỗi. Xem NameInput.
 */

/** Ký tự không phải chữ hoặc khoảng trắng. */
const NOT_NAME_CHAR = /[^\p{L}\p{M}\s]/u;

/** true khi mọi ký tự là chữ hoặc khoảng trắng. */
export function isPersonNameText(s: string): boolean {
  return ![...String(s ?? "")].some((ch) => NOT_NAME_CHAR.test(ch));
}

/** Bỏ số/ký hiệu. Không gộp khoảng trắng — dùng khi đang gõ/dán. */
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
