import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLECT_FORMS,
  formatDateTime,
  formatVND,
  officeName,
  orderReceiverOffice,
  receiverOfficeName,
} from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { isApiEnabled } from "@/lib/api/client";
import { getOrder } from "@/lib/api/domain-api";
import { orderDueAmount, orderEventContent } from "@/lib/finance-debt";
import {
  buildOrderNote,
  displayOrderNote,
  packageCode,
  packageRows,
  parseOrderNoteMeta,
  warehouseInSeqs,
} from "@/lib/package-label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { toast } from "sonner";
import {
  AlertTriangle,
  CreditCard,
  LayoutGrid,
  Mail,
  MapPin,
  Pencil,
  Clock,
  User,
  X,
} from "lucide-react";

type HistoryCtx = {
  openOrderHistory: (code: string) => void;
};

const OrderHistoryContext = createContext<HistoryCtx | null>(null);

export function useOrderHistory() {
  const ctx = useContext(OrderHistoryContext);
  if (!ctx) {
    throw new Error("useOrderHistory must be used within OrderHistoryProvider");
  }
  return ctx;
}

export function useOrderHistoryOptional() {
  return useContext(OrderHistoryContext);
}

export function OrderHistoryProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null);
  const openOrderHistory = useCallback((c: string) => {
    const t = c?.trim();
    if (t) setCode(t);
  }, []);
  const value = useMemo(() => ({ openOrderHistory }), [openOrderHistory]);

  return (
    <OrderHistoryContext.Provider value={value}>
      {children}
      <OrderHistoryDialog
        code={code}
        open={Boolean(code)}
        onOpenChange={(v) => {
          if (!v) setCode(null);
        }}
      />
    </OrderHistoryContext.Provider>
  );
}

export function OrderCodeLink({
  code,
  className,
  children,
}: {
  code: string;
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useOrderHistoryOptional();
  const label = children ?? code;

  if (!code?.trim()) return <span className={className}>{label}</span>;

  if (!ctx) {
    return <span className={cn("font-medium text-primary", className)}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={cn(
        "font-medium text-primary underline-offset-2 hover:underline text-left",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.openOrderHistory(code);
      }}
    >
      {label}
    </button>
  );
}

type OrderEvent = { at: string; by?: string; action: string; detail?: string };

type EditPkg = {
  seq: number;
  kind: string;
  goodsName: string;
  itemQty: number;
  weightKg: number;
  fare: number;
  inboundStatus: "IN" | "MISSING";
};

type EditForm = {
  note: string;
  codAmount: number;
  codFee: number;
  packages: EditPkg[];
};

function routeShortLabel(o: OrderX): string {
  const label = (o.itinerary || o.route || "").trim();
  if (label) return label;
  const from = o.fromOffice || "—";
  const to = orderReceiverOffice(o) || o.toOffice || "—";
  return `${from} → ${to}`;
}

function payMethodLabel(o: OrderX): string {
  const paid = o.paidAmount ?? 0;
  const fare = o.fare ?? 0;
  if (o.collectForm === "NHAN_TRA") return "Người nhận thanh toán";
  if (paid > 0 && paid < fare) return "Thu cước 1 phần";
  if (o.collectForm === "GUI_TRA" || paid >= fare) return "Người gửi thanh toán";
  return COLLECT_FORMS.find((c) => c.value === o.collectForm)?.label ?? o.collectForm ?? "—";
}

function formFromOrder(o: OrderX): EditForm {
  return {
    note: displayOrderNote(o.note),
    codAmount: o.codAmount ?? 0,
    codFee: o.codFee ?? 0,
    packages: packageRows(o).map((p) => ({
      seq: p.seq,
      kind: p.kind,
      goodsName: p.goodsName,
      itemQty: p.itemQty,
      weightKg: p.weightKg ?? 0,
      fare: p.fare,
      inboundStatus: p.inboundStatus === "IN" ? "IN" : "MISSING",
    })),
  };
}

function FieldShell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function ViewValue({ value }: { value: string }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-[#D8DEE8] bg-white px-2.5 text-sm">
      <span className="truncate">{value || "—"}</span>
    </div>
  );
}

function FeeRow({ label, amount, hideZero }: { label: string; amount: number; hideZero?: boolean }) {
  if (hideZero && !(amount > 0)) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatVND(amount)}</span>
    </div>
  );
}

