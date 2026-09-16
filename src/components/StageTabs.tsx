import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tab giai đoạn trong màn — pill nhẹ (đổi với topbar đậm). */
export function stageTabClass(active: boolean) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
    active
      ? "bg-[#E8EEF8] text-[#274EA1] shadow-sm ring-1 ring-[#274EA1]/15"
      : "bg-slate-100/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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
      {children}
    </button>
  );
}
