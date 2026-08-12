import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/PageBits";
import { formatDateTime } from "@/lib/mock-data";
import { useStore } from "@/lib/store";

const ACTION_LABEL: Record<string, string> = {
  CREATED: "Tạo đơn hàng",
  UPDATE: "Cập nhật đơn",
  CONFIRMED: "Xác nhận đơn",
  ASSIGNED: "Gán lên xe",
  LOADED: "Bàn giao tài xế / lên xe",
  IN_TRANSIT: "Xuất bến",
  AT_DEST: "Đến kho nhận",
  OUT_FOR_DELIVERY: "Đang giao",
  DELIVERED: "Giao thành công",
  CANCEL: "Huỷ đơn",
  CANCELLED: "Huỷ đơn",
  RETURNED: "Hoàn hàng",
  PAYMENT: "Thu tiền",
  POD: "Ảnh POD",
  SMS: "Gửi SMS",
  PRINT: "In đơn hàng",
};

export function OrderHistoryDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const orders = useStore((s) => s.orders);
  const order = code ? orders.find((o) => o.code === code) : null;
  const events = [...(order?.events ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Lịch sử đơn hàng {order ? `· ${order.code}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!order ? (
          <EmptyState>Không tìm thấy đơn</EmptyState>
        ) : events.length === 0 ? (
          <EmptyState>Chưa có lịch sử tác động</EmptyState>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Thời gian</th>
                  <th className="py-2 pr-4">Người thực hiện</th>
                  <th className="py-2 pr-4">Nội dung tác động</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(e.at)}
                    </td>
                    <td className="py-2 pr-4 font-medium">{e.by}</td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">
                        {ACTION_LABEL[e.action] ?? e.action}
                      </div>
                      {e.detail && (
                        <div className="text-xs text-muted-foreground">
                          {e.detail}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
