import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeOwnPassword } from "@/lib/api/staff-admin-api";
import { isApiEnabled } from "@/lib/api/client";
import { toast } from "sonner";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
  };

  const submit = async () => {
    if (!currentPassword || !newPassword) return toast.error("Nhập đủ mật khẩu hiện tại và mật khẩu mới");
    if (newPassword.length < 4) return toast.error("Mật khẩu mới tối thiểu 4 ký tự");
    if (newPassword !== confirm) return toast.error("Xác nhận mật khẩu không khớp");
    if (!isApiEnabled()) return toast.error("API chưa cấu hình");
    setBusy(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success("Đã đổi mật khẩu");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Không đổi được mật khẩu — kiểm tra mật khẩu hiện tại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Mật khẩu hiện tại</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mật khẩu mới</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Xác nhận mật khẩu mới</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Đang lưu…" : "Đổi mật khẩu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
