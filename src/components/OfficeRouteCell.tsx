import { ArrowDown } from "lucide-react";
import { officeName, orderReceiverOffice, type Order } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** Cột bảng: VP gửi (dòng trên) · mũi tên dọc nhỏ · VP nhận (dòng dưới). */
export function OfficeRouteCell({
  fromOffice,
  toOffice,
  order,
  className,
  destDoor,
}: {
  fromOffice?: string | null;
  toOffice?: string | null;
  /** Nếu truyền order: VP nhận = finalToOffice || toOffice. */
  order?: Pick<Order, "fromOffice" | "toOffice" | "finalToOffice" | "address" | "homeDelivery">;
  className?: string;
  /** Nhập kho giao, đơn giao tận nơi: chỉ VP nhận rồi địa chỉ giao (không hiện VP gửi). */
  destDoor?: boolean;
}) {
  const from = officeName(order?.fromOffice ?? fromOffice ?? "") || "—";
  const to =
    officeName(order ? orderReceiverOffice(order) : (toOffice ?? "")) || "—";
  const door = order?.homeDelivery === false ? "" : order?.address?.trim() ?? "";
  if (destDoor && order?.homeDelivery) {
    return (
      <div className={cn("flex max-w-[280px] flex-col items-start leading-tight", className)}>
        <span className="whitespace-nowrap text-sm">{to}</span>
        <ArrowDown className="-translate-x-0.5 my-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
        <span className="mt-0.5 whitespace-normal break-words text-base font-semibold leading-snug text-foreground">
          {door || "—"}
        </span>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-start leading-tight", className)}>
      <span className="whitespace-nowrap">{from}</span>
      <ArrowDown className="-translate-x-0.5 my-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="whitespace-nowrap">{to}</span>
      {door ? (
        <span className="mt-1 max-w-[220px] whitespace-normal break-words text-[11px] text-muted-foreground">
          {door}
        </span>
      ) : null}
    </div>
  );
}
