import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ORDER_STATUS_LABEL, formatDateTime, officeName } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { OrderStatusBadge } from "@/components/StatusBadge";
import xeLogo from "@/assets/xe-logo.png";

export const Route = createFileRoute("/tra-cuu")({
  head: () => ({
    meta: [
      { title: "Tra cứu đơn — X.E Việt Nam" },
      { name: "description", content: "Tra cứu vận đơn X.E Việt Nam bằng mã và SĐT." },
    ],
  }),
  component: TracuuPage,
});

function TracuuPage() {
  const orders = useStore((s) => s.orders);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<null | { found: boolean; order?: any }>(null);

  const search = async () => {
    const { isApiEnabled } = await import("@/lib/api/client");
    if (isApiEnabled()) {
      try {
        const { trackOrder } = await import("@/lib/api/domain-api");
        const res = await trackOrder(code.trim(), phone.trim());
        if (!res.found) {
          setResult({ found: false });
          return;
        }
        setResult({
          found: true,
          order: {
            code: res.orderCode,
            draftCode: res.draftCode,
            status: res.status,
            fromOffice: res.fromOfficeCode,
            toOffice: res.toOfficeCode,
            receiverName: res.receiverName,
            updatedAt: new Date().toISOString(),
            events: (res.events ?? []).map((e) => ({
              at: typeof e.at === "string" ? e.at : new Date(e.at as any).toISOString(),
              by: e.by ?? "system",
              action: e.action,
              detail: e.detail,
            })),
          },
        });
        return;
      } catch {
        // fall through to local store
      }
    }
    const o = orders.find((x) =>
      (x.code === code.trim() || x.draftCode === code.trim()) &&
      (x.senderPhone === phone.trim() || x.receiverPhone === phone.trim()),
    );
    setResult(o ? { found: true, order: o } : { found: false });
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <img src={xeLogo} alt="X.E" className="h-10 w-10 rounded-md" />
          <div>
            <div className="text-base font-semibold">X.E Việt Nam</div>
            <div className="text-xs text-muted-foreground">Tra cứu vận đơn</div>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle>Tra cứu</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Mã vận đơn</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XE24… hoặc N-…" /></div>
              <div className="space-y-1.5"><Label>SĐT</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <Button onClick={search} className="w-full sm:w-auto">Tra cứu</Button>
            <p className="text-xs text-muted-foreground">Cần đúng cả mã và SĐT (gửi hoặc nhận).</p>
          </CardContent>
        </Card>

        {result && !result.found && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Không tìm thấy đơn (E-TRACK-404)
          </div>
        )}

        {result?.found && result.order && (
          <Card className="mt-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{result.order.code}</CardTitle>
              <OrderStatusBadge status={result.order.status} />
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                <Info label="VP đi" value={officeName(result.order.fromOffice)} />
                <Info label="VP đến" value={officeName(result.order.toOffice)} />
                <Info label="Người nhận" value={result.order.receiverName} />
                <Info label="Cập nhật" value={formatDateTime(result.order.updatedAt)} />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</div>
              <ol className="mt-2 space-y-3 border-l pl-4">
                {(result.order.events ?? []).map((e: any, i: number) => (
                  <li key={i} className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="text-sm font-medium">{e.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.by} · {formatDateTime(e.at)}{e.detail ? ` · ${e.detail}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
              {/* BR-003: NEVER render podPhotos in public tracking */}
              <p className="mt-4 text-xs text-muted-foreground">Trạng thái hiện tại: {ORDER_STATUS_LABEL[result.order.status as keyof typeof ORDER_STATUS_LABEL]}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}
