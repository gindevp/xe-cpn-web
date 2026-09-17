import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import {
  ADMIN_ISSUE_LABEL,
  adminIssueRequiresNote,
  type AdminIssueType,
} from "@/lib/order-edit-policy";

export type AdminMarkIssuePayload = {
  type: AdminIssueType;
  reasonNote: string;
  photos: string[];
};

type Props = {
  open: boolean;
  type: AdminIssueType | null;
  orderCode?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: AdminMarkIssuePayload) => void;
};

/** Dialog ghi nhận vụ việc AD — ngoại lệ/hư hỏng bắt buộc lý do + ảnh tùy chọn. */
export function AdminMarkIssueDialog({ open, type, orderCode, onOpenChange, onConfirm }: Props) {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setNote("");
      setPhotos([]);
    }
  }, [open, type]);

  if (!type) return null;

  const label = ADMIN_ISSUE_LABEL[type];
  const needsNote = adminIssueRequiresNote(type);
  const noteOk = note.trim().length > 0;

  if (!needsNote) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ghi nhận {label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Đơn <span className="font-semibold text-foreground">{orderCode}</span> sẽ vào tab tương ứng
              trên màn Ngoại lệ. Chỉ Admin thao tác; không áp dụng đơn đã giao / hoàn thành công.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onConfirm({ type, reasonNote: `AD ghi nhận ${label.toLowerCase()}`, photos: [] })}
            >
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ghi nhận {label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Đơn <span className="font-semibold text-foreground">{orderCode}</span> — nhập lý do (bắt buộc).
            Có thể đính kèm ảnh minh chứng (không bắt buộc).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="admin-issue-note" className="text-xs">
              Lý do <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="admin-issue-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Mô tả ${label.toLowerCase()}…`}
              rows={3}
              maxLength={900}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ảnh minh chứng (tùy chọn, tối đa 3)</Label>
            <PodPhotoInput
              photos={photos}
              onChange={setPhotos}
              max={3}
              allowGallery
              label="Thêm ảnh"
              tileClassName="aspect-video w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!noteOk}
            onClick={() => {
              if (!noteOk) return;
              onConfirm({ type, reasonNote: note.trim(), photos });
              onOpenChange(false);
            }}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
