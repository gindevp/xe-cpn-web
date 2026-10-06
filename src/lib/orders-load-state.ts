import { useSyncExternalStore } from "react";

/** Tiến độ lần tải tập đơn làm việc đầu tiên sau khi vào / F5 (các lần làm mới sau chạy ngầm). */
export type OrdersLoadState = { firstPageReady: boolean; fullyLoaded: boolean };

let state: OrdersLoadState = { firstPageReady: false, fullyLoaded: false };
const listeners = new Set<() => void>();

export function setOrdersLoadState(patch: Partial<OrdersLoadState>) {
  const next = { ...state, ...patch };
  if (next.firstPageReady === state.firstPageReady && next.fullyLoaded === state.fullyLoaded) return;
  state = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useOrdersLoadState(): OrdersLoadState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
