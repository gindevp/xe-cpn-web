import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAGE_SIZE_OPTIONS, type Pager } from "@/lib/use-paged-rows";

function pageWindow(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push("…");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}

/** Ẩn khi tổng ≤ số dòng/trang nhỏ nhất (10). */
export function TablePagination({ pager, className }: { pager: Pager; className?: string }) {
  const { page, pageCount, pageSize, total, start, setPage, setPageSize } = pager;
  if (total <= PAGE_SIZE_OPTIONS[0]) return null;
  const end = Math.min(total, start + pageSize);

  return (
    <div className={cn("mt-3 flex flex-wrap items-center justify-between gap-2 text-sm", className)}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="tabular-nums">
          {start + 1}–{end} / {total}
        </span>
        <select
          aria-label="Số dòng mỗi trang"
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} dòng/trang
            </option>
          ))}
        </select>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(1)} aria-label="Trang đầu">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageWindow(page, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === page ? "default" : "ghost"}
                size="sm"
                className="h-8 min-w-8 px-2 tabular-nums"
                onClick={() => setPage(n)}
              >
                {n}
              </Button>
            ),
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Trang sau">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page >= pageCount} onClick={() => setPage(pageCount)} aria-label="Trang cuối">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
