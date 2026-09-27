import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addOfficeNetwork,
  deleteOfficeNetwork,
  getMyPublicIp,
  listOfficeNetworks,
  type OfficeNetwork,
} from "@/lib/api/attendance-api";

/** Danh sách IP công cộng wifi của VP — app chỉ cho chấm công khi đi ra internet từ một IP trong danh sách. */
export function OfficeWifiDialog({
  officeId,
  officeName,
  writable,
  onClose,
}: {
  officeId: number;
  officeName: string;
  writable: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<OfficeNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listOfficeNetworks(officeId)
      .then(setRows)
      .catch((e: any) => toast.error(e?.message || "Không tải được danh sách IP"))
      .finally(() => setLoading(false));
  }, [officeId]);

  const fillMyIp = async () => {
    try {
      const r = await getMyPublicIp();
      if (!r.ip) {
        toast.error("Máy chủ không xác định được IP của máy này");
        return;
      }
      setIp(r.ip);
      toast.success(`IP máy này: ${r.ip}`);
    } catch (e: any) {
      toast.error(e?.message || "Không lấy được IP");
    }
  };

  const add = async () => {
    if (!ip.trim()) {
      toast.error("Nhập IP");
      return;
    }
    setBusy(true);
    try {
      const row = await addOfficeNetwork(officeId, ip.trim(), label.trim() || undefined);
      setRows((prev) => [...prev, row]);
      setIp("");
      setLabel("");
      toast.success("Đã thêm IP");
    } catch (e: any) {
      toast.error(e?.message || "Không thêm được IP");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: OfficeNetwork) => {
    if (!confirm(`Xóa IP ${row.ipAddress}? Nhân viên sẽ không chấm công được từ mạng này nữa.`)) return;
    try {
      await deleteOfficeNetwork(officeId, row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Đã xóa IP");
    } catch (e: any) {
      toast.error(e?.message || "Không xóa được IP");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Wifi chấm công — {officeName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Nhân viên chỉ chấm công được khi điện thoại dùng wifi có IP công cộng nằm trong danh sách. Mở trang này trên
          máy đang dùng wifi văn phòng rồi bấm <b>Lấy IP máy này</b>. Nên dùng IP tĩnh từ nhà mạng — IP động đổi thì
          phải cập nhật lại.
        </p>

        <div className="mt-2 rounded-md border">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground">Đang tải…</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              Chưa có IP — nhân viên VP này chưa chấm công được.
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
                <div className="flex-1">
                  <div className="font-medium tabular-nums">{r.ipAddress}</div>
                  <div className="text-xs text-muted-foreground">
                    {[r.label, r.createdBy].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {writable && (
                  <Button size="icon" variant="ghost" onClick={() => void remove(r)} aria-label="Xóa IP">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {writable && (
          <div className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label>IP công cộng</Label>
              <div className="flex gap-2">
                <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="VD: 113.160.12.34" />
                <Button type="button" variant="outline" onClick={() => void fillMyIp()}>
                  Lấy IP máy này
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Ghi chú</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="VD: Wifi tầng 1 - Viettel" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Đóng
              </Button>
              <Button onClick={() => void add()} disabled={busy}>
                Thêm IP
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
