import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { useStore } from "@/lib/store";
import { orderDueAmount } from "@/lib/finance-debt";
import { formatVND } from "@/lib/mock-data";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";

/**
 * Bước POD trước khi chuyển DELIVERED (shipper giao tận nhà).
 * Ảnh POD bắt buộc ≥1 — action "POD" đẩy lên BE POST /api/orders/{code}/pod.
 * Không thu tiền tại bước này (giữ nguyên hành vi nút "Giao thành công" cũ).
 */
export function PodConfirmDialog({
  codes,
  open,
  onOpenChange,
  onFinished,
}: {
  codes: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFinished?: (deliveredCodes: string[]) => void;
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
    setActualName(order?.receiverActualName || order?.receiverName || "");
    setActualPhone(order?.receiverActualPhone || "");
    // Chỉ reset khi sang đơn khác, không reset khi store cập nhật đơn hiện tại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, open]);

  const finish = (processed: string[]) => {
    onOpenChange(false);
    if (processed.length && useStore.getState().online) {
      toast.success(`Đã giao thành công ${processed.length} đơn`);
    }
    onFinished?.(processed);
  };

  const goNext = (processed: string[]) => {
    if (idx + 1 >= codes.length) finish(processed);
    else setIdx(idx + 1);
  };

  const confirm = () => {
    if (!order) return;
    const name = actualName.trim();
    if (!name) return toast.error("Nhập tên người nhận thực tế");
    if (photos.length === 0) return toast.error("Cần ít nhất 1 ảnh POD");

    const st = useStore.getState();
    if (!st.online) {
      st.enqueueOffline({
        kind: "POD_HOME",
        payload: {
          code: order.code,
          actualName: name,
          actualPhone: actualPhone.trim(),
          photos: photos.slice(0, 3),
          amount: 0,
          method: "TM",
        },
      });
      toast.info(`${order.code}: đã lưu offline, sẽ đồng bộ khi có mạng`);
      const queued = [...done, order.code];
      setDone(queued);
      goNext(queued);
      return;
    }
    photos.slice(0, 3).forEach((p) => st.addPodPhoto(order.code, p));
    st.updateOrder(order.code, {
      receiverActualName: name,
      ...(actualPhone.trim() ? { receiverActualPhone: actualPhone.trim() } : {}),
    });
    // collectedAmount 0: bước này chỉ ghi POD + ảnh, không thu tiền (giữ nguyên hành vi cũ).
    const t = st.transitionOrder(order.code, "DELIVERED", "POD", name, { collectedAmount: 0 });
    if (!t.ok) return toast.error(`${order.code}: ${t.error}`);

    const delivered = [...done, order.code];
    setDone(delivered);
    goNext(delivered);
  };

  const due = order ? orderDueAmount(order) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : finish(done))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Ảnh POD & xác nhận giao
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
                {order.receiverName} · {order.receiverPhone}
                {order.address ? ` · ${order.address}` : ""}
              </div>
              {due > 0 && (
                <div className="mt-1">
                  Còn phải thu: <span className="font-semibold">{formatVND(due)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    (bước này không thu tiền — thu ở phiếu thu)
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tên người nhận thực tế *</Label>
              <Input value={actualName} onChange={(e) => setActualName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SĐT người nhận hộ</Label>
              <Input value={actualPhone} onChange={(e) => setActualPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ảnh POD (1–3) *</Label>
              <PodPhotoInput photos={photos} onChange={setPhotos} max={3} />
              <p className="text-xs text-muted-foreground">
                Chụp trực tiếp hoặc chọn ảnh từ thiết bị. Ảnh được nén trước khi lưu.
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
            <PackageCheck className="h-4 w-4" />
            Xác nhận giao
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
