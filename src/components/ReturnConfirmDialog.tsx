import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { useStore, type OrderX } from "@/lib/store";
import { assignedOfficeCode, resolveViewOffice } from "@/lib/office-scope";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { refreshOrdersNow } from "@/lib/use-orders-poll";

/**
 * Xác nhận hoàn thành công — bắt buộc ≥1 ảnh hoàn (lưu OrderPodPhoto qua return-complete).
 */
export function ReturnConfirmDialog({
  codes,
  open,
  onOpenChange,
  onFinished,
}: {
  codes: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFinished?: (codes: string[]) => void;
}) {
  const orders = useStore((s) => s.orders);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [actualName, setActualName] = useState("");
  const [actualPhone, setActualPhone] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const code = codes[idx];
  const order = useMemo(() => orders.find((o) => o.code === code), [orders, code]);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setDone([]);
  }, [open, codes]);

  useEffect(() => {
    setPhotos([]);
    // Người nhận hàng hoàn = người gửi gốc
    setActualName(order?.senderName || order?.receiverActualName || "");
    setActualPhone(order?.senderPhone || order?.receiverActualPhone || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, open]);

  const finish = (processed: string[]) => {
    onOpenChange(false);
    if (processed.length && useStore.getState().online) {
      toast.success(`Đã hoàn thành công ${processed.length} đơn`);
    }
    onFinished?.(processed);
    if (processed.length) void refreshOrdersNow();
  };

  const goNext = (processed: string[]) => {
    if (idx + 1 >= codes.length) finish(processed);
    else setIdx(idx + 1);
  };

  const confirm = () => {
    if (!order) return;
    const name = actualName.trim();
    if (!name) return toast.error("Nhập tên người nhận hàng hoàn");
    if (photos.length === 0) return toast.error("Cần ít nhất 1 ảnh hoàn");

    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    const photoSlice = photos.slice(0, 3);
    const podPhotos = photoSlice.map((url) => ({ at, by, url }));
    const actedOffice =
      assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice)) ||
      assignedOfficeCode(st.session?.office) ||
      "";
    const eventDetail = actedOffice
      ? `Hoàn thành công · VP=${actedOffice}`
      : "Hoàn thành công (có ảnh hoàn)";

    st.updateOrder(
      order.code,
      {
        returnStage: "RT_DONE",
        status: "RETURNED",
        receiverActualName: name,
        ...(actualPhone.trim() ? { receiverActualPhone: actualPhone.trim() } : {}),
        podPhotos,
        updatedAt: at,
      } as Partial<OrderX>,
      { eventAction: "RT_DONE", eventDetail },
    );
    st.audit({
      action: "RT_DONE",
      entityType: "order",
      entityId: order.code,
      detail: eventDetail,
    });

    const processed = [...done, order.code];
    setDone(processed);
    goNext(processed);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : finish(done))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Ảnh hoàn & xác nhận hoàn thành công
            {codes.length > 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Đơn {idx + 1}/{codes.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!order ? (
          <p className="text-sm text-destructive">Không tìm thấy đơn {code}</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{order.code}</span>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="mt-1 text-muted-foreground">
                Người gửi: {order.senderName ?? "—"} · {order.senderPhone}
              </div>
              <div className="text-muted-foreground">
                Người nhận gốc: {order.receiverName} · {order.receiverPhone}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tên người nhận hàng hoàn *</Label>
              <Input value={actualName} onChange={(e) => setActualName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SĐT người nhận hàng hoàn</Label>
              <Input value={actualPhone} onChange={(e) => setActualPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ảnh hoàn (1–3) *</Label>
              <PodPhotoInput photos={photos} onChange={setPhotos} max={3} />
              <p className="text-xs text-muted-foreground">
                Bấm nút chụp để mở camera. Ảnh giữ nguyên khung máy chụp và được nén trước khi lưu.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => finish(done)}>
            Hủy
          </Button>
          {codes.length > 1 && idx + 1 < codes.length && (
            <Button variant="ghost" onClick={() => goNext(done)}>
              Bỏ qua đơn này
            </Button>
          )}
          <Button className="gap-2" onClick={confirm} disabled={!order || photos.length === 0}>
            <Undo2 className="h-4 w-4" />
            Xác nhận hoàn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
