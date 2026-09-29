import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban } from "lucide-react";
import { toast } from "sonner";

/** Xác nhận huỷ đơn — bắt buộc nhập lý do. */
export function CancelOrderDialog({
  open,
  codes,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  codes: string[];
  onOpenChange: (v: boolean) => void;
  onConfirm: (codes: string[], reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, codes]);

  const submit = () => {
    const r = reason.trim();
    if (!r) return toast.error("Nhập lý do huỷ đơn");
    onConfirm(codes, r);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận huỷ đơn</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {codes.length === 1 ? `Đơn ${codes[0]}` : `${codes.length} đơn`} sẽ chuyển sang Đơn huỷ
            (khôi phục được ở màn Đơn huỷ). Đơn còn tiền đã thu chưa nộp sẽ không huỷ được — lập phiếu
            thu hoặc hủy nộp trước.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-order-reason">Lý do huỷ *</Label>
            <Textarea
              id="cancel-order-reason"
              rows={3}
              maxLength={200}
              placeholder="VD: Khách không gửi nữa / tạo nhầm đơn…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Quay lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            onClick={submit}
            disabled={!reason.trim()}
          >
            <Ban className="h-4 w-4" />
            Huỷ đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
