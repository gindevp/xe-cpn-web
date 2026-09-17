import { useEffect } from "react";
import { isApiEnabled } from "./api/client";

let refreshInFlight: Promise<void> | null = null;

/** Làm mới đơn ngay (sau chuyển trạng thái) — merge, không wipe store. */
export async function refreshOrdersNow() {
  if (!isApiEnabled()) return;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const sync = await import("./api/sync");
      await sync.syncOrdersFromApi();
      await sync.syncTripsFromApi().catch(() => undefined);
    } catch {
      /* giữ dữ liệu hiện tại */
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Làm mới đơn (+ chuyến) theo chu kỳ để màn nhân viên gần realtime:
 * khách tạo đơn → Chờ bàn giao / badge; VP nhận quét-nhập → VP gửi thấy kiện rời xe.
 * Tạm dừng khi tab bị ẩn, làm mới ngay lúc mở trang và khi tab được xem lại.
 */
export function useOrdersPolling(intervalMs = 10000, enabled = true) {
  useEffect(() => {
    if (!enabled || !isApiEnabled() || intervalMs <= 0) return;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) return;
      await refreshOrdersNow();
    };

    const timer = window.setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
