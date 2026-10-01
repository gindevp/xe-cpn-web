import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { apiRequest } from "@/lib/api/client";
import { canonicalOfficeCode, officeName, orderReceiverOffice, type Order, type Role } from "@/lib/mock-data";
import { useStore } from "@/lib/store";

type RerouteShape = Pick<Order, "status" | "toOffice" | "finalToOffice"> & { stage?: string | null };

/** Hàng đang nằm ở kho VP nhận (nhập kho giao / giao thất bại / chờ giao lại), chưa giao cho shipper. */
export function rerouteDestAllowed(o: RerouteShape): boolean {
  if (o.status !== "AT_DEST" && o.status !== "FAILED_DELIVERY") return false;
  return o.stage !== "DELIVERING";
}

/** AD, hoặc DH của VP đang giữ hàng. BE kiểm tra lại toàn bộ. */
export function canRerouteDest(o: RerouteShape, role?: Role, sessionOffice?: string | null): boolean {
  if (!rerouteDestAllowed(o)) return false;
  if (role === "AD") return true;
  if (role !== "DH") return false;
  if (!sessionOffice) return true;
  return canonicalOfficeCode(sessionOffice) === canonicalOfficeCode(orderReceiverOffice(o));
}

export function ChangeDestOfficeDialog({
  order,
  open,
  onOpenChange,
  onChanged,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const offices = useStore((s) => s.offices);
  const current = canonicalOfficeCode(orderReceiverOffice(order));
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget("");
      setReason("");
    }
  }, [open]);

  const options = useMemo(
    () =>
      offices
        .filter((o) => canonicalOfficeCode(o.code) !== current)
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((o) => ({ value: o.code, label: o.name })),
    [offices, current],
  );

  const submit = async () => {
    if (!target) {
      toast.error("Chọn VP nhận mới");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Nhập lý do đổi VP nhận");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/orders/${encodeURIComponent(order.code)}/reroute-destination`, {
        method: "POST",
        body: { officeCode: target, reason: reason.trim() },
      });
      useStore.setState((st) => ({
        orders: st.orders.map((o) =>
          o.code === order.code ? { ...o, toOffice: target, finalToOffice: target } : o,
        ),
      }));
      toast.success(`Đã chuyển đơn sang ${officeName(target)} — nhớ in lại tem nếu cần`);
      onOpenChange(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đổi được VP nhận");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi VP nhận · {order.code}</DialogTitle>
          <DialogDescription>
            Dùng khi hàng đã được chuyển tay sang VP khác giao. Đơn giữ trạng thái đã nhập kho, chuyển sang
            tab Nhập kho giao của VP mới. Lộ trình và cước giữ nguyên.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm">
            VP nhận hiện tại: <span className="font-medium">{officeName(current) || "—"}</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">VP nhận mới *</Label>
            <SearchableSelect value={target} onValueChange={setTarget} placeholder="Chọn VP nhận mới" options={options} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lý do *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: hàng đã gửi tay về VP Thái Bình để giao"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !target}>
            {saving ? "Đang lưu…" : "Xác nhận đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
