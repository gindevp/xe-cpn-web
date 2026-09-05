import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/PageBits";
import { formatVND } from "@/lib/mock-data";
import { packageCount, packageRows } from "@/lib/package-label";
import { useStore } from "@/lib/store";
import { Printer } from "lucide-react";

type Props = {
  code: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrintPackage: (orderCode: string, seq: number) => void;
};

/** Chọn kiện cần in tem — danh sách mã kiện của đơn. */
export function PrintPackagesDialog({ code, open, onOpenChange, onPrintPackage }: Props) {
  const orders = useStore((s) => s.orders);
  const order = code ? orders.find((o) => o.code === code) : null;
  const pkgs = order ? packageRows(order) : [];
  const total = order ? packageCount(order) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(92vw,520px)] max-w-[520px] flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>In các kiện{order ? ` · ${order.code}` : ""}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Chọn kiện để in tem 105×105 mm ({total} kiện).
          </p>
        </DialogHeader>

        {!order ? (
          <EmptyState>Không tìm thấy đơn</EmptyState>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">STT</th>
                  <th className="px-3 py-2">Mã kiện</th>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2 text-right">Cước</th>
                  <th className="w-20 px-3 py-2 text-right">In</th>
                </tr>
              </thead>
              <tbody>
                {pkgs.map((p) => (
                  <tr key={p.code} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.seq}/{total}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium">{p.code}</td>
                    <td className="px-3 py-2">{p.label || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatVND(p.fare)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2"
                        onClick={() => onPrintPackage(order.code, p.seq)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        In
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
