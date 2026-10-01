import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Tab giai đoạn trong màn — pill nhẹ (đổi với topbar đậm). */
export function stageTabClass(active: boolean) {
  return cn(
    "inline-flex h-9 max-w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:h-10 sm:px-3.5 sm:text-sm md:h-11 md:px-5 md:text-[15px]",
    active
      ? "bg-[#E8EEF8] text-[#274EA1] shadow-sm ring-1 ring-[#274EA1]/15"
      : "bg-slate-100/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  );
}

/** Hàng tab luôn wrap đủ trên màn — không cuộn ngang ẩn tab. */
export function StageTabRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex w-full min-w-0 flex-wrap items-center gap-2 md:gap-2.5", className)}>
      {children}
    </div>
  );
}

export function StageTabButton({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; children: ReactNode }) {
  return (
    <button type="button" className={cn(stageTabClass(active), className)} {...props}>
      <span className="min-w-0 text-left leading-snug">{children}</span>
    </button>
  );
}

/** Bộ lọc ngày + tìm kiếm nằm cùng hàng tab (bên phải) — lọc chung cho mọi tab. */
export function StageTabFilters({
  from,
  to,
  q,
  onFrom,
  onTo,
  onQ,
  placeholder,
  children,
}: {
  from: string;
  to: string;
  q: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onQ: (v: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
      {children}
      <Input
        type="date"
        className="h-9 w-[140px]"
        title="Từ ngày"
        aria-label="Từ ngày"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
      />
      <span className="text-muted-foreground">–</span>
      <Input
        type="date"
        className="h-9 w-[140px]"
        title="Đến ngày"
        aria-label="Đến ngày"
        value={to}
        onChange={(e) => onTo(e.target.value)}
      />
      <div className="relative w-56">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="h-9 pl-8" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}

/** Có từ khoá mà tab đang mở không còn đơn khớp → nhảy sang tab đầu tiên có đơn khớp. */
export function useJumpToMatchingTab<K extends string>(
  q: string,
  tab: K,
  counts: Partial<Record<K, number>>,
  keys: readonly K[],
  setTab: (k: K) => void,
) {
  useEffect(() => {
    if (!q.trim() || (counts[tab] ?? 0) > 0) return;
    const next = keys.find((k) => (counts[k] ?? 0) > 0);
    if (next) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nhảy khi từ khoá/kết quả đổi, không chặn bấm tay sang tab rỗng
  }, [q, counts]);
}
