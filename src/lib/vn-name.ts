/**
 * Tên người gửi/nhận — chữ hoa, không số/ký tự lạ.
 *
 * Chỉ chuẩn hoá khi **chốt giá trị** (blur/submit). Tuyệt đối không biến đổi chuỗi trong lúc
 * đang gõ: bộ gõ tiếng Việt (Unikey/EVKey…) gửi backspace + ký tự thay thế, nếu app viết lại
 * giá trị input xen giữa thì mất dấu (NGUYỄN → NGUYÊN). Xem components/NameInput.tsx.
 */

/** Ký tự không thuộc tên người: số, ký tự đặt dấu bộ gõ còn sót, ký hiệu lạ. */
const NOT_IN_NAME = /[0-9!@#$%&*_=[\]{};:<>/?\\|^~`'"+()]/g;

/** Chuẩn hoá khi chốt: bỏ ký tự lạ, gộp khoảng trắng, chữ hoa tiếng Việt. */
export function toUpperName(s: string): string {
  return String(s ?? "")
    .replace(NOT_IN_NAME, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("vi-VN");
}
