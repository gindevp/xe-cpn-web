import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, OfflineBadge } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { suggestShelf } from "@/lib/pricing";
import { useState } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";

export const Route = createFileRoute("/quet-nhap")({
  head: () => ({ meta: [{ title: "Quét nhập — X.E" }] }),
  component: () => (
    <ProtectedPage title="Quét nhập & kệ" screen="quet-nhap">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const online = useStore((s) => s.online);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<{ code: string; suggested: number } | null>(null);
  const [shelf, setShelf] = useState<number | null>(null);

  const doScan = () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const st = useStore.getState();
    const order = st.orders.find((o) => o.code === c);
    if (!order) return toast.error("Không tồn tại đơn (E-SCAN-404)");

    // BR-043: check office
    const isForce = session?.role === "DH" || session?.role === "AD";
    if (order.toOffice !== session?.office && !isForce) {
      toast.error(`Sai VP — đơn thuộc ${order.toOffice} (E-VP-001)`);
      return;
    }
    if (!online) {
      st.enqueueOffline({ kind: "SCAN_IN", payload: { code: c, office: session?.office } });
      toast.info("Offline: đã lưu vào hàng đợi");
      setCode("");
      return;
    }
    // GAP-2: DEPARTED → UNLOADING khi bắt đầu quét nhập
    if (order.tripCode) {
      const trip = st.trips.find((t) => t.code === order.tripCode);
      if (trip && trip.status === "DEPARTED") {
        st.transitionTrip(trip.code, "UNLOADING");
      }
    }
    const isHub = order.hubOffice && order.hubOffice === session?.office && order.toOffice !== session?.office;
    const s = suggestShelf(order.receiverPhone);
    setPending({ code: c, suggested: s });
    setShelf(s);
    if (isHub) {
      // hub scan: keep IN_TRANSIT, push HUB_IN event
      st.updateOrder(c, {});
      st.audit({ action: "HUB_IN", entityType: "order", entityId: c, detail: `Hub ${session?.office}` });
      toast.info(`HUB_IN ${c} · giữ IN_TRANSIT`);
    } else {
      const t = st.transitionOrder(c, "AT_DEST", "SCAN_IN", `VP ${session?.office}`);
      if (!t.ok) return toast.error(t.error);
      toast.success(`Đã nhập ${c} · AT_DEST`);
    }
    setCode("");
  };

  const confirmShelf = () => {
    if (!pending || shelf === null) return;
    const st = useStore.getState();
    st.updateOrder(pending.code, { shelf });
    if (shelf !== pending.suggested) {
      st.audit({ action: "SHELF_OVERRIDE", entityType: "order", entityId: pending.code, detail: `${pending.suggested}→${shelf}` });
    }
    toast.success(`Kệ ${shelf} · ${pending.code}`);
    setPending(null);
    setShelf(null);
  };

  return (
    <div className="space-y-4">
      <Section title="Quét mã" right={<OfflineBadge />}>
        <div className="flex aspect-video max-h-56 items-center justify-center rounded-md border-2 border-dashed bg-black/90 text-primary-foreground/80">
          <div className="text-center">
            <Camera className="mx-auto h-12 w-12 opacity-60" />
            <p className="mt-2 text-sm">Camera quét — VP hiện tại: <b>{session?.office}</b></p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nhập mã (giả lập)"
            onKeyDown={(e) => e.key === "Enter" && doScan()} />
          <Button onClick={doScan}>Quét</Button>
        </div>
      </Section>

      <Section title="Gợi ý kệ">
        {!pending ? (
          <p className="text-sm text-muted-foreground">Quét mã để nhận gợi ý.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Kệ gợi ý</div>
              <div className="mt-1 text-5xl font-bold text-primary">{pending.suggested}</div>
            </div>
            <div>
              <Label className="text-xs">Kệ xác nhận (0–9)</Label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Button key={i} variant={shelf === i ? "default" : "outline"} className="h-14 text-lg font-bold" onClick={() => setShelf(i)}>
                    {i}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={confirmShelf}>Xác nhận kệ</Button>
          </div>
        )}
      </Section>
    </div>
  );
}
