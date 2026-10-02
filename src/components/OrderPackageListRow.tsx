import { Fragment } from "react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { type Order } from "@/lib/mock-data";
import { packageCount, packageRows, warehouseInSeqs } from "@/lib/package-label";
import { Badge } from "@/components/ui/badge";

type Props = {
  order: Order;
  /** panel = bảng con (màn vận đơn); rows = dòng kiện cùng cột với đơn (nhập kho). */
  layout?: "panel" | "rows";
  /** Chỉ dùng layout=panel. */
  colSpan?: number;
  /**
   * layout=rows: số ô trống đầu hàng (checkbox) + số cột phí + có cột shipper tạm tính.
   * Cấu trúc cột đơn: [leading?] mã | gửi | nhận | VP | kiện | KL | fees | [shipper?] | tác vụ
   */
  leadingCols?: number;
  feeCols?: number;
  extraTailCols?: number;
  onPrintPackage: (orderCode: string, seq: number) => void;
  onEditPackage?: (orderCode: string, seq: number) => void;
  onDeletePackage?: (orderCode: string, seq: number) => void;
  /**
   * Hiện trạng thái quét nhập kho giao của từng kiện:
   * ON_TRUCK = tab hàng trên xe (kiện chưa quét là còn trên xe, bình thường);
   * DEST_WH_IN = tab nhập kho giao (kiện chưa quét là đang thiếu, cần tìm).
   */
  inboundContext?: "ON_TRUCK" | "DEST_WH_IN";
};

