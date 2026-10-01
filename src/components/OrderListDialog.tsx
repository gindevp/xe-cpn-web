import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatMoney, type Order } from "@/lib/mock-data";
import type { OrderX } from "@/lib/store";

export type OrderListRow = { order: Order; at?: string };

/** Số đơn trong bảng báo cáo: bấm để xem danh sách; 0 hiện "-". */
export function CountButton({ value, onClick }: { value: number; onClick: () => void }) {
  if (value === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <button
      type="button"
      className="font-semibold text-primary underline-offset-2 hover:underline"
      onClick={onClick}
    >
      {value}
    </button>
  );
}

/** Popup liệt kê các đơn đứng sau một con số trong báo cáo. */
export function OrderListDialog({
  title,
  description,
  timeLabel = "Thời điểm",
  rows,
  onClose,
}: {
  title: string;
  description?: string;
  timeLabel?: string;
  rows: OrderListRow[] | null;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = rows ?? [];
    if (!kw) return list;
    return list.filter(({ order: o }) =>
      [o.code, o.receiverName, o.receiverPhone, o.senderName, o.senderPhone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw)),
    );
  }, [rows, q]);

  return (
    <Dialog
      open={rows !== null}
      onOpenChange={(v) => {
        if (!v) {
          setQ("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {title} · {rows?.length ?? 0} đơn
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm mã đơn / tên / SĐT"
          className="h-9"
        />
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="w-12 px-2 py-2">STT</th>
                <th className="px-2 py-2">Mã đơn</th>
                <th className="px-2 py-2">Trạng thái</th>
                <th className="px-2 py-2">VP gửi → VP nhận</th>
                <th className="px-2 py-2">Người nhận</th>
                <th className="px-2 py-2">{timeLabel}</th>
                <th className="px-2 py-2 text-right">Cước</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                    Không có đơn
                  </td>
                </tr>
              ) : (
                filtered.map(({ order: o, at }, i) => (
                  <tr key={`${o.code}-${i}`} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2 font-medium">
                      <OrderCodeLink code={o.code} />
                    </td>
                    <td className="px-2 py-2">
                      <OrderStatusBadge status={o.status} issue={(o as OrderX).issue} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      <OfficeRouteCell order={o} />
                    </td>
                    <td className="px-2 py-2">
                      <div>{o.receiverName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.receiverPhone}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                      {at ? formatDateTime(at) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(o.fare ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
