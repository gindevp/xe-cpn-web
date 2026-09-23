import type { ButtonHTMLAttributes, ReactNode } from "react";
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
