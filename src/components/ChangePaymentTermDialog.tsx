import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, isApiEnabled } from "@/lib/api/client";
import { refreshOrdersNow } from "@/lib/use-orders-poll";
import { formatVND, type Order, type Role } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type PayTermMethod = "GUI_TRA" | "NHAN_TRA" | "CONG_NO";

const OPTIONS: { value: PayTermMethod; label: string; hint: string }[] = [
  { value: "GUI_TRA", label: "Người gửi trả", hint: "Thu cước người gửi khi nhập kho gửi" },
  { value: "NHAN_TRA", label: "Người nhận trả", hint: "Thu cước người nhận khi giao" },
  { value: "CONG_NO", label: "Công nợ", hint: "Không thu tiền mặt, ghi nợ người gửi" },
];

const LOCKED_STATUSES = new Set(["DELIVERED", "RETURNING", "RETURNED", "CANCELLED"]);
const PAST_SENDER_STATUSES = new Set(["IN_TRANSIT", "AT_DEST", "OUT_FOR_DELIVERY", "FAILED_DELIVERY"]);

export function currentPayTerm(o: Pick<Order, "onCredit" | "collectForm">): PayTermMethod {
  if (o.onCredit) return "CONG_NO";
  return o.collectForm === "NHAN_TRA" ? "NHAN_TRA" : "GUI_TRA";
}

export function senderWarehouseDone(o: Pick<Order, "status" | "pickedUpAt" | "warehouseInAt"> & { stage?: string | null }) {
  return Boolean(o.pickedUpAt || o.warehouseInAt || o.stage) || PAST_SENDER_STATUSES.has(o.status);
}

/** Hàng còn nằm kho VP gửi, chưa gán xe — điều phối đổi được cả khi đã thu, kể cả sang Người gửi trả. */
export function atSenderWarehouse(o: Pick<Order, "status"> & { stage?: string | null }) {
  if (o.status !== "CONFIRMED" && o.status !== "WAITING") return false;
  return !o.stage || o.stage === "PICKED" || o.stage === "WH_IN";
}

const RECEIVER_SIDE_STATUSES = new Set(["AT_DEST", "OUT_FOR_DELIVERY", "FAILED_DELIVERY"]);
const RECEIVER_SIDE_STAGES = new Set(["DEST_WH_IN", "DELIVERING", "FAILED", "REDELIVER_WAIT"]);

/** Từ Nhập kho giao trở đi không ai đổi được HTTT, kể cả admin. */
export function atReceiverSide(o: Pick<Order, "status"> & { stage?: string | null }) {
  return RECEIVER_SIDE_STATUSES.has(o.status) || (!!o.stage && RECEIVER_SIDE_STAGES.has(o.stage));
}

type CounterShape = Pick<
  Order,
  "status" | "fromOffice" | "pickedUpAt" | "pickingAt" | "pickupStaff" | "tripCode"
> & { stage?: string | null };

/** Quầy chỉ đổi ở Chờ lấy hàng (shipper chưa nhận lấy) / Chờ nhận hàng / Nhập kho gửi (chưa gán xe). */
export function counterMayChangePayTerm(o: CounterShape): boolean {
  if (o.tripCode) return false;
  if (!o.pickedUpAt && !o.stage) {
    if (o.pickingAt || o.pickupStaff) return false;
    if (o.status === "DRAFT") return true;
  }
  return atSenderWarehouse(o);
}

/**
 * Admin / điều phối: mọi trạng thái chưa giao / hoàn / huỷ. Quầy: chỉ đơn VP gửi mình ở 3 bước trên.
 * BE kiểm tra lại toàn bộ.
 */
export function canChangePayTerm(o: CounterShape, role?: Role, office?: string): boolean {
  if (LOCKED_STATUSES.has(o.status) || atReceiverSide(o)) return false;
  if (role === "AD" || role === "DH") return true;
  return role === "Q" && !!office && o.fromOffice === office && counterMayChangePayTerm(o);
}

/** Nút "Đổi HTTT" trên dòng danh sách — tự ẩn khi role / trạng thái không cho đổi. */
export function ChangePayTermButton({
  order,
  role,
  office,
  onChanged,
}: {
  order: Order;
  role?: Role;
  office?: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!isApiEnabled() || !canChangePayTerm(order, role, office)) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Đổi HTTT
      </Button>
      <ChangePaymentTermDialog
        order={order}
        role={role}
        open={open}
        onOpenChange={setOpen}
        onChanged={() => {
          void refreshOrdersNow();
          onChanged?.();
        }}
      />
    </>
  );
}

export function ChangePaymentTermDialog({
  order,
  role,
  open,
  onOpenChange,
  onChanged,
}: {
  order: Order;
  role?: Role;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const current = currentPayTerm(order);
  const [method, setMethod] = useState<PayTermMethod>(current);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod(current);
      setReason("");
    }
  }, [open, current]);

  const admin = role === "AD";
  const paid = Math.max(0, order.paidAmount ?? 0);
  const atSenderWh = atSenderWarehouse(order);
  const senderDone = senderWarehouseDone(order);
  const willReverse = paid > 0 && method !== "GUI_TRA";
  const blockedByMoney = paid > 0 && !admin && !atSenderWh;

  const disabledReason = (v: PayTermMethod): string | null => {
    if (v === current) return "Đang áp dụng";
    if (v === "GUI_TRA" && senderDone && !atSenderWh) return "Đã gán xe";
    return null;
  };

  const submit = async () => {
    if (method === current) return;
    if (reason.trim().length < 3) {
      toast.error("Nhập lý do đổi hình thức thanh toán");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/orders/${encodeURIComponent(order.code)}/payment-term`, {
        method: "POST",
        body: { method, reason: reason.trim() },
      });
      toast.success("Đã đổi hình thức thanh toán — nhớ in lại tem nếu đã dán tem");
      onOpenChange(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đổi được hình thức thanh toán");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi hình thức thanh toán · {order.code}</DialogTitle>
          <DialogDescription>
            Thay đổi được ghi vào lịch sử đơn. Đơn đã lên phiếu thu phải huỷ phiếu thu trước.
          </DialogDescription>
        </DialogHeader>

        {blockedByMoney ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Đơn đã thu {formatVND(paid)} và đã gán xe — chỉ admin đổi được hình thức thanh toán.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2">
              {OPTIONS.map((opt) => {
                const why = disabledReason(opt.value);
                const active = method === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!!why}
                    onClick={() => setMethod(opt.value)}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      active ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                      why && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                    </span>
                    {why ? <span className="text-xs text-muted-foreground">{why}</span> : null}
                  </button>
                );
              })}
            </div>

            {willReverse ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Khoản đã thu {formatVND(paid)} sẽ được đảo (ghi âm) — đơn trở về chưa thu.
              </p>
            ) : null}

            <div className="space-y-1">
              <Label className="text-xs">Lý do *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: khách gửi đổi sang người nhận trả"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {!blockedByMoney ? (
            <Button onClick={() => void submit()} disabled={saving || method === current}>
              {saving ? "Đang lưu…" : "Xác nhận đổi"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
