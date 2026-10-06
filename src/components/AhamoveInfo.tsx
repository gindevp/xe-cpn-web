import { useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, MapPin, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ahamoveAdvancePending, ahamoveRefundDue } from "@/lib/ahamove";
import { isApiEnabled } from "@/lib/api/client";
import { ahamoveAdvanceIn, ahamoveAdvanceRefund, ahamoveCancel } from "@/lib/api/domain-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import type { OrderX } from "@/lib/store";
import { refreshOrdersNow } from "@/lib/use-orders-poll";
const AHAMOVE_STATUS_LABEL: Record<string, string> = {
  IDLE: "chờ xác nhận",
  ASSIGNING: "đang tìm tài xế",
  ACCEPTED: "tài xế đã nhận",
  CONFIRMING: "đang xác nhận",
  "IN PROCESS": "đang giao",
  COMPLETED: "đã giao",
  FAILED: "giao thất bại",
  CANCELLED: "đã hủy",
};

const AHAMOVE_CANCELLABLE = new Set(["IDLE", "ASSIGNING", "ACCEPTED", "CONFIRMING", "PAYING"]);

function AhamoveCancelLink({ order }: { order: OrderX }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const writable = isApiEnabled() && canWrite(session?.role, "nhap-kho-luan-chuyen");
  const st = (order.partnerStatus ?? "").toUpperCase();
  if (!writable || !order.partnerOrderId || !AHAMOVE_CANCELLABLE.has(st)) return null;
  if (order.status !== "OUT_FOR_DELIVERY" && order.status !== "FAILED_DELIVERY") return null;
  const cancel = async () => {
    if (!window.confirm(`Hủy đơn Ahamove của ${order.code}? Chỉ hủy được khi tài xế chưa lấy hàng.`)) return;
    setBusy(true);
    try {
      await ahamoveCancel(order.code, "CPN hủy giao Ahamove");
      toast.success(`Đã hủy Ahamove — ${order.code} chuyển Giao thất bại`);
      void refreshOrdersNow();
    } catch (e: any) {
      toast.error(e?.message ?? "Hủy Ahamove thất bại");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={`${PILL} border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60`}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void cancel();
      }}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
      {busy ? "Đang hủy…" : "Hủy Ahamove"}
    </button>
  );
}

const PILL =
  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-none transition-colors";

export function AhamoveInfo({ order }: { order: OrderX }) {
  const st = order.partnerStatus ?? "";
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="border-orange-500 text-orange-700">
          Ahamove · {AHAMOVE_STATUS_LABEL[st] ?? (st || "—")}
        </Badge>
        {order.partnerTrackingUrl ? (
          <a
            href={order.partnerTrackingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`${PILL} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}
          >
            <MapPin className="h-3 w-3" />
            Theo dõi
          </a>
        ) : null}
        {order.partnerPodUrl ? (
          <a
            href={order.partnerPodUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
          >
            <ImageIcon className="h-3 w-3" />
            Ảnh POD
          </a>
        ) : null}
        <AhamoveCancelLink order={order} />
      </div>
      {order.partnerDriverName || order.partnerDriverPhone ? (
        <div className="text-muted-foreground">
          Tài xế: {order.partnerDriverName ?? ""} {order.partnerDriverPhone ?? ""}
        </div>
      ) : null}
      {order.partnerFee != null ? (
        <div className="text-muted-foreground">Phí đối tác: {order.partnerFee.toLocaleString("vi-VN")}đ</div>
      ) : null}
      {order.partnerFailReason && (st === "FAILED" || st === "CANCELLED") ? (
        <div className="text-destructive">{order.partnerFailReason}</div>
      ) : null}
      <AhamoveAdvanceRow order={order} />
    </div>
  );
}

/** Tài xế Ahamove ứng cước: NV xác nhận đã nhận tiền / hoàn lại khi giao không được. */
function AhamoveAdvanceRow({ order }: { order: OrderX }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const amount = order.partnerCodAmount ?? 0;
  if (amount <= 0) return null;
  const money = `${amount.toLocaleString("vi-VN")}đ`;
  const writable = isApiEnabled() && canWrite(session?.role, "nhap-kho-luan-chuyen");
  const pending = ahamoveAdvancePending(order);
  const refundDue = ahamoveRefundDue(order);
  const driverHasGoods = ["IN PROCESS", "COMPLETED", "FAILED"].includes(order.partnerStatus ?? "");
  const pickupConfirmable = !order.partnerCodCollectedAt && order.status === "FAILED_DELIVERY";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      void refreshOrdersNow();
    } catch (e: any) {
      toast.error(e?.message ?? "Thao tác thất bại");
    } finally {
      setBusy(false);
    }
  };
  const confirmIn = () => {
    if (!window.confirm(`Xác nhận đã nhận ${money} tiền mặt tài xế Ahamove ứng cho đơn ${order.code}?`)) return;
    void run(() => ahamoveAdvanceIn(order.code), `Đã ghi nhận ${money} tài xế ứng`);
  };
  const refund = () => {
    if (!window.confirm(`Đã trả lại ${money} cho tài xế Ahamove (hàng đã về VP)? Đơn ${order.code} sẽ quay lại còn nợ.`))
      return;
    void run(() => ahamoveAdvanceRefund(order.code), `Đã hoàn ${money} tiền ứng cho tài xế`);
  };

  if (order.partnerCodCollectedAt && !refundDue) {
    return (
      <div className="text-emerald-700">
        Đã nhận {money} tài xế ứng{order.partnerCodCollectedBy ? ` · ${order.partnerCodCollectedBy}` : ""}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {refundDue ? (
        <span className="font-medium text-destructive">Chưa hoàn {money} tiền ứng cho tài xế</span>
      ) : (
        <span className={driverHasGoods ? "font-medium text-destructive" : "text-amber-700"}>
          Tài xế ứng {money} — chưa nhận{driverHasGoods ? " (tài xế đã lấy hàng!)" : ""}
        </span>
      )}
      {writable && (pending || pickupConfirmable) ? (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy} onClick={confirmIn}>
          Đã nhận tiền ứng
        </Button>
      ) : null}
      {writable && refundDue ? (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" disabled={busy} onClick={refund}>
          Hoàn ứng cho tài xế
        </Button>
      ) : null}
    </div>
  );
}
