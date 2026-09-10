import { useEffect } from "react";
import { isApiEnabled } from "./api/client";

/**
 * Làm mới đơn (+ chuyến) theo chu kỳ để màn nhân viên gần realtime:
 * khách tạo đơn nháp → Chờ bàn giao / badge; VP nhận quét-nhập → VP gửi thấy kiện rời xe.
 * Tạm dừng khi tab bị ẩn, làm mới ngay lúc mở trang và khi tab được xem lại.
 */
export function useOrdersPolling(intervalMs = 10000, enabled = true) {
  useEffect(() => {
    if (!enabled || !isApiEnabled() || intervalMs <= 0) return;
    let stopped = false;
    let running = false;

    const tick = async () => {
      if (stopped || running) return;
      if (typeof document !== "undefined" && document.hidden) return;
      running = true;
      try {
        const sync = await import("./api/sync");
        await sync.syncOrdersFromApi();
        await sync.syncTripsFromApi().catch(() => undefined);
      } catch {
        /* giữ dữ liệu hiện tại, thử lại chu kỳ sau */
      } finally {
        running = false;
      }
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
