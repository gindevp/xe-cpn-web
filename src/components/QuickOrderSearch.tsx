import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NameInput } from "@/components/NameInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MoneyInput } from "@/components/MoneyInput";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { isApiEnabled } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { orderDueAmount, receiverDueAmount } from "@/lib/finance-debt";
import {
  PAY_METHODS,
  canonicalOfficeCode,
  formatDateTime,
  formatVND,
  officeName,
  orderReceiverOffice,
  type Order,
} from "@/lib/mock-data";
import { assignedOfficeCode } from "@/lib/office-scope";
import { compareSearchResults } from "@/lib/order-search";
import { embedWarehouseInSeqs, packageCount, packageSeqList, warehouseInSeqs } from "@/lib/package-label";
import { useStore, type OrderX } from "@/lib/store";
import { toast } from "sonner";
import { Loader2, PackageCheck, Search, Undo2 } from "lucide-react";

type PipelineTab = "PICKED" | "WH_IN" | "TRANSFER_PENDING" | "TRANSFERRING" | "DEST_WH_IN" | "DELIVERING" | "FAILED" | "REDELIVER_WAIT";

/** SCAN_IN = đơn còn trên xe, coi như đã quét nhập kho giao đủ kiện; BACK_TO_DEST = giao thất bại → về kho giao. */
type HandoverPrep = "NONE" | "SCAN_IN" | "BACK_TO_DEST";

type HandoverTarget = { code: string; kind: "DELIVER" | "RETURN"; prep: HandoverPrep };

type Suggestion = {
  tone: "ok" | "info" | "warn" | "done";
  text: string;
  /** Giao / trả khách tại quầy; prep = bước đưa đơn về kho giao trước khi POD. */
  handover?: { kind: "DELIVER" | "RETURN"; prep: HandoverPrep; label: string };
  links: { label: string; tab: PipelineTab }[];
};

const TONE_CLS: Record<Suggestion["tone"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  done: "border-slate-200 bg-slate-50 text-slate-700",
};

function officeEq(a?: string | null, b?: string | null) {
  const x = canonicalOfficeCode(a) || (a ?? "").trim().toUpperCase();
  const y = canonicalOfficeCode(b) || (b ?? "").trim().toUpperCase();
  return Boolean(x) && x === y;
}

/** VP đang giữ hàng để giao: đơn hoàn → VP gửi gốc, còn lại → VP nhận. */
function handoverOffice(o: Order) {
  return o.status === "RETURNING" ? o.fromOffice : orderReceiverOffice(o);
}

