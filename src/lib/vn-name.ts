/**
 * Tên người — chỉ chữ (kể cả dấu tiếng Việt) và khoảng trắng.
 *
 * Bộ gõ (Unikey/EVKey) sửa chữ cuối bằng backspace rồi thay. Không dùng CSS uppercase,
 * và không viết hoa đúng ký tự đang gõ — nếu không, "VIỆT" bị nuốt thành "ỆT".
 * Chữ phía trước được hoa ngay; ký tự cuối hoa khi gõ tiếp, khi có dấu cách, hoặc khi blur.
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

const graphemes = (s: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(s)].map((part) => part.segment);
  }
  return [...s];
};

/**
 * Hoa phần đã gõ xong, giữ nguyên cụm cuối để bộ gõ còn sửa dấu.
 * Dấu cách ở cuối thì cả cụm trước đó được hoa luôn.
 */
export function upperExceptLastGrapheme(s: string): string {
  const parts = graphemes(s);
  if (parts.length <= 1) return s;
  const last = parts[parts.length - 1] ?? "";
  if (last.trim() === "") {
    return s.toLocaleUpperCase("vi-VN");
  }
  return parts.slice(0, -1).join("").toLocaleUpperCase("vi-VN") + last;
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
