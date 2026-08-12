import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatVND } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/day-ship")({
  head: () => ({ meta: [{ title: "Đẩy ship — X.E" }] }),
  component: () => (
    <ProtectedPage title="Đẩy ship đối tác" screen="day-ship">
      <Page />
    </ProtectedPage>
  ),
});

const PARTNERS = ["Ahamove", "Grab", "XanhSM"];

function Page() {
  const orders = useStore((s) => s.orders);
  const { transitionOrder, updateOrder, audit } = useStore.getState();
  const [orderCode, setOrderCode] = useState("");
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [quote, setQuote] = useState<number | null>(null);
  const [webhook, setWebhook] = useState("—");
  const [pushCount, setPushCount] = useState(0);

  const order = orders.find((o) => o.code === orderCode);
  const canPush = order && ["AT_DEST", "FAILED_DELIVERY"].includes(order.status);

  const getQuote = () => {
    setQuote(25000 + Math.floor(Math.random() * 40000));
    toast.success("Đã lấy báo giá");
  };

  const doPush = () => {
    if (!order) return toast.error("Nhập mã đơn");
    if (!canPush) return toast.error(`Trạng thái ${order.status} không đẩy được`);
    if (quote == null) return toast.error("Lấy báo giá trước");
    const partnerCode = `${partner.slice(0, 2).toUpperCase()}-${Math.floor(Math.random() * 90000 + 10000)}`;
    updateOrder(order.code, { partnerCode, partnerFee: quote });
    transitionOrder(order.code, "OUT_FOR_DELIVERY", "PUSH_SHIP", `${partner} · ${partnerCode}`);
    audit({ action: "PUSH_SHIP", entityType: "order", entityId: order.code, detail: `${partner} · ${formatVND(quote)}` });
    setWebhook("ACCEPTED");
    setPushCount((c) => c + 1);
    toast.success("Đã đẩy · ACCEPTED");
    // mock webhook after 2s: 70% delivered, 30% fail
    setTimeout(() => {
      const ok = Math.random() < 0.7;
      if (ok) {
        setWebhook("DELIVERED");
        useStore.getState().transitionOrder(order.code, "DELIVERED", "PARTNER_WEBHOOK", partner);
        toast.success(`${partner} · DELIVERED`);
      } else {
        setWebhook("FAILED");
        toast.error(`${partner} · webhook FAILED`);
      }
    }, 2000);
  };

  const doRetry = () => {
    if (webhook !== "FAILED") return toast.error("Chỉ đẩy lại khi thất bại");
    if (pushCount >= 3 && order) {
      useStore.getState().transitionOrder(order.code, "FAILED_DELIVERY", "PUSH_FAIL_3", partner);
      toast.error("Đã 3 lần fail → FAILED_DELIVERY");
      return;
    }
    doPush();
  };

  return (
    <div className="space-y-4">
      <Section title="Đơn cần đẩy">
        <div className="space-y-1.5 sm:max-w-sm">
          <Label className="text-xs">Mã đơn</Label>
          <Input value={orderCode} onChange={(e) => setOrderCode(e.target.value.toUpperCase())} placeholder="XE24…" />
        </div>
        {order && (
          <div className="mt-2 text-sm text-muted-foreground">
            {order.receiverName} · {order.receiverPhone} · {order.address ?? "—"} · Trạng thái: <b>{order.status}</b>
          </div>
        )}
      </Section>

      <Section title="Đối tác">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Đối tác">
            <Select value={partner} onValueChange={setPartner}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PARTNERS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}</SelectContent>
            </Select>
          </F>
          <F label="Phí báo giá (readonly)">
            <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-lg font-bold text-primary">
              {quote != null ? formatVND(quote) : "—"}
            </div>
          </F>
          <F label="Mã đối tác"><Input disabled value={order?.partnerCode ?? "—"} /></F>
          <F label="Webhook status"><Input disabled value={webhook} /></F>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={getQuote}>Lấy báo giá</Button>
          <Button disabled={!canPush || quote == null} onClick={doPush}>Đẩy</Button>
          <Button variant="ghost" onClick={doRetry} disabled={webhook !== "FAILED"}>Đẩy lại ({pushCount}/3)</Button>
        </div>
      </Section>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
