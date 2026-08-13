import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { useMemo, useState } from "react";
import { RefreshCw, TriangleAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/doi-soat")({
  head: () => ({ meta: [{ title: "Đối soát chuyến — X.E" }] }),
  component: () => (
    <ProtectedPage title="Đối soát chuyến" screen="doi-soat">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const trips = useStore((s) => s.trips);
  const orders = useStore((s) => s.orders);
  const integrations = useStore((s) => s.integrations);
  const [code, setCode] = useState(trips[0]?.code ?? "");
  const [nonce, setNonce] = useState(0);

  const trip = trips.find((t) => t.code === code);

  const stat = useMemo(() => {
    if (!trip) return { loaded: 0, arrived: 0, missing: [] as string[] };
    const loadedCodes = trip.loadedCodes && trip.loadedCodes.length ? trip.loadedCodes : trip.scannedCodes ?? [];
    const arrivedCodes = loadedCodes.filter((c) => {
      const o = orders.find((x) => x.code === c);
      return o && ["AT_DEST", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status);
    });
    const missing = loadedCodes.filter((c) => !arrivedCodes.includes(c));
    return { loaded: loadedCodes.length, arrived: arrivedCodes.length, missing };
  }, [trip, orders, nonce]);

  const diff = stat.loaded - stat.arrived;
  const hasTelegram = !!integrations.telegramToken;

  return (
    <div className="space-y-4">
      <Section title="Chọn chuyến" right={
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setNonce((n) => n + 1)}><RefreshCw className="h-4 w-4" />Làm mới</Button>
      }>
        <div className="space-y-1.5 sm:max-w-sm">
          <Label className="text-xs">Chuyến</Label>
          <SearchableSelect
            value={code}
            onValueChange={setCode}
            options={trips.map((t) => ({ value: t.code, label: `${t.code} — ${t.route}` }))}
          />
        </div>
      </Section>

      {trip && (diff > 0 ? (
        <div className="rounded-md border-2 border-destructive bg-destructive/10 p-6 text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
          <div className="mt-2 text-lg font-bold text-destructive">Lệch chuyến — thiếu {diff} đơn</div>
          <p className="mt-1 text-sm text-destructive/80">
            {hasTelegram ? "Đã gửi Telegram ĐH." : "Chưa cấu hình Telegram — vào Tích hợp để bật."}
          </p>
        </div>
      ) : stat.loaded === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có đơn xuất.</div>
      ) : (
        <div className="rounded-md border border-success/40 bg-success/10 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <div className="mt-2 text-lg font-bold text-success">Khớp chuyến</div>
          {trip.status === "UNLOADING" && (
            <Button className="mt-3" onClick={() => {
              const r = useStore.getState().transitionTrip(trip.code, "CLOSED");
              if (r.ok) toast.success("Đã đóng chuyến"); else toast.error(r.error);
            }}>Đóng chuyến</Button>
          )}
        </div>
      ))}

      {trip && (
        <Section title="Chi tiết đối soát">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Số xuất" value={stat.loaded} />
            <Metric label="Số nhập" value={stat.arrived} />
            <Metric label="Thiếu" value={diff} highlight={diff > 0} />
          </div>
          {stat.missing.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">DS đơn thiếu</div>
              <ul className="space-y-1 text-sm">
                {stat.missing.map((m) => (
                  <li key={m} className="rounded border border-destructive/30 bg-destructive/5 px-3 py-1.5 font-medium text-destructive">{m}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-4 text-center ${highlight ? "border-destructive/40 bg-destructive/10" : "bg-muted/30"}`}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${highlight ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
