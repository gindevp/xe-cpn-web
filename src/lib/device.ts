import { isNativeWebView } from "./native-shell";

/**
 * Điện thoại / máy tính bảng (có camera) — không phải máy tính để bàn.
 * Laptop/PC kể cả có webcam vẫn không mở quét: user không kỳ vọng cấp cam trên desktop.
 */
export function isHandheldCameraDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (isNativeWebView()) return true;
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  // iPadOS 13+ Safari: UA Macintosh + cảm ứng
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}
