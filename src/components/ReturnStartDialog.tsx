import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Xác nhận bắt đầu hoàn về người gửi — bắt buộc nhập lý do (gửi BE return-start).
 */
export function ReturnStartDialog({
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
    if (!r) return toast.error("Nhập lý do hoàn về người gửi");
    onConfirm(codes, r);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận hoàn người gửi</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {codes.length === 1
              ? `Đơn ${codes[0]} sẽ chuyển trạng thái hoàn về người gửi.`
              : `${codes.length} đơn sẽ chuyển trạng thái hoàn về người gửi.`}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="return-start-reason">Lý do hoàn *</Label>
            <Textarea
              id="return-start-reason"
              rows={3}
              placeholder="VD: Người nhận không nhận / sai địa chỉ / hàng hỏng…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" className="gap-2" onClick={submit} disabled={!reason.trim()}>
            <Undo2 className="h-4 w-4" />
            Xác nhận hoàn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
