import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Printer, Trash2 } from "lucide-react";
import { formatVND, type Order } from "@/lib/mock-data";
import { packageCount, packageRows, warehouseInSeqs } from "@/lib/package-label";
import { Badge } from "@/components/ui/badge";

type Props = {
  order: Order;
  colSpan: number;
  onPrintPackage: (orderCode: string, seq: number) => void;
  onEditPackage?: (orderCode: string, seq: number) => void;
  onDeletePackage?: (orderCode: string, seq: number) => void;
  showInboundStatus?: boolean;
};

/** Dòng con liệt kê từng kiện dưới đơn hàng. */
export function OrderPackageListRow({
  order,
  colSpan,
  onPrintPackage,
  onEditPackage,
  onDeletePackage,
  showInboundStatus,
}: Props) {
  const pkgs = packageRows(order);
  const total = packageCount(order);
  const inCount = warehouseInSeqs(order).length;
  const canMutate = Boolean(onEditPackage || onDeletePackage);

  return (
    <tr className="border-b bg-muted/20 last:border-0">
      <td colSpan={colSpan} className="px-2 py-2">
        <div className="pl-6 sm:pl-8">
          {showInboundStatus ? (
            <div className="mb-1.5 text-xs text-muted-foreground">
              Nhập kho giao: <span className="font-semibold text-foreground">{inCount}/{total} kiện</span>
              {inCount < total ? ` · thiếu ${total - inCount} kiện` : " · đủ kiện"}
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
                  <th className="px-2 py-1.5 text-right">Cước</th>
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
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatVND(p.fare)}
                    </td>
                    {showInboundStatus ? (
                      <td className="px-2 py-1.5">
                        {p.inboundStatus === "IN" ? (
                          <Badge variant="secondary" className="font-normal">
                            Đã nhập kho
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            Còn thiếu
                          </Badge>
                        )}
                      </td>
                    ) : null}
                    <td className="px-2 py-1.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title={`Tác vụ kiện ${p.code}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
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
                        </DropdownMenuContent>
                      </DropdownMenu>
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
