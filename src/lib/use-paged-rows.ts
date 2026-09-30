import { useCallback, useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const STORAGE_PREFIX = "xe.pageSize.";

function readPageSize(key: string): number {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  const n = Number(window.localStorage.getItem(STORAGE_PREFIX + key));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export type Pager = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** Chỉ số (0-based) của dòng đầu trang — cộng vào STT. */
  start: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
};

/**
 * Phân trang phía client cho bảng; số dòng/trang nhớ theo {@code key} (localStorage).
 * Không tự về trang 1 khi dữ liệu đổi (realtime) — chỉ kẹp lại nếu trang hiện tại vượt quá số trang.
 */
export function usePagedRows<T>(rows: readonly T[], key: string): { pageRows: T[]; pager: Pager } {
  const [pageSize, setPageSizeState] = useState(() => readPageSize(key));
  const [page, setPageState] = useState(1);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);

  useEffect(() => {
    if (page > pageCount) setPageState(pageCount);
  }, [page, pageCount]);

  const start = (current - 1) * pageSize;
  const pageRows = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);

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

  return {
    pageRows,
    pager: { page: current, pageCount, pageSize, total, start, setPage, setPageSize },
  };
}