const INBOUND_BADGE = {
  ON_TRUCK: {
    IN: { text: "Đã xuống kho giao", hint: "Kiện đã được quét nhập tại VP nhận", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
    MISSING: { text: "Còn trên xe", hint: "Kiện đang vận chuyển, chưa quét nhập tại VP nhận", cls: "border-sky-300 bg-sky-50 text-sky-700" },
  },
  DEST_WH_IN: {
    IN: { text: "Đã nhập kho giao", hint: "Kiện đã được quét nhập tại VP nhận", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
    MISSING: { text: "Chưa quét nhập", hint: "Đơn đã nhập một phần — kiện này chưa được quét tại VP nhận, cần kiểm tra trên xe / kho", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  },
} as const;

function InboundBadge({ context, status }: { context: "ON_TRUCK" | "DEST_WH_IN"; status: "IN" | "MISSING" }) {
  const b = INBOUND_BADGE[context][status];
  return (
    <Badge variant="outline" title={b.hint} className={`whitespace-nowrap border font-normal ${b.cls}`}>
      {b.text}
    </Badge>
  );
}

/** Dòng / khối liệt kê từng kiện dưới đơn hàng. */
export function OrderPackageListRow({
  order,
  layout = "panel",
  colSpan = 1,
  leadingCols = 0,
  feeCols = 1,
  extraTailCols = 0,
  onPrintPackage,
  onEditPackage,
  onDeletePackage,
  inboundContext,
}: Props) {
  const showInboundStatus = Boolean(inboundContext);
  const pkgs = packageRows(order);
  const total = packageCount(order);
  const inCount = warehouseInSeqs(order).length;
  const canMutate = Boolean(onEditPackage || onDeletePackage);

  if (layout === "rows") {
    return (
      <Fragment>
        {pkgs.map((p) => (
          <tr key={p.code} className="border-b bg-muted/25 text-sm last:border-0 hover:bg-muted/40">
            {Array.from({ length: leadingCols }).map((_, i) => (
              <td key={`pad-${i}`} className="px-2 py-2" />
            ))}
            <td className="px-2 py-2 pl-10 font-mono text-xs font-medium text-muted-foreground">
              {p.code}
            </td>
            <td className="px-2 py-2 text-muted-foreground">{p.label || "—"}</td>
            <td className="px-2 py-2 text-muted-foreground">Số lượng {p.itemQty}</td>
            <td className="px-2 py-2 text-muted-foreground">
              Khối lượng {p.weightKg != null ? p.weightKg.toFixed(1) : "—"}
            </td>
            <td className="px-2 py-2">
              {inboundContext ? (
                <InboundBadge context={inboundContext} status={p.inboundStatus} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Kiện {p.seq}/{total}
                </span>
              )}
            </td>
            <td className="px-2 py-2" />
            {Array.from({ length: feeCols }).map((_, i) => (
              <td key={`fee-${i}`} className="px-2 py-2" />
            ))}
            {Array.from({ length: extraTailCols }).map((_, i) => (
              <td key={`tail-${i}`} className="px-2 py-2" />
            ))}
            <td className="px-2 py-2 text-right">
              <RowActionsMenu
                title={`Tác vụ kiện ${p.code}`}
                contentClassName="w-44"
                buttonClassName="h-7 w-7"
              >
                <DropdownMenuItem onClick={() => onPrintPackage(order.code, p.seq)}>
                  <Printer className="mr-2 h-4 w-4" /> In tem kiện
                </DropdownMenuItem>
                {onEditPackage ? (
                  <DropdownMenuItem onClick={() => onEditPackage(order.code, p.seq)}>
                    <Pencil className="mr-2 h-4 w-4" /> Sửa kiện
                  </DropdownMenuItem>
                ) : null}
                {onDeletePackage ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={total <= 1}
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDeletePackage(order.code, p.seq)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Xóa kiện
                    </DropdownMenuItem>
                  </>
                ) : null}
              </RowActionsMenu>
            </td>
          </tr>
        ))}
      </Fragment>
    );
  }

  return (
    <tr className="border-b bg-muted/20 last:border-0">
      <td colSpan={colSpan} className="px-2 py-2">
        <div className="pl-6 sm:pl-8">
          {showInboundStatus ? (
            <div className="mb-1.5 text-xs text-muted-foreground">
              Đã quét nhập kho giao: <span className="font-semibold text-foreground">{inCount}/{total} kiện</span>
              {inCount >= total
                ? " · đủ kiện"
                : inboundContext === "ON_TRUCK"
                  ? ` · ${total - inCount} kiện còn trên xe`
                  : ` · còn ${total - inCount} kiện chưa quét`}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border bg-background/80">
            <table className={`w-full text-xs ${showInboundStatus ? "min-w-[780px]" : "min-w-[680px]"}`}>
              <thead>
                <tr className="border-b text-left uppercase text-muted-foreground">
                  <th className="w-12 px-2 py-1.5">STT</th>
                  <th className="px-2 py-1.5">Mã kiện</th>
                  <th className="px-2 py-1.5">Loại hàng</th>
                  <th className="px-2 py-1.5 text-right">SL</th>
                  <th className="px-2 py-1.5 text-right">KL (kg)</th>
                  {showInboundStatus ? <th className="px-2 py-1.5">Trạng thái</th> : null}
                  <th className="w-12 px-2 py-1.5 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {pkgs.map((p) => (
                  <tr key={p.code} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {p.seq}/{total}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-medium">{p.code}</td>
                    <td className="px-2 py-1.5">{p.label || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.itemQty}</td>
                    <td className="px-2 py-1.5 text-right">
                      {p.weightKg != null ? p.weightKg.toFixed(2) : "—"}
                    </td>
                    {inboundContext ? (
                      <td className="px-2 py-1.5">
                        <InboundBadge context={inboundContext} status={p.inboundStatus} />
                      </td>
                    ) : null}
                    <td className="px-2 py-1.5 text-right">
                      <RowActionsMenu
                        title={`Tác vụ kiện ${p.code}`}
                        contentClassName="w-44"
                        buttonClassName="h-7 w-7"
                      >
                        <DropdownMenuItem onClick={() => onPrintPackage(order.code, p.seq)}>
                          <Printer className="mr-2 h-4 w-4" /> In tem kiện
                        </DropdownMenuItem>
                        {onEditPackage ? (
                          <DropdownMenuItem onClick={() => onEditPackage(order.code, p.seq)}>
                            <Pencil className="mr-2 h-4 w-4" /> Sửa kiện
                          </DropdownMenuItem>
                        ) : null}
                        {onDeletePackage ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={total <= 1}
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDeletePackage(order.code, p.seq)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Xóa kiện
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </RowActionsMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canMutate && total <= 1 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Đơn 1 kiện — không xóa kiện cuối.</p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
