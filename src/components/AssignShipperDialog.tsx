import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AhamovePartnerPanel } from "@/components/AhamoveDispatchDialog";
import { listShippers, type ShipperDTO } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { estimateShipperFare } from "@/lib/pricing";
import { ahamoveRefundDue } from "@/lib/ahamove";
import { findOfficeByToken, formatMoney, orderReceiverOffice } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { cn } from "@/lib/utils";

export type InternalAssign = { shipper: ShipperDTO; note: string };
export type ExternalAssign = { feeListed: number; feeActual: number; note: string };

/**
 * Popup "Gán Shipper" — mỗi lần một đơn.
 * Nội bộ: chọn shipper của VP nhận.
 * Thuê shipper ngoài: cước bảng giá + cước trả ship (doanh thu = chênh lệch); luồng trạng thái như nội bộ.
 * Đối tác vận chuyển: gọi Ahamove hoặc Grab Express.
 */
export function AssignShipperDialog({
  order,
  onOpenChange,
  onInternal,
  onExternal,
  onDone,
  purpose = "delivery",
}: {
  order: OrderX | null;
  onOpenChange: (open: boolean) => void;
  onInternal: (order: OrderX, pick: InternalAssign) => Promise<boolean>;
  onExternal?: (order: OrderX, pick: ExternalAssign) => Promise<boolean>;
  onDone: () => void;
  /** pickup = shipper VP gửi đi lấy tận nơi. */
  purpose?: "delivery" | "pickup";
}) {
  const offices = useStore((s) => s.offices);
  const [tab, setTab] = useState<"internal" | "external" | "partner">("internal");
  const [shippers, setShippers] = useState<ShipperDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickId, setPickId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [courier, setCourier] = useState<"AHAMOVE" | "GRAB">("AHAMOVE");
  const [externalFeeText, setExternalFeeText] = useState("");

  const orderCode = order?.code;
  const receiverToken = order ? (purpose === "pickup" ? order.fromOffice : orderReceiverOffice(order)) : undefined;
  const office = receiverToken ? findOfficeByToken(receiverToken, offices) : undefined;
  const officeCode = office?.code ?? receiverToken;

  useEffect(() => {
    if (!orderCode) return;
    setTab("internal");
    setPickId(null);
    setNote("");
    setExternalFeeText("");
    setShippers(null);
    setLoadError(null);
    if (!isApiEnabled()) {
      setShippers([]);
      setLoadError("Cần kết nối máy chủ để tải danh sách shipper.");
      return;
    }
    let alive = true;
    listShippers({ officeCode })
      .then((rows) => alive && setShippers(rows))
      .catch((e) => {
        if (!alive) return;
        setShippers([]);
        setLoadError(e instanceof Error ? e.message : "Không tải được danh sách shipper");
      });
    return () => {
      alive = false;
    };
  }, [orderCode, officeCode]);

  const fee = order ? estimateShipperFare(order) : null;
  const picked = shippers?.find((s) => s.id === pickId) ?? null;
  const externalFeeActual = parseMoneyInput(externalFeeText);
  const externalMargin =
    fee != null && externalFeeActual != null ? Math.max(0, Math.round(fee) - Math.round(externalFeeActual)) : null;

  const finish = () => {
    onOpenChange(false);
    onDone();
  };

  const submitInternal = async () => {
    if (!order || !picked) return;
    setBusy(true);
    try {
      const ok = await onInternal(order, { shipper: picked, note: note.trim() });
      if (ok) finish();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gán shipper thất bại");
    } finally {
      setBusy(false);
    }
  };

  const submitExternal = async () => {
    if (!order || !onExternal) return;
    if (fee == null || fee < 0) {
      toast.error("Đơn chưa có cước tận nơi — kiểm tra địa chỉ / bảng giá");
      return;
    }
    if (externalFeeActual == null) {
      toast.error("Nhập cước ship thực tế");
      return;
    }
    if (externalFeeActual < 0) {
      toast.error("Cước ship thực tế không được âm");
      return;
    }
    setBusy(true);
    try {
      const ok = await onExternal(order, {
        feeListed: Math.round(fee),
        feeActual: Math.round(externalFeeActual),
        note: note.trim(),
      });
      if (ok) finish();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gán shipper ngoài thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={order != null} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gán Shipper</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Đơn hàng: <span className="font-medium text-foreground">{order?.code}</span>
          </p>
        </DialogHeader>
        {order && ahamoveRefundDue(order) ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Chưa hoàn {(order.partnerCodAmount ?? 0).toLocaleString("vi-VN")}đ tiền ứng cho tài xế Ahamove lần trước —
            bấm &quot;Hoàn ứng cho tài xế&quot; trên dòng đơn trước khi bàn giao lại.
          </p>
        ) : null}
        {order ? (
          <Tabs value={tab} onValueChange={(v) => !busy && setTab(v as typeof tab)}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
              <TabsTrigger value="internal" className="text-xs sm:text-sm">
                Nội bộ
              </TabsTrigger>
              <TabsTrigger value="partner" className="text-xs sm:text-sm">
                Đối tác vận chuyển
              </TabsTrigger>
              <TabsTrigger value="external" className="text-xs sm:text-sm">
                Thuê shipper ngoài
              </TabsTrigger>
            </TabsList>

            <TabsContent value="internal" className="space-y-4 pt-2">
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
                <span className="text-sm text-muted-foreground">Cước phí</span>
                <span className="text-lg font-semibold tabular-nums">
                  {fee == null ? "—" : `${formatMoney(fee)}đ`}
                </span>
              </div>
              {fee != null && order.homeDelivery ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">Phí ship thực tế (70%)</div>
                    <div className="font-semibold tabular-nums">{formatMoney(Math.round(fee * 0.7))}đ</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">Doanh thu (30%)</div>
                    <div className="font-semibold tabular-nums text-emerald-700">
                      {formatMoney(Math.round(fee) - Math.round(fee * 0.7))}đ
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Chọn shipper nội bộ</Label>
                {shippers == null ? (
                  <p className="text-sm text-muted-foreground">Đang tải…</p>
                ) : shippers.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    {loadError ??
                      `Chưa có shipper cho ${office?.name ?? officeCode ?? "VP nhận"} — thêm ở Danh mục → Shipper.`}
                  </p>
                ) : (
                  <div role="radiogroup" className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {shippers.map((s) => {
                      const busyCount = s.busyCount ?? 0;
                      const active = s.id === pickId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPickId(s.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                            active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                            busyCount > 0 && !active && "opacity-70",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              active ? "border-primary" : "border-muted-foreground/40",
                            )}
                          >
                            {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                          </span>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {initial(s.fullName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{s.fullName}</span>
                            <span className="block text-xs text-muted-foreground">{s.phone || "—"}</span>
                          </span>
                          {busyCount > 0 ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Bận · {busyCount} đơn
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Sẵn sàng
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Ghi chú (tùy chọn)</Label>
                <Textarea
                  value={note}
                  maxLength={200}
                  rows={3}
                  placeholder="Nhập ghi chú cho shipper…"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <Button className="w-full" disabled={busy || !picked} onClick={() => void submitInternal()}>
                {busy ? "Đang gán…" : "Gán shipper"}
              </Button>
            </TabsContent>

            <TabsContent value="partner" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCourier("AHAMOVE")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                    courier === "AHAMOVE" ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <Bike className="h-4 w-4 text-primary" /> Ahamove
                </button>
                <button
                  type="button"
                  onClick={() => setCourier("GRAB")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                    courier === "GRAB" ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <Bike className="h-4 w-4 text-primary" /> Grab Express
                </button>
              </div>
              <AhamovePartnerPanel
                order={order}
                busy={busy}
                setBusy={setBusy}
                onDone={finish}
                purpose={purpose}
                partner={courier}
              />
            </TabsContent>

            <TabsContent value="external" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Cước phí</Label>
                <div className="flex h-10 items-center justify-end rounded-md border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                  {fee == null ? "—" : `${formatMoney(fee)}đ`}
                </div>
                <p className="text-[11px] text-muted-foreground">Cước tận nơi theo bảng giá (tự tính).</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="external-ship-fee">Cước ship thực tế</Label>
                <div className="relative">
                  <Input
                    id="external-ship-fee"
                    inputMode="numeric"
                    className="pr-8 tabular-nums"
                    placeholder="Nhập cước ship thực tế"
                    value={externalFeeText}
                    onChange={(e) => setExternalFeeText(e.target.value.replace(/[^\d]/g, ""))}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    đ
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Số tiền trả shipper ngoài (chi phí). Doanh thu phần này ≈ cước phí − cước ship thực tế
                  {externalMargin != null ? (
                    <>
                      : <span className="font-medium text-foreground">{formatMoney(externalMargin)}đ</span>
                    </>
                  ) : null}
                  .
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Ghi chú (tùy chọn)</Label>
                <Textarea
                  value={note}
                  maxLength={200}
                  rows={2}
                  placeholder="Tên / SĐT shipper ngoài…"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <Button
                className="w-full"
                disabled={busy || !onExternal || externalFeeActual == null || fee == null}
                onClick={() => void submitExternal()}
              >
                {busy ? "Đang gán…" : "Gán shipper"}
              </Button>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function parseMoneyInput(raw: string): number | null {
  const t = raw.replace(/\D/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function initial(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? "?").toUpperCase();
}
