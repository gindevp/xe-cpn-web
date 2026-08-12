import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, OfflineBadge } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { Camera, MinusCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/quet-xuat")({
  head: () => ({ meta: [{ title: "Quét xuất — X.E" }] }),
  component: () => (
    <ProtectedPage title="Quét xuất chuyến" screen="quet-xuat">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const trips = useStore((s) => s.trips);
  const orders = useStore((s) => s.orders);
  const online = useStore((s) => s.online);
  const openTrips = useMemo(() => trips.filter((t) => ["CREATED", "LOADING"].includes(t.status)), [trips]);
  const [trip, setTrip] = useState(openTrips[0]?.code ?? "");
  const [mode, setMode] = useState<"scan" | "remove">("scan");
  const [input, setInput] = useState("");

  const currentTrip = trips.find((t) => t.code === trip);
  const scannedCodes = currentTrip?.scannedCodes ?? [];

  const doScan = () => {
    const code = input.trim().toUpperCase();
    if (!code) return;
    if (!currentTrip) return toast.error("Chọn chuyến");
    const st = useStore.getState();
    const { transitionOrder, updateTrip, updateOrder, transitionTrip, enqueueOffline, audit } = st;

    if (currentTrip.status === "CREATED") {
      transitionTrip(currentTrip.code, "LOADING");
    }

    if (!online) {
      enqueueOffline({ kind: "SCAN_OUT", payload: { trip: trip, code, mode } });
      toast.info("Offline: đã lưu vào hàng đợi");
      setInput("");
      return;
    }

    const order = orders.find((o) => o.code === code);
    if (!order) { toast.error(`Không tồn tại đơn ${code} (E-SCAN-404)`); return; }

    if (mode === "remove") {
      if (!scannedCodes.includes(code)) return toast.error("Chưa gắn");
      updateTrip(trip, { scannedCodes: scannedCodes.filter((c) => c !== code) });
      updateOrder(code, { tripCode: undefined });
      transitionOrder(code, "WAITING", "SCAN_REMOVE", `Trip ${trip}`);
      audit({ action: "SCAN_REMOVE", entityType: "order", entityId: code, detail: trip });
      toast.info(`Đã gỡ ${code}`);
      setInput("");
      return;
    }

    // scan add
    if (!["CONFIRMED", "WAITING"].includes(order.status))
      return toast.error(`Trạng thái ${order.status} không cho gắn (E-SCAN-STATE)`);
    if (order.tripCode && order.tripCode !== trip)
      return toast.error(`Đơn thuộc chuyến khác (${order.tripCode})`);
    if (!order.labelPrintedAt)
      toast.warning("Cảnh báo: chưa in tem (BR-041) — vẫn cho quét");
    updateTrip(trip, { scannedCodes: [...scannedCodes, code], loadedCodes: [...(currentTrip.loadedCodes ?? []), code] });
    updateOrder(code, { tripCode: trip });
    const t = transitionOrder(code, "IN_TRANSIT", "SCAN_OUT", `Trip ${trip}`);
    if (!t.ok) return toast.error(t.error);
    toast.success(`Đã gắn ${code}`);
    setInput("");
  };

  const departTrip = () => {
    if (!currentTrip) return;
    const r = useStore.getState().transitionTrip(currentTrip.code, "DEPARTED");
    if (!r.ok) toast.error(r.error); else toast.success("Xuất bến");
  };

  return (
    <div className="space-y-4">
      <Section title="Chuyến & chế độ" right={<OfflineBadge />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Chuyến (LOADING/CREATED)</Label>
            <Select value={trip} onValueChange={setTrip}>
              <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
              <SelectContent>
                {openTrips.map((t) => (<SelectItem key={t.code} value={t.code}>{t.code} — {t.route}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tổng đã quét</Label>
            <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-2xl font-bold text-primary">
              {scannedCodes.length}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chế độ</Label>
            <div className="grid grid-cols-2 gap-1">
              <Button variant={mode === "scan" ? "default" : "outline"} onClick={() => setMode("scan")} className="gap-1">
                <Camera className="h-4 w-4" /> Quét
              </Button>
              <Button variant={mode === "remove" ? "destructive" : "outline"} onClick={() => setMode("remove")} className="gap-1">
                <MinusCircle className="h-4 w-4" /> Gỡ
              </Button>
            </div>
          </div>
        </div>
        {currentTrip && currentTrip.status === "LOADING" && (
          <div className="mt-3">
            <Button variant="secondary" onClick={departTrip}>Xuất bến chuyến này</Button>
          </div>
        )}
      </Section>

      <Section title="Camera quét">
        <div className="flex aspect-video max-h-64 items-center justify-center rounded-md border-2 border-dashed bg-black/90 text-primary-foreground/80">
          <div className="text-center">
            <Camera className="mx-auto h-12 w-12 opacity-60" />
            <p className="mt-2 text-sm">Camera quét mã · &lt;1s/lần</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="Nhập mã (giả lập quét)" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doScan()} />
          <Button onClick={doScan}>{mode === "scan" ? "Gắn" : "Gỡ"}</Button>
        </div>
      </Section>

      <Section title="Đơn đã quét">
        {scannedCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa quét đơn nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b"><th className="py-2 pr-4">Mã</th><th className="py-2 pr-4">Cập nhật</th></tr>
              </thead>
              <tbody>
                {scannedCodes.slice().reverse().map((c) => {
                  const o = orders.find((x) => x.code === c);
                  return (
                    <tr key={c} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{c}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{o ? formatDateTime(o.updatedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
