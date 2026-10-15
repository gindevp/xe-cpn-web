import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  currentExtraFarePayerRequest,
  defaultExtraFarePayer,
  subscribeExtraFarePayer,
  type ExtraFarePayer,
} from "@/lib/extra-fare-payer";
import { formatVND } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** Hộp chọn ai trả phần cước tăng khi sửa đơn người gửi đã trả đủ. Gắn 1 lần ở root. */
export function ExtraFarePayerHost() {
  const req = useSyncExternalStore(subscribeExtraFarePayer, currentExtraFarePayerRequest, () => null);
  const [choice, setChoice] = useState<ExtraFarePayer>("RECEIVER");

  useEffect(() => {
    if (req) setChoice(defaultExtraFarePayer(req.order));
  }, [req]);

  if (!req) return null;
  const { order, newFare } = req;
  const paid = order.paidAmount ?? 0;
  const extra = newFare != null ? Math.max(0, newFare - paid) : null;

  const options: { key: ExtraFarePayer; title: string; desc: string }[] = [
    {
      key: "SENDER",
      title: "Người gửi trả thêm",
      desc: "Giữ \"Người gửi thanh toán\". Phần chênh ghi đã thu vào ca của bạn — chỉ chọn khi đã thu tiền người gửi.",
    },
    {
      key: "RECEIVER",
      title: "Người nhận trả phần chênh",
      desc: "Chuyển sang \"Thu cước 1 phần\": giữ số người gửi đã trả, phần chênh thu người nhận khi giao.",
    },
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && req.resolve(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cước tăng — ai trả phần chênh?</DialogTitle>
          <DialogDescription>
            Đơn {order.code} người gửi đã trả đủ {formatVND(paid)}.
            {extra != null && extra > 0 ? ` Sau khi sửa phát sinh thêm khoảng ${formatVND(extra)}.` : " Thay đổi này làm cước tăng."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setChoice(opt.key)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                choice === opt.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
              )}
            >
              <div className="text-sm font-semibold">{opt.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => req.resolve(null)}>
            Huỷ sửa
          </Button>
          <Button onClick={() => req.resolve(choice)}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
