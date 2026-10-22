/** Mã trình duyệt cố định (admin duyệt DH/KT theo mã này). Xóa dữ liệu site / trình duyệt khác → phải duyệt lại. */
const KEY = "xe.deviceId";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `${Date.now().toString(16)}-${hex()}${hex()}-${hex()}${hex()}`;
}

export function getWebDeviceId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return randomId();
  }
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id?.trim()) {
      id = randomId();
      window.localStorage.setItem(KEY, id);
    }
    return id.trim();
  } catch {
    return randomId();
  }
}

/** Tên hiển thị cho admin: trình duyệt · hệ điều hành. */
export function getWebDeviceName(): string {
  if (typeof navigator === "undefined") return "Trình duyệt";
  const ua = navigator.userAgent || "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Trình duyệt";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return [browser, os].filter(Boolean).join(" · ") || "Trình duyệt";
}