function moneyOf(o: OrderX, form?: EditForm | null) {
  const pickup = o.pickupFee ?? 0;
  const delivery = o.deliveryFee ?? 0;
  const declared = o.declaredFee ?? 0;
  const discount = o.discountAmount ?? 0;
  const codFee = form ? form.codFee : (o.codFee ?? 0);
  const codGoods = form ? form.codAmount : (o.codAmount ?? 0);
  const goodsFare = form
    ? form.packages.reduce((s, p) => s + (Number(p.fare) || 0), 0)
    : o.goodsFare != null
      ? Number(o.goodsFare)
      : Math.max(0, (o.fare ?? 0) - pickup - delivery - (o.codFee ?? 0) - declared + discount);
  const fare = form
    ? goodsFare + pickup + delivery + (codGoods > 0 ? codFee : 0) + declared - discount
    : (o.fare ?? 0);
  const paid = o.paidAmount ?? 0;
  const fareDue = form ? Math.max(0, fare - paid) : orderDueAmount(o);
  const shippingPaid = fareDue <= 0;
  const remaining = fareDue > 0 ? fareDue : codGoods > 0 ? codGoods : 0;
  const remainingHint =
    fareDue > 0
      ? "Cước vận chuyển còn lại"
      : codGoods > 0
        ? "Thu hộ COD từ người nhận"
        : "Không có khoản nào cần thu thêm";
  return {
    goodsFare,
    pickup,
    delivery,
    codFee: codGoods > 0 ? codFee : 0,
    declared,
    discount,
    codGoods,
    paid,
    fare,
    fareDue,
    shippingPaid,
    remaining,
    remainingHint,
  };
}

