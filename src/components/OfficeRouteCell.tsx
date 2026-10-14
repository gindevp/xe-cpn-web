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
  order?: Pick<Order, "fromOffice" | "toOffice" | "finalToOffice" | "address" | "homeDelivery"> & {
    hubOffice?: string;
  };
  className?: string;
}) {
  const from = officeName(order?.fromOffice ?? fromOffice ?? "") || "—";
  const to =
    officeName(order ? orderReceiverOffice(order) : (toOffice ?? "")) || "—";
  const door = order?.homeDelivery === false ? "" : order?.address?.trim() ?? "";
  const hub = order?.hubOffice?.trim() ?? "";
  return (
    <div className={cn("flex flex-col items-start leading-tight", className)}>
      <span className="whitespace-nowrap">{from}</span>
      <ArrowDown className="-translate-x-0.5 my-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="whitespace-nowrap">{to}</span>
      {hub ? <TransitTag hubOffice={hub} className="mt-1" /> : null}
      {door ? (
        <span className="mt-1 max-w-[220px] whitespace-normal break-words text-[11px] text-muted-foreground">
          {door}
        </span>
      ) : null}
    </div>
  );
}

/** Tag đơn trung chuyển (tỉnh → tỉnh qua VP trung chuyển). */
export function TransitTag({ hubOffice, className }: { hubOffice: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border border-violet-200 bg-violet-50 px-1.5 py-px text-[11px] font-medium text-violet-700",
        className,
      )}
      title={`Đơn trung chuyển qua ${officeName(hubOffice) || hubOffice}`}
    >
      Trung chuyển · {officeName(hubOffice) || hubOffice}
    </span>
  );
}
