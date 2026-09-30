import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE_OPTIONS, type Pager } from "./use-paged-rows";

const DEFAULT_PAGE_SIZE = 10;
const STORAGE_PREFIX = "xe.pageSize.";

function readPageSize(key: string): number {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  const n = Number(window.localStorage.getItem(STORAGE_PREFIX + key));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export type ServerPage<T, M = undefined> = { rows: T[]; total: number; meta?: M };

/**
 * Phân trang phía server: mỗi lần đổi trang / số dòng / bộ lọc ({@code filterKey}) gọi {@code fetchPage} lấy đúng trang đó.
 * {@code page} truyền vào fetchPage là 0-based. Đổi bộ lọc thì về trang 1.
 */
export function useServerPagedRows<T, M = undefined>(
  key: string,
  filterKey: string,
  fetchPage: (page: number, size: number) => Promise<ServerPage<T, M>>,
  enabled = true,
) {
  const [pageSize, setPageSizeState] = useState(() => readPageSize(key));
  const [page, setPageState] = useState(1);
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<M | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const [lastFilter, setLastFilter] = useState(filterKey);
  if (lastFilter !== filterKey) {
    setLastFilter(filterKey);
    setPageState(1);
  }
  const effectivePage = lastFilter !== filterKey ? 1 : page;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    fetchRef
      .current(effectivePage - 1, pageSize)
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        setMeta(res.meta);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được dữ liệu");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePage, pageSize, filterKey, reloadTick, enabled]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (!loading && page > pageCount) setPageState(pageCount);
  }, [loading, page, pageCount]);

  const setPage = useCallback((p: number) => setPageState(Math.max(1, p)), []);
  const setPageSize = useCallback(
    (size: number) => {
      setPageSizeState(size);
      setPageState(1);
      try {
        window.localStorage.setItem(STORAGE_PREFIX + key, String(size));
      } catch {
        /* private mode */
      }
    },
    [key],
  );
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const pager: Pager = {
    page: effectivePage,
    pageCount,
    pageSize,
    total,
    start: (effectivePage - 1) * pageSize,
    setPage,
    setPageSize,
  };
  return { pageRows: rows, pager, total, meta, loading, error, reload, setRows };
}