function suggest(o: OrderX, myOffice: string): Suggestion {
  const dest = handoverOffice(o);
  const mine = !myOffice || officeEq(dest, myOffice);
  const destLabel = officeName(dest) || dest || "VP nhận";
  const notMine = (text: string): Suggestion => ({
    tone: "warn",
    text: `${text} · hàng giao tại ${destLabel}, không phải VP của bạn`,
    links: [],
  });
  const stage = (o as OrderX & { stage?: string }).stage;
  const samePlace = officeEq(o.fromOffice, orderReceiverOffice(o));

  switch (o.status) {
    case "DRAFT":
      return { tone: "info", text: "Đơn nháp — chưa chốt, chưa có hàng", links: [] };
    case "CANCELLED":
      return { tone: "done", text: "Đơn đã huỷ", links: [] };
    case "DELIVERED":
      return {
        tone: "done",
        text: `Đã giao${o.receiverActualName ? ` cho ${o.receiverActualName}` : ""} · ${formatDateTime(o.updatedAt)}`,
        links: [],
      };
    case "RETURNED":
      return { tone: "done", text: `Đã trả hàng về người gửi · ${formatDateTime(o.updatedAt)}`, links: [] };
    case "CONFIRMED":
    case "WAITING":
      if (samePlace) {
        if (!mine) return notMine("Đơn gửi & nhận cùng VP");
        return {
          tone: "ok",
          text: "Gửi & nhận cùng VP — hàng đang ở kho, giao được ngay",
          handover: { kind: "DELIVER", prep: "NONE", label: "Giao khách tại quầy" },
          links: [{ label: "Nhập kho gửi", tab: "WH_IN" }],
        };
      }
      return {
        tone: "info",
        text:
          o.status === "WAITING"
            ? `Đã gán xe, chờ lên hàng tại ${officeName(o.fromOffice) || o.fromOffice} — chưa tới VP nhận`
            : `Hàng còn ở VP gửi ${officeName(o.fromOffice) || o.fromOffice} — chưa đi chuyến`,
        links: [{ label: o.status === "WAITING" ? "Đợi trung chuyển" : "Nhập kho gửi", tab: o.status === "WAITING" ? "TRANSFER_PENDING" : "WH_IN" }],
      };
    case "IN_TRANSIT": {
      const inCount = warehouseInSeqs(o).length;
      const total = packageCount(o);
      if (!mine) return notMine(`Hàng đang trên xe${o.vehiclePlate ? ` ${o.vehiclePlate}` : ""}`);
      return {
        tone: "warn",
        text: `Hàng đang trên xe${o.vehiclePlate ? ` ${o.vehiclePlate}` : ""}${inCount ? ` · đã xuống ${inCount}/${total} kiện` : ""}. Nếu hàng đã về tới quầy thì giao luôn — hệ thống ghi nhận nhập kho giao đủ kiện.`,
        handover: { kind: "DELIVER", prep: "SCAN_IN", label: "Nhận hàng & giao khách" },
        links: [{ label: "Hàng trên xe", tab: "TRANSFERRING" }],
      };
    }
    case "AT_DEST":
      if (!mine) return notMine("Hàng đã tới VP nhận");
      return {
        tone: "ok",
        text: "Hàng đã nhập kho giao — khách đến lấy thì giao ngay, hoặc bàn giao shipper",
        handover: { kind: "DELIVER", prep: "NONE", label: "Giao khách tại quầy" },
        links: [{ label: "Bàn giao shipper", tab: "DEST_WH_IN" }],
      };
    case "OUT_FOR_DELIVERY":
      return {
        tone: "info",
        text: "Đơn đang được shipper đi giao tận nơi",
        links: [{ label: "Đang giao hàng", tab: "DELIVERING" }],
      };
    case "FAILED_DELIVERY":
      if (!mine) return notMine("Giao không thành công");
      return {
        tone: "warn",
        text: "Giao không thành công, hàng đã về bưu cục — khách đến lấy thì giao tại quầy, hoặc xếp giao lại / hoàn",
        handover: { kind: "DELIVER", prep: "BACK_TO_DEST", label: "Giao khách tại quầy" },
        links: [
          { label: stage === "REDELIVER_WAIT" ? "Chờ giao lại" : "Giao không thành công", tab: stage === "REDELIVER_WAIT" ? "REDELIVER_WAIT" : "FAILED" },
        ],
      };
    case "RETURNING":
      if (!mine) return notMine("Đơn đang hoàn về người gửi");
      if (stage === "DEST_WH_IN") {
        return {
          tone: "ok",
          text: "Hàng hoàn đã về VP gửi — trả lại cho người gửi",
          handover: { kind: "RETURN", prep: "NONE", label: "Trả hàng người gửi" },
          links: [{ label: "Nhập kho giao (hoàn)", tab: "DEST_WH_IN" }],
        };
      }
      return {
        tone: "info",
        text: "Đơn đang trên đường hoàn về VP gửi",
        links: stage ? [{ label: "Xem trên pipeline", tab: stage as PipelineTab }] : [],
      };
    default:
      return { tone: "info", text: o.status, links: [] };
  }
}

function mergeIntoStore(rows: OrderX[]) {
  if (!rows.length) return;
  useStore.setState((s) => {
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const kept = s.orders.map((o) => {
      const fresh = byCode.get(o.code);
      if (!fresh) return o;
      byCode.delete(o.code);
      return { ...o, ...fresh };
    });
    return { orders: [...kept, ...byCode.values()] };
  });
}

