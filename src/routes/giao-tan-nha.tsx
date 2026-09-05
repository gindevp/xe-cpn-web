import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, OfflineBadge, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PAY_METHODS, formatVND, formatDateTime } from "@/lib/mock-data";
import { MoneyInput } from "@/components/MoneyInput";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { useAuth } from "@/lib/auth";
import { useStore, type OrderX } from "@/lib/store";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, XCircle } from "lucide-react";

export const Route = createFileRoute("/giao-tan-nha")({
  head: () => ({ meta: [{ title: "Giao tận nhà — X.E" }] }),
  component: () => (
    <ProtectedPage title="Giao tận nhà" screen="giao-tan-nha">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [assignee, setAssignee] = useState("");

  const list = useMemo(() => {
    return orders.filter((o) => {
      if (!o.homeDelivery && !o.address) return false;
      if (!["AT_DEST", "OUT_FOR_DELIVERY", "FAILED_DELIVERY"].includes(o.status)) return false;
      // scope by office (đích/hub)
      if (session?.office !== "ALL" && o.hubOffice !== session?.office && o.toOffice !== session?.office) return false;
      return true;
    });
  }, [orders, session, date, assignee]);

  // Không còn chức danh "Giao" riêng: người giao là nhân viên đang hoạt động của VP.
  const givers = users.filter(
    (u) => u.active !== false && (session?.office === "ALL" || u.office === session?.office),
  );

  return (
    <div className="space-y-4">
      <Section title="Danh sách ngày" right={<OfflineBadge />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Ngày</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Người giao</Label>
            <SearchableSelect
              value={assignee || "all"}
              onValueChange={(v) => setAssignee(v === "all" ? "" : v)}
              options={[
                { value: "all", label: "Tất cả" },
                ...givers.map((g) => ({ value: g.username, label: g.username })),
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title={`Đơn cần giao (${list.length})`}>
        {list.length === 0 ? <EmptyState /> : (
          <div className="space-y-2">
            {list.map((o) => <DeliveryCard key={o.code} order={o} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

function DeliveryCard({ order }: { order: OrderX }) {
  const { transitionOrder, updateOrder, addPayment, addPodPhoto, enqueueOffline } = useStore.getState();
  const online = useStore((s) => s.online);
  const [podOpen, setPodOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);

  const paid = order.paidAmount ?? 0;
  const due = Math.max(0, order.fare + (order.deliveryFee ?? 0) - paid);
  const failCount = order.failCount ?? 0;
  const withinRetryWindow = () => {
    const last = order.failHistory?.[order.failHistory.length - 1]?.at;
    if (!last) return true;
    return Date.now() - new Date(last).getTime() < 48 * 3600 * 1000;
  };
  const canRetry = failCount < 3 && withinRetryWindow();

  const takeJob = () => {
    if (order.status === "FAILED_DELIVERY" && !canRetry) {
      toast.error("Hết retry 3/48h — đã về AT_DEST");
      return;
    }
    const from = order.status === "FAILED_DELIVERY" ? "FAILED_DELIVERY" : "AT_DEST";
    const t = transitionOrder(order.code, "OUT_FOR_DELIVERY", "TAKE_JOB", `Từ ${from}`);
    if (!t.ok) toast.error(t.error); else toast.success("Nhận việc · OUT_FOR_DELIVERY");
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium"><OrderCodeLink code={order.code} /></div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {order.address ?? "—"} · {order.receiverName} · {order.receiverPhone}
      </div>
      <div className="mt-1 text-sm">
        Còn thu: <span className="font-semibold">{formatVND(due)}</span>
        {failCount > 0 && (
          <span className="ml-3 text-xs text-destructive">Fail {failCount}/3{!canRetry && " · hết retry"}</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {order.status !== "OUT_FOR_DELIVERY" && (
          <Button size="sm" onClick={takeJob} disabled={order.status === "FAILED_DELIVERY" && !canRetry}>Nhận việc</Button>
        )}
        {order.status === "OUT_FOR_DELIVERY" && (
          <>
            <Button size="sm" onClick={() => setPodOpen(true)}>POD</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setFailOpen(true)}>
              <XCircle className="mr-1 h-4 w-4" /> Giao thất bại
            </Button>
          </>
        )}
      </div>

      <PodModal
        open={podOpen}
        onClose={() => setPodOpen(false)}
        due={due}
        onSubmit={({ actualName, actualPhone, photos, amount, method }) => {
          if (!actualName) return toast.error("Bắt buộc tên nhận thực tế");
          if (photos.length === 0) return toast.error("Cần ≥1 ảnh POD");
          if (!online) {
            enqueueOffline({ kind: "POD_HOME", payload: { code: order.code, actualName, actualPhone, photos, amount, method } });
            toast.info("Đã lưu offline");
            setPodOpen(false);
            return;
          }
          photos.slice(0, 3).forEach((p) => addPodPhoto(order.code, p));
          updateOrder(order.code, { receiverActualName: actualName, receiverActualPhone: actualPhone });
          if (amount > 0) {
            addPayment(order.code, {
              at: new Date().toISOString(), by: useStore.getState().session?.username ?? "giao",
              amount, method, kind: "SAU",
            });
          }
          const t = transitionOrder(order.code, "DELIVERED", "POD", `${actualName}${amount ? " · thu " + formatVND(amount) : ""}`);
          if (!t.ok) toast.error(t.error);
          else { toast.success("Đã POD · DELIVERED"); setPodOpen(false); }
        }}
      />

      <FailModal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        onSubmit={(reason) => {
          if (!reason) return toast.error("Bắt buộc lý do fail");
          const newCount = failCount + 1;
          const history = [...(order.failHistory ?? []), { at: new Date().toISOString(), by: useStore.getState().session?.username ?? "giao", reason }];
          updateOrder(order.code, { failCount: newCount, failHistory: history });
          if (!online) {
            enqueueOffline({ kind: "FAIL", payload: { code: order.code, reason } });
            toast.info("Đã lưu offline");
            setFailOpen(false);
            return;
          }
          if (newCount >= 3) {
            const t1 = transitionOrder(order.code, "FAILED_DELIVERY", "FAIL", reason);
            if (t1.ok) transitionOrder(order.code, "AT_DEST", "FAIL_MAX", "3 lần / 48h — về AT_DEST");
          } else {
            transitionOrder(order.code, "FAILED_DELIVERY", "FAIL", reason);
          }
          toast.success("Đã ghi giao thất bại");
          setFailOpen(false);
        }}
      />
    </div>
  );
}

function PodModal({ open, onClose, due, onSubmit }: {
  open: boolean; onClose: () => void; due: number;
  onSubmit: (v: { actualName: string; actualPhone: string; photos: string[]; amount: number; method: "TM" | "CK" | "THE" }) => void;
}) {
  const [actualName, setActualName] = useState("");
  const [actualPhone, setActualPhone] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [amount, setAmount] = useState(due);
  const [method, setMethod] = useState<"TM" | "CK" | "THE">("TM");

  const addPhoto = () => {
    if (photos.length >= 3) return toast.error("Tối đa 3 ảnh");
    // mock: placeholder SVG data URL with timestamp
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150'><rect width='100%' height='100%' fill='%23e5e7eb'/><text x='50%' y='50%' text-anchor='middle' font-size='16' fill='%236b7280'>POD ${photos.length + 1}</text></svg>`;
    setPhotos([...photos, `data:image/svg+xml;utf8,${svg}`]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>POD & xác nhận giao</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tên nhận thực tế *</Label>
            <Input value={actualName} onChange={(e) => setActualName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>SĐT lấy hộ (optional)</Label>
            <Input value={actualPhone} onChange={(e) => setActualPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ảnh POD (1–3)</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p} alt="pod" className="h-16 w-20 rounded border object-cover" />
                  <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white text-xs">×</button>
                </div>
              ))}
              {photos.length < 3 && (
                <button onClick={addPhoto} className="flex h-16 w-20 items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted">
                  <Camera className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          {due > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Thu (còn {formatVND(due)})</Label>
                <MoneyInput value={amount} onChange={setAmount} />
              </div>
              <div className="space-y-1.5">
                <Label>Phương thức</Label>
                <SearchableSelect
                  value={method}
                  onValueChange={(v) => setMethod(v as any)}
                  options={PAY_METHODS.map((p) => ({ value: p.value, label: p.label }))}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onSubmit({ actualName, actualPhone, photos, amount: amount || 0, method })}>Xác nhận</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FailModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (r: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Giao thất bại — nêu lý do</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>Lý do *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Người nhận vắng / không liên hệ được…" />
          <p className="text-xs text-muted-foreground">≤3 lần/48h. Hết retry → tự về AT_DEST.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button variant="destructive" onClick={() => onSubmit(reason)}>Ghi thất bại</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

void formatDateTime;
