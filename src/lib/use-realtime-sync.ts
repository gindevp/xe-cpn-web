import { useEffect } from "react";
import { getApiBase, getToken, isApiEnabled } from "./api/client";
import { refreshOrdersNow } from "./use-orders-poll";

/** Có SSE: chỉ đối soát toàn bộ định kỳ phòng lỡ sự kiện. */
const FULL_SYNC_CONNECTED_MS = 120_000;
/** Mất SSE (mạng chặn stream, BE restart…): quay về polling nhưng thưa hơn trước (4s). */
const FULL_SYNC_FALLBACK_MS = 15_000;
/** BE gửi ping mỗi 25s; quá ngưỡng này coi như kết nối chết. */
const STALE_MS = 60_000;
const CHANGE_DEBOUNCE_MS = 300;
const MAX_BACKOFF_MS = 30_000;

type ChangePayload = { orders?: string[]; trips?: string[] };

/** BE gửi event "autocall-error" chỉ cho người có quyền ghi màn Tích hợp. */
export const AUTO_CALL_ERROR_EVENT = "cpn:autocall-error";
export type AutoCallErrorPayload = {
  kind: "carrier" | "send";
  message?: string | null;
  orderCode?: string | null;
  phone?: string | null;
  refId?: string | null;
  callId?: string | null;
  sandbox?: boolean;
  provider?: "HHVN" | "VTECH" | null;
  at?: string;
};

/** BE gửi event "tax-lookup-error" (cùng nhóm người nhận) khi nguồn tra cứu MST lỗi / quá hạn. */
export const TAX_LOOKUP_ERROR_EVENT = "cpn:tax-lookup-error";
export type TaxLookupErrorPayload = {
  taxCode: string;
  code?: string | null;
  message?: string | null;
  by?: string | null;
  at?: string;
};

/**
 * Đồng bộ đơn/chuyến theo sự kiện server (SSE `/api/events/stream`) thay cho polling 4s.
 * Dùng fetch-stream (không phải EventSource) để gửi được header Authorization.
 */
export function useRealtimeSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isApiEnabled() || typeof window === "undefined") return;

    let stopped = false;
    let connected = false;
    let abort: AbortController | null = null;
    let retryTimer = 0;
    let staleTimer = 0;
    let changeTimer = 0;
    let lastFullSync = 0;
    let backoff = 2000;
    const pendingOrders = new Set<string>();
    let pendingTrips = false;

    const fullSync = () => {
      lastFullSync = Date.now();
      void refreshOrdersNow();
    };

    const flushChanges = async () => {
      changeTimer = 0;
      const codes = [...pendingOrders];
      const trips = pendingTrips;
      pendingOrders.clear();
      pendingTrips = false;
      try {
        const sync = await import("./api/sync");
        if (codes.length) await sync.syncOrdersByCodes(codes);
        if (trips) await sync.syncTripsFromApi();
      } catch {
        /* giữ dữ liệu hiện tại; lần đối soát định kỳ sẽ bù */
      }
    };

    const onChange = (payload: ChangePayload) => {
      for (const code of payload.orders ?? []) pendingOrders.add(code);
      if (payload.trips?.length) pendingTrips = true;
      if (!pendingOrders.size && !pendingTrips) return;
      if (!changeTimer)
        changeTimer = window.setTimeout(() => void flushChanges(), CHANGE_DEBOUNCE_MS);
    };

    const touch = () => {
      window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => abort?.abort(), STALE_MS);
    };

    const handleBlock = (block: string) => {
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const i = line.indexOf(":");
        const field = i < 0 ? line : line.slice(0, i);
        const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (event === "ready") {
        connected = true;
        backoff = 2000;
        // Kết nối (lại) xong: đối soát 1 lần để bù sự kiện lỡ trong lúc rớt.
        fullSync();
      } else if (event === "change" && data.length) {
        try {
          onChange(JSON.parse(data.join("\n")) as ChangePayload);
        } catch {
          /* payload hỏng — bỏ qua */
        }
      } else if ((event === "autocall-error" || event === "tax-lookup-error") && data.length) {
        try {
          const detail = JSON.parse(data.join("\n"));
          const name = event === "autocall-error" ? AUTO_CALL_ERROR_EVENT : TAX_LOOKUP_ERROR_EVENT;
          window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch {
          /* payload hỏng — bỏ qua */
        }
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void connect(), backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };

    const connect = async () => {
      if (stopped) return;
      const token = getToken();
      if (!token) {
        scheduleReconnect();
        return;
      }
      abort = new AbortController();
      try {
        const res = await fetch(`${getApiBase()}/api/events/stream`, {
          headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        touch();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          touch();
          buf += value.replace(/\r\n?/g, "\n");
          let idx = buf.indexOf("\n\n");
          while (idx >= 0) {
            handleBlock(buf.slice(0, idx));
            buf = buf.slice(idx + 2);
            idx = buf.indexOf("\n\n");
          }
        }
      } catch {
        /* rớt kết nối / bị abort — thử lại bên dưới */
      } finally {
        connected = false;
        window.clearTimeout(staleTimer);
      }
      scheduleReconnect();
    };

    const poll = window.setInterval(() => {
      if (document.hidden) return;
      const interval = connected ? FULL_SYNC_CONNECTED_MS : FULL_SYNC_FALLBACK_MS;
      if (Date.now() - lastFullSync >= interval) fullSync();
    }, 5_000);

    const onVisible = () => {
      if (!document.hidden && !connected) fullSync();
    };
    document.addEventListener("visibilitychange", onVisible);

    fullSync();
    void connect();

    return () => {
      stopped = true;
      abort?.abort();
      window.clearInterval(poll);
      window.clearTimeout(retryTimer);
      window.clearTimeout(staleTimer);
      window.clearTimeout(changeTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