export function OrderHistoryDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { session } = useAuth();
  const updateOrder = useStore((s) => s.updateOrder);
  const storeOrder = useStore((s) =>
    code ? s.orders.find((o) => o.code === code || o.draftCode === code) : undefined,
  );
  const [order, setOrder] = useState<OrderX | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  const canEdit =
    !!session && (canWrite(session.role, "van-don") || canWrite(session.role, "dieu-chinh"));

  const reload = useCallback(
    async (orderCode: string) => {
      setLoading(true);
      try {
        if (isApiEnabled()) {
          const detail = await getOrder(orderCode);
          setOrder(detail);
          useStore.setState((st) => {
            const i = st.orders.findIndex((o) => o.code === detail.code);
            if (i < 0) return { orders: [...st.orders, detail] };
            const next = st.orders.slice();
            next[i] = {
              ...next[i],
              ...detail,
              events: detail.events?.length ? detail.events : next[i].events,
            };
            return { orders: next };
          });
          setEvents(
            [...(detail.events ?? [])].sort(
              (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
            ),
          );
        } else {
          const local = useStore
            .getState()
            .orders.find((o) => o.code === orderCode || o.draftCode === orderCode);
          setOrder(local ?? null);
          setEvents(
            [...(local?.events ?? [])].sort(
              (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
            ),
          );
        }
      } catch {
        const local = useStore
          .getState()
          .orders.find((o) => o.code === orderCode || o.draftCode === orderCode);
        setOrder(local ?? null);
        setEvents(
          [...(local?.events ?? [])].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open || !code) {
      setOrder(null);
      setEvents([]);
      setEditing(false);
      setForm(null);
      return;
    }
    void reload(code);
  }, [open, code, reload]);

  const o = order ?? storeOrder ?? null;
  const money = useMemo(() => (o ? moneyOf(o, editing ? form : null) : null), [o, editing, form]);

  const headerMeta = o
    ? [
        o.receiverName?.trim() || null,
        receiverOfficeName(o),
        routeShortLabel(o),
        o.vehiclePlate ? `BKS: ${o.vehiclePlate}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const startEdit = () => {
    if (!o) return;
    setForm(formFromOrder(o));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
  };

  const saveEdit = () => {
    if (!o || !form) return;
    setSaving(true);
    try {
      const goodsFare = form.packages.reduce((s, p) => s + (Number(p.fare) || 0), 0);
      const pickup = o.pickupFee ?? 0;
      const delivery = o.deliveryFee ?? 0;
      const declared = o.declaredFee ?? 0;
      const discount = o.discountAmount ?? 0;
      const codAmount = Math.max(0, Math.round(Number(form.codAmount) || 0));
      const codFee = codAmount > 0 ? Math.max(0, Math.round(Number(form.codFee) || 0)) : 0;
      const totalFare = goodsFare + pickup + delivery + codFee + declared - discount;
      const totalWeight = form.packages.reduce((s, p) => s + (Number(p.weightKg) || 0), 0);
      const quantity = Math.max(1, form.packages.length);
      const prevMeta = parseOrderNoteMeta(o.note);
      const note = buildOrderNote({
        goodsKinds: form.packages.map((p) => p.kind),
        goodsNames: form.packages.map((p) => p.goodsName),
        packageFares: form.packages.map((p) => Math.round(Number(p.fare) || 0)),
        packageItemQtys: form.packages.map((p) => Math.max(1, Math.round(Number(p.itemQty) || 1))),
        packageWeightsKg: form.packages.map((p) => Math.max(0, Number(p.weightKg) || 0)),
        warehouseInSeqs: warehouseInSeqs(o),
        body: form.note.trim() || prevMeta.body,
      });

      updateOrder(
        o.code,
        {
          note,
          weightKg: totalWeight,
          quantity,
          fare: totalFare,
          goodsFare,
          codAmount,
          codFee,
          collectForm:
            codAmount > 0 ? "COD" : o.collectForm === "COD" ? "GUI_TRA" : o.collectForm,
        },
        {
          eventAction: "ORDER_EDIT",
          eventDetail: "Sửa trong popup thông tin đơn",
        },
      );

      const nextLocal: OrderX = {
        ...o,
        note,
        weightKg: totalWeight,
        quantity,
        fare: totalFare,
        goodsFare,
        codAmount,
        codFee,
        updatedAt: new Date().toISOString(),
      };
      setOrder(nextLocal);
      setEditing(false);
      setForm(null);
      toast.success(`Đã cập nhật đơn ${o.code}`);
      void reload(o.code);
    } finally {
      setSaving(false);
    }
  };

  const pkgs = editing && form ? form.packages : o ? formFromOrder(o).packages : [];

  const patchPkg = (seq: number, patch: Partial<EditPkg>) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        packages: prev.packages.map((p) => (p.seq === seq ? { ...p, ...patch } : p)),
      };
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setEditing(false);
          setForm(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-[min(1100px,96vw)] max-w-5xl flex-col gap-0 overflow-hidden border-[#E5EAF2] bg-[#F7F9FC] p-0 shadow-xl sm:rounded-xl",
          // Ẩn nút X mặc định — dùng nút X custom cạnh Sửa đơn cho đúng mockup.
          "[&>button.absolute]:hidden",
        )}
      >
        <DialogHeader className="space-y-0 border-b border-[#E5EAF2] bg-white px-4 py-3 text-left sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-[15px] font-semibold leading-snug text-foreground sm:text-base">
                <span className="font-bold">{code || "—"}</span>
                {headerMeta ? (
                  <span className="font-normal text-muted-foreground"> · {headerMeta}</span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Thông tin đơn hàng, thanh toán và lịch sử tác động
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={saving}
                    onClick={cancelEdit}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={saving}
                    onClick={saveEdit}
                  >
                    {saving ? "Đang lưu…" : "Lưu"}
                  </Button>
                </>
              ) : canEdit && o ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-[#C5D0E0] bg-white text-primary hover:bg-primary/5"
                  onClick={startEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Sửa đơn
                </Button>
              ) : null}
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Đóng"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {loading && !o ? (
          <div className="bg-white px-6 py-16 text-center text-sm text-muted-foreground">
            Đang tải thông tin đơn…
          </div>
        ) : !o || !money ? (
          <div className="bg-white px-6 py-16 text-center text-sm text-muted-foreground">
            Không tìm thấy đơn hàng
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* LEFT */}
            <div className="min-h-0 space-y-3 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#E5EAF2] bg-white p-3">
                <FieldShell label="Tuyến">
                  <ViewValue value={routeShortLabel(o)} />
                </FieldShell>
                <FieldShell label="BKS xe">
                  <ViewValue value={o.vehiclePlate || "—"} />
                </FieldShell>
              </div>

              <section className="rounded-xl border border-[#E5EAF2] bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <User className="h-4 w-4" />
                  Người gửi
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <FieldShell label="SĐT người gửi">
                    <ViewValue value={o.senderPhone} />
                  </FieldShell>
                  <FieldShell label="Tên người gửi">
                    <ViewValue value={o.senderName ?? ""} />
                  </FieldShell>
                  <FieldShell label="VP gửi">
                    <ViewValue value={officeName(o.fromOffice)} />
                  </FieldShell>
                </div>
                {o.homePickup ? (
                  <div className="mt-2.5 flex items-center gap-2 rounded-md bg-[#EAF3FF] px-3 py-2 text-sm text-[#1D4F91]">
                    <MapPin className="h-4 w-4 shrink-0" />
                    Lấy tận nơi
                    {money.pickup > 0 ? ` · ${formatVND(money.pickup)}` : ""}
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-[#E5EAF2] bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Mail className="h-4 w-4" />
                  Người nhận
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <FieldShell label="SĐT người nhận">
                    <ViewValue value={o.receiverPhone} />
                  </FieldShell>
                  <FieldShell label="Tên người nhận">
                    <ViewValue value={o.receiverName} />
                  </FieldShell>
                  <FieldShell label="VP nhận">
                    <ViewValue value={receiverOfficeName(o)} />
                  </FieldShell>
                </div>
                {o.homeDelivery ? (
                  <div className="mt-2.5 flex items-center gap-2 rounded-md bg-[#EAF3FF] px-3 py-2 text-sm text-[#1D4F91]">
                    <MapPin className="h-4 w-4 shrink-0" />
                    Giao tận nơi
                    {money.delivery > 0 ? ` · ${formatVND(money.delivery)}` : ""}
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-[#E5EAF2] bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <LayoutGrid className="h-4 w-4" />
                  Danh sách hàng hóa
                </div>
                <div className="space-y-2.5">
                  {pkgs.map((p) => (
                    <div key={p.seq} className="rounded-lg border border-[#E5EAF2] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">KIỆN {p.seq}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {packageCode(o.code, p.seq)}
                          </span>
                          {p.inboundStatus === "IN" ? (
                            <Badge className="border border-emerald-300 bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50">
                              Đã nhập kho
                            </Badge>
                          ) : (
                            <Badge className="border border-amber-300 bg-amber-50 font-normal text-amber-700 hover:bg-amber-50">
                              Còn thiếu
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <FieldShell label="Loại hàng">
                          {editing ? (
                            <Input
                              className="h-9"
                              value={p.kind}
                              onChange={(e) => patchPkg(p.seq, { kind: e.target.value })}
                            />
                          ) : (
                            <ViewValue
                              value={
                                p.goodsName?.trim()
                                  ? `${p.kind} (${p.goodsName})`
                                  : p.kind
                              }
                            />
                          )}
                        </FieldShell>
                        <FieldShell label="Số lượng">
                          {editing ? (
                            <Input
                              className="h-9"
                              inputMode="numeric"
                              value={String(p.itemQty)}
                              onChange={(e) =>
                                patchPkg(p.seq, {
                                  itemQty: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                                })
                              }
                            />
                          ) : (
                            <ViewValue value={String(p.itemQty)} />
                          )}
                        </FieldShell>
                        <FieldShell label="Cân nặng (KG)">
                          {editing ? (
                            <Input
                              className="h-9"
                              inputMode="decimal"
                              value={String(p.weightKg)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(",", ".");
                                const n = Number(raw);
                                patchPkg(p.seq, {
                                  weightKg: Number.isFinite(n) ? n : 0,
                                });
                              }}
                            />
                          ) : (
                            <ViewValue
                              value={p.weightKg != null ? Number(p.weightKg).toFixed(1) : "—"}
                            />
                          )}
                        </FieldShell>
                        <FieldShell label="Cước hàng">
                          {editing ? (
                            <Input
                              className="h-9"
                              inputMode="numeric"
                              value={String(p.fare)}
                              onChange={(e) =>
                                patchPkg(p.seq, {
                                  fare: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0),
                                })
                              }
                            />
                          ) : (
                            <ViewValue value={formatVND(p.fare)} />
                          )}
                        </FieldShell>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-[#E5EAF2] bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Clock className="h-4 w-4" />
                  Lịch sử tác động
                </div>
                {events.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    Chưa có lịch sử tác động
                  </p>
                ) : (
                  <ol className="relative ml-1.5 space-y-0 border-l border-[#D8DEE8] pl-5">
                    {events.map((e, i) => {
                      const last = i === events.length - 1;
                      return (
                        <li key={`${e.at}-${e.action}-${i}`} className="relative pb-3.5 last:pb-0">
                          <span
                            className={cn(
                              "absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 bg-white",
                              last ? "border-primary bg-primary" : "border-[#B8C2D1]",
                            )}
                          />
                          <div className="text-sm font-medium text-foreground">
                            {orderEventContent(e.action, e.detail)}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateTime(e.at)}
                            {e.by?.trim() ? ` · ${e.by.trim()}` : ""}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>

            {/* RIGHT */}
            <aside className="flex min-h-0 flex-col border-t border-[#E5EAF2] bg-white lg:border-l lg:border-t-0">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <CreditCard className="h-4 w-4" />
                  Thanh toán & ghi chú
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                    Hình thức thanh toán
                  </div>
                  <div className="flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 text-sm font-medium text-emerald-800">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    {payMethodLabel(o)}
                  </div>
                </div>

                {(editing ? (form?.codAmount ?? 0) > 0 : money.codGoods > 0) || editing ? (
                  <div className="rounded-lg border border-amber-300 bg-[#FFF8E8] p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Thu hộ COD
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-900/80">Tiền hàng thu của người nhận</span>
                        {editing && form ? (
                          <Input
                            className="h-8 w-32 text-right"
                            inputMode="numeric"
                            value={String(form.codAmount)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                codAmount: Math.max(
                                  0,
                                  Number(e.target.value.replace(/\D/g, "")) || 0,
                                ),
                              })
                            }
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-amber-950">
                            {formatVND(money.codGoods)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-900/80">Phí thu hộ</span>
                        {editing && form ? (
                          <Input
                            className="h-8 w-32 text-right"
                            inputMode="numeric"
                            value={String(form.codFee)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                codFee: Math.max(
                                  0,
                                  Number(e.target.value.replace(/\D/g, "")) || 0,
                                ),
                              })
                            }
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-amber-950">
                            {formatVND(money.codFee)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {o.invoiceRequested ? (
                  <div className="rounded-md border border-sky-200 bg-sky-50/70 p-2.5 text-sm">
                    <div className="mb-1.5 text-[11px] font-semibold text-sky-800">Xuất hoá đơn</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">MST</span>
                        <span className="font-medium">{o.invoiceTaxCode || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Công ty</span>
                        <span className="text-right font-medium">{o.invoiceCompanyName || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Email</span>
                        <span className="text-right font-medium">{o.invoiceEmail || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Địa chỉ</span>
                        <span className="text-right font-medium">{o.invoiceCompanyAddress || "—"}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                    Ghi chú đơn hàng
                  </div>
                  {editing && form ? (
                    <Textarea
                      className="min-h-[72px] resize-none bg-[#F3F6FA]"
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                    />
                  ) : (
                    <div className="min-h-[72px] rounded-md border border-[#D8DEE8] bg-[#F3F6FA] px-2.5 py-2 text-sm">
                      {displayOrderNote(o.note) || "—"}
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <div
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-wide",
                      money.shippingPaid ? "text-emerald-700" : "text-foreground",
                    )}
                  >
                    Chi phí vận chuyển
                    {money.shippingPaid ? (
                      <span className="font-semibold normal-case"> (người gửi đã trả)</span>
                    ) : null}
                  </div>
                  <div className="space-y-1.5 rounded-lg border border-[#E5EAF2] bg-[#FAFBFD] p-2.5">
                    <FeeRow label="Cước hàng" amount={money.goodsFare} />
                    <FeeRow label="Cước lấy tận nơi" amount={money.pickup} hideZero />
                    <FeeRow label="Cước giao tận nơi" amount={money.delivery} hideZero />
                    <FeeRow label="Phí thu hộ COD" amount={money.codFee} hideZero />
                    <FeeRow label="Phí khai giá" amount={money.declared} hideZero />
                    {money.discount > 0 ? (
                      <FeeRow label="Giảm giá" amount={-money.discount} />
                    ) : null}
                    {money.shippingPaid && money.paid > 0 ? (
                      <div className="flex justify-between gap-2 border-t border-[#E5EAF2] pt-2 text-sm font-semibold text-emerald-700">
                        <span>Tổng đã thu</span>
                        <span className="tabular-nums">{formatVND(money.paid)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="shrink-0 p-3 sm:p-4">
                <div
                  className={cn(
                    "rounded-lg border-2 p-3",
                    money.remaining > 0
                      ? "border-amber-400 bg-[#FFF8E8]"
                      : "border-[#E5EAF2] bg-[#F3F6FA]",
                  )}
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">Còn phải thu</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {money.remainingHint}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-xl font-bold tabular-nums",
                        money.remaining > 0 ? "text-[#E67E22]" : "text-foreground",
                      )}
                    >
                      {formatVND(money.remaining)}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