/** Nút tìm nhanh đơn theo SĐT / mã và thao tác tiếp theo phù hợp trạng thái. */
export function QuickOrderSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Search className="mr-2 h-4 w-4" /> Tìm đơn theo SĐT
      </Button>
      <QuickOrderSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function QuickOrderSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { session } = useAuth();
  const myOffice = assignedOfficeCode(session?.office);
  const orders = useStore((s) => s.orders);
  const [q, setQ] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [handover, setHandover] = useState<HandoverTarget | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const run = async () => {
    const kw = q.trim();
    if (kw.replace(/\D/g, "").length < 4 && kw.length < 5) {
      toast.error("Nhập ít nhất 4 số điện thoại hoặc mã đơn");
      return;
    }
    setLoading(true);
    try {
      let rows: OrderX[];
      if (isApiEnabled()) {
        const domain = await import("@/lib/api/domain-api");
        rows = (await domain.listOrdersPage({ keyword: kw, size: 30, sort: "id,desc", searchAllOffices: true })).rows;
        mergeIntoStore(rows);
      } else {
        const k = kw.toLowerCase();
        rows = useStore
          .getState()
          .orders.filter((o) =>
            [o.code, o.receiverPhone, o.senderPhone].some((v) => (v ?? "").toLowerCase().includes(k)),
          )
          .slice(0, 30);
      }
      setCodes(rows.map((r) => r.code));
      if (!rows.length) toast.info("Không tìm thấy đơn nào");
    } catch (e: any) {
      toast.error(e?.message || "Tìm đơn thất bại");
    } finally {
      setLoading(false);
    }
  };

  const found = useMemo(() => {
    if (!codes) return [];
    const byCode = new Map(orders.map((o) => [o.code, o]));
    const list = codes.map((c) => byCode.get(c)).filter(Boolean) as OrderX[];
    return list
      .map((o) => ({ o, s: suggest(o, myOffice) }))
      .sort((a, b) => compareSearchResults(a.o, b.o));
  }, [codes, orders, myOffice]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          onOpenChange(v);
          if (!v) {
            setCodes(null);
            setQ("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Tìm đơn theo SĐT / mã đơn</DialogTitle>
            <DialogDescription>
              Tìm theo SĐT người nhận hoặc người gửi. Tìm được đơn là coi như đã quét — giao khách ngay tại đây.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="VD: 0912345678 hoặc mã vận đơn"
              inputMode="search"
            />
            <Button onClick={() => void run()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Tìm</span>
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {codes && found.length === 0 && !loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Không có đơn khớp</p>
            ) : null}
            {found.map(({ o, s }) => (
              <div key={o.code} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <OrderCodeLink code={o.code} />
                      <OrderStatusBadge status={o.status} issue={o.issue} order={o} />
                      {o.homeDelivery ? <Badge variant="secondary">Giao tận nơi</Badge> : null}
                    </div>
                    <div className="text-muted-foreground">
                      Nhận: <span className="text-foreground">{o.receiverName}</span> · {o.receiverPhone}
                      {"  "}| Gửi: {o.senderName ?? "—"} · {o.senderPhone}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {packageCount(o)} kiện · {(o.weightKg ?? 0).toFixed(1)} kg · Còn thu{" "}
                      <span className="font-semibold text-foreground">{formatVND(orderDueAmount(o))}</span>
                      {(o.codAmount ?? 0) > 0 ? ` · COD ${formatVND(o.codAmount ?? 0)}` : ""}
                    </div>
                  </div>
                  <OfficeRouteCell order={o} className="text-xs text-muted-foreground" />
                </div>
                <div className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${TONE_CLS[s.tone]}`}>{s.text}</div>
                {(s.handover || s.links.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.handover ? (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          setHandover({ code: o.code, kind: s.handover!.kind, prep: s.handover!.prep })
                        }
                      >
                        {s.handover.kind === "RETURN" ? <Undo2 className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                        {s.handover.label}
                      </Button>
                    ) : null}
                    {s.links.map((l) => (
                      <Button key={l.tab} size="sm" variant="outline" asChild>
                        <Link
                          to="/nhap-kho-luan-chuyen"
                          search={{ tab: l.tab, q: o.code }}
                          onClick={() => onOpenChange(false)}
                        >
                          {l.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CounterHandoverDialog target={handover} onClose={() => setHandover(null)} />
    </>
  );
}

/** Giao khách / trả người gửi tại quầy — không cần quét kiện, ảnh POD bắt buộc. */
function CounterHandoverDialog({
  target,
  onClose,
}: {
  target: HandoverTarget | null;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const order = useStore((s) => (target ? s.orders.find((o) => o.code === target.code) : undefined));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"TM" | "CK" | "THE">("TM");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target || !order) return;
    const ret = target.kind === "RETURN";
    setName((ret ? order.senderName : order.receiverName) ?? "");
    setPhone("");
    setPhotos([]);
    setAmount(ret ? 0 : receiverDueAmount(order));
    setMethod("TM");
    // Chỉ khởi tạo khi mở đơn mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.code, target?.kind]);

  const due = order ? receiverDueAmount(order) : 0;
  const senderOwes = order && order.collectForm === "GUI_TRA" ? orderDueAmount(order) : 0;
  const cod = Math.max(0, order?.codAmount ?? 0);

  const confirm = async () => {
    if (!order || !target) return;
    const actual = name.trim();
    if (!actual) return toast.error("Nhập tên người nhận thực tế");
    if (photos.length === 0) return toast.error("Cần ít nhất 1 ảnh POD");
    if (amount > due) return toast.error(`Số thu vượt số còn phải thu (${formatVND(due)})`);
    const office = assignedOfficeCode(session?.office) || handoverOffice(order);
    const allSeqs = packageSeqList(order);
    const whinNote = embedWarehouseInSeqs(order.note, allSeqs);
    setBusy(true);
    try {
      if (isApiEnabled()) {
        const domain = await import("@/lib/api/domain-api");
        if (target.prep === "SCAN_IN") {
          if (warehouseInSeqs(order).length < allSeqs.length) {
            await domain.patchOrder(order.code, { note: whinNote });
          }
          await domain.scanIn({ orderCode: order.code, officeCode: office });
        } else if (target.prep === "BACK_TO_DEST") {
          await domain.transitionOrderApi(order.code, "AT_DEST", "COUNTER_PICKUP", "Khách đến lấy tại quầy");
        }
        await domain.podOrder(order.code, {
          channel: "COUNTER",
          actualRecipientName: actual,
          actualRecipientPhone: phone.trim() || undefined,
          photos: domain.compactPodPhotos(photos),
          collectedAmount: amount,
          paymentMethod: method,
        });
        mergeIntoStore([await domain.getOrder(order.code)]);
      } else {
        const st = useStore.getState();
        if (target.prep !== "NONE") {
          if (target.prep === "SCAN_IN") st.updateOrder(order.code, { note: whinNote });
          const t = st.transitionOrder(order.code, "AT_DEST", target.prep, `VP ${office}`);
          if (!t.ok) throw new Error(t.error);
        }
        photos.forEach((p) => st.addPodPhoto(order.code, p));
        st.updateOrder(order.code, { receiverActualName: actual, receiverActualPhone: phone.trim() || undefined });
        const t = st.transitionOrder(
          order.code,
          target.kind === "RETURN" ? "RETURNED" : "DELIVERED",
          "POD_QUAY",
          actual,
          { collectedAmount: amount, paymentMethod: method },
        );
        if (!t.ok) throw new Error(t.error);
      }
      toast.success(
        target.kind === "RETURN"
          ? `${order.code}: đã trả hàng cho người gửi`
          : `${order.code}: đã giao cho khách${amount ? ` · thu ${formatVND(amount)}` : ""}`,
      );
      onClose();
    } catch (e: any) {
      toast.error(`${order.code}: ${e?.message || "Không giao được"}`);
      if (isApiEnabled()) {
        const domain = await import("@/lib/api/domain-api");
        void domain.getOrder(order.code).then((o) => mergeIntoStore([o])).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  const ret = target?.kind === "RETURN";
  return (
    <Dialog open={Boolean(target)} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ret ? "Trả hàng cho người gửi" : "Giao khách tại quầy"}</DialogTitle>
          <DialogDescription>
            {target?.prep === "SCAN_IN"
              ? "Đơn đang ghi nhận trên xe — xác nhận sẽ nhập kho giao đủ kiện rồi giao luôn (không cần quét)."
              : target?.prep === "BACK_TO_DEST"
                ? "Đơn giao thất bại — xác nhận sẽ đưa về kho giao rồi giao cho khách tại quầy."
                : "Tìm được đơn nên không cần quét kiện — chụp ảnh POD và xác nhận."}
          </DialogDescription>
        </DialogHeader>
        {!order ? (
          <p className="text-sm text-destructive">Không tìm thấy đơn</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{order.code}</span>
                <OrderStatusBadge status={order.status} issue={order.issue} order={order} />
              </div>
              <div className="mt-1 text-muted-foreground">
                {ret
                  ? `${order.senderName ?? "—"} · ${order.senderPhone}`
                  : `${order.receiverName} · ${order.receiverPhone}`}
                {" · "}
                {packageCount(order)} kiện
              </div>
              {!ret ? (
                <div className="mt-1">
                  Còn phải thu cước: <span className="font-semibold">{formatVND(due)}</span>
                  {cod > 0 ? (
                    <span className="text-xs text-muted-foreground"> · COD {formatVND(cod)} nộp qua phiếu thu</span>
                  ) : null}
                  {senderOwes > 0 ? (
                    <div className="mt-1 text-xs text-amber-700">
                      Người gửi trả, còn nợ {formatVND(senderOwes)} — VP gửi lập phiếu thu, không thu người nhận.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Tên người nhận thực tế *</Label>
                <NameInput preserveCase value={name} onChange={setName} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SĐT người nhận hộ</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
              </div>
            </div>
            {!ret && due > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Số thu tại quầy</Label>
                  <MoneyInput value={amount} onChange={setAmount} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phương thức</Label>
                  <SearchableSelect
                    value={method}
                    onValueChange={(v) => setMethod(v as "TM" | "CK" | "THE")}
                    options={PAY_METHODS.map((p) => ({ value: p.value, label: p.label }))}
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs">Ảnh POD (1–3) *</Label>
              <PodPhotoInput photos={photos} onChange={setPhotos} max={3} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button className="gap-2" onClick={() => void confirm()} disabled={!order || busy || photos.length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            {ret ? "Xác nhận trả hàng" : "Xác nhận giao"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
