const KEY = "xe.staleChunkReloadAt";
const MIN_GAP_MS = 30_000;

const STALE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return STALE_CHUNK.test(msg);
}

/** Bản deploy mới thay tên file JS — tab đang mở bản cũ tải lại một lần để lấy bản mới. */
export function reloadForStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < MIN_GAP_MS) return false;
  window.sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
  return true;
}

let installed = false;

export function installStaleChunkReload() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadForStaleChunk()) e.preventDefault();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isStaleChunkError(e.reason) && reloadForStaleChunk()) e.preventDefault();
  });
}
