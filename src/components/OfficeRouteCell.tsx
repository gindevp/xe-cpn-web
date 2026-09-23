import { ArrowDown } from "lucide-react";
import { officeName, orderReceiverOffice, type Order } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** Cột bảng: VP gửi (dòng trên) · mũi tên dọc nhỏ · VP nhận (dòng dưới). */
export function OfficeRouteCell({
  fromOffice,
  toOffice,
  order,
  className,
}: {
  fromOffice?: string | null;
  toOffice?: string | null;
  /** Nếu truyền order: VP nhận = finalToOffice || toOffice. */
  order?: Pick<Order, "fromOffice" | "toOffice" | "finalToOffice">;
  className?: string;
}) {
  const from = officeName(order?.fromOffice ?? fromOffice ?? "") || "—";
  const to =
    officeName(order ? orderReceiverOffice(order) : (toOffice ?? "")) || "—";
  return (
    <div className={cn("flex flex-col items-start leading-tight", className)}>
      <span className="whitespace-nowrap">{from}</span>
      <ArrowDown className="-translate-x-0.5 my-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="whitespace-nowrap">{to}</span>
    </div>
  );
}
