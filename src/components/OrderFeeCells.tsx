import type { ReactNode } from "react";
import { collectFormLabel, formatMoney, type Order } from "@/lib/mock-data";
import { orderDueAmount } from "@/lib/finance-debt";
import { orderGoodsFare, orderGoodsLabel, packageCount } from "@/lib/package-label";
import { cn } from "@/lib/utils";

/** Số cột phí của bảng đơn — COD, cước phí, số tiền còn phải thu. */
export const FEE_COL_COUNT = 3;

const TH = "px-2 py-2 font-semibold text-slate-500";

export function OrderFeeHeader({ className }: { className?: string }) {
  return (
    <>
      <th className={cn(TH, "text-right whitespace-nowrap", className)}>COD</th>
      <th className={cn(TH, "text-right whitespace-nowrap", className)}>Cước phí</th>
      <OrderDueHeader className={className} />
    </>
  );
}

export function OrderDueHeader({ className }: { className?: string }) {
  return (
    <th className={cn(TH, "text-right whitespace-nowrap", className)}>Số tiền còn phải thu</th>
  );
}

export function OrderDueCell({ order, className }: { order: Pick<Order, "fare" | "paidAmount" | "onCredit">; className?: string }) {
  return (
    <td className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap", className)}>
      <span className="font-semibold text-orange-600">{formatMoney(orderDueAmount(order))}</span>
    </td>
  );
}

/** Cột đơn hàng: số kiện và cân nặng. */
export function OrderCargoHeader({ className }: { className?: string }) {
  return <th className={cn(TH, "whitespace-nowrap", className)}>Đơn hàng</th>;
}

export function OrderCargoCell({
  order,
  count,
  className,
}: {
  order: Order;
  /** Tiến độ kiện (nhập kho). Không truyền thì hiện tổng số kiện. */
  count?: ReactNode;
  className?: string;
}) {
  const goods = orderGoodsLabel(order);
  return (
    <td className={cn("px-2 py-2", className)}>
      <div className="font-medium tabular-nums leading-tight">
        {count ?? `${packageCount(order)} kiện`}
      </div>
      {goods && goods !== "—" ? (
        <div className="max-w-[10rem] truncate text-xs text-muted-foreground" title={goods}>
          {goods}
        </div>
      ) : null}
      <div className="tabular-nums text-muted-foreground">{(order.weightKg ?? 0).toFixed(1)} kg</div>
    </td>
  );
}

/** Ô COD (tiền thu hộ) + ô cước phí; phí COD / phí tận nơi / KBGT chỉ hiện dòng khi có tiền. */
export function OrderFeeCell({
  order,
  className,
  children,
}: {
  order: Order;
  className?: string;
  children?: ReactNode;
}) {
  const cod = order.codAmount ?? 0;
  const codFee = order.codFee ?? 0;
  const pickup = order.pickupFee ?? 0;
  const delivery = order.deliveryFee ?? 0;
  const declared = order.declaredFee ?? 0;
  return (
    <>
      <td className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap", className)}>
        {cod > 0 ? <span className="font-medium">{formatMoney(cod)}</span> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap", className)}>
        <div className="font-medium">{formatMoney(orderGoodsFare(order))}</div>
        <div className="text-xs text-muted-foreground">{collectFormLabel(order.collectForm)}</div>
        {codFee > 0 ? <div className="text-xs">Phí COD {formatMoney(codFee)}</div> : null}
        {pickup > 0 ? <div className="text-xs">Lấy TN {formatMoney(pickup)}</div> : null}
        {delivery > 0 ? <div className="text-xs">Giao TN {formatMoney(delivery)}</div> : null}
        {declared > 0 ? (
          <div className="text-xs" title="Phí khai báo giá trị">
            KBGT {formatMoney(declared)}
          </div>
        ) : null}
        {children}
      </td>
      <OrderDueCell order={order} className={className} />
    </>
  );
}
