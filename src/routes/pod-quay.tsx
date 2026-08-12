import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, OfflineBadge } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAY_METHODS, formatVND } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { Camera, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pod-quay")({
  head: () => ({ meta: [{ title: "POD tại quầy — X.E" }] }),
  component: () => (
    <ProtectedPage title="POD tại quầy" screen="pod-quay">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const orders = useStore((s) => s.orders);
  const online = useStore((s) => s.online);
  const { transitionOrder, updateOrder, addPayment, addPodPhoto, enqueueOffline } = useStore.getState();

  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [amt, setAmt] = useState("");
  const [pay, setPay] = useState<"TM" | "CK" | "THE">("TM");

  const find = () => {
    const s = q.trim();
    const o = orders.find((x) => x.code === s || x.receiverPhone === s);
    if (!o) return toast.error("Không tìm thấy đơn");
    if (o.status === "DELIVERED") return toast.error("Đã giao (E-POD-057)");
    setCode(o.code);
    setAmt(String(Math.max(0, o.fare + (o.deliveryFee ?? 0) - (o.paidAmount ?? 0))));
    toast.success(`Đã tìm ${o.code}`);
  };

  const addPhoto = () => {
    if (photos.length >= 3) return toast.error("Tối đa 3 ảnh");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150'><rect width='100%' height='100%' fill='%23e5e7eb'/><text x='50%' y='50%' text-anchor='middle' font-size='16' fill='%236b7280'>POD ${photos.length + 1}</text></svg>`;
    setPhotos([...photos, `data:image/svg+xml;utf8,${svg}`]);
  };

  const confirm = () => {
    if (!name) return toast.error("Bắt buộc tên nhận thực tế");
    if (photos.length === 0) return toast.error("Cần ≥1 ảnh POD");
    const amount = Number(amt) || 0;
    // E-POD-057 vẫn chặn khi đã DELIVERED
    const cur = useStore.getState().orders.find((x) => x.code === code);
    if (cur?.status === "DELIVERED") return toast.error("Đã giao (E-POD-057)");

    if (!online) {
      enqueueOffline({
        kind: "POD_COUNTER",
        payload: { code, actualName: name, actualPhone: pickup, photos, amount, method: pay },
      });
      toast.info("Offline: đã lưu vào hàng đợi");
      setCode(""); setName(""); setPickup(""); setPhotos([]); setAmt(""); setQ("");
      return;
    }

    photos.forEach((p) => addPodPhoto(code, p));
    updateOrder(code, { receiverActualName: name, receiverActualPhone: pickup });
    if (amount > 0) {
      addPayment(code, {
        at: new Date().toISOString(), by: useStore.getState().session?.username ?? "quay",
        amount, method: pay, kind: "SAU",
      });
    }
    const t = transitionOrder(code, "DELIVERED", "POD_QUAY", `${name}${amount ? " · thu " + formatVND(amount) : ""}`);
    if (!t.ok) return toast.error(t.error);
    toast.success("Đã POD · DELIVERED");
    setCode(""); setName(""); setPickup(""); setPhotos([]); setAmt(""); setQ("");
  };

  return (
    <div className="space-y-4">
      <Section title="Tìm đơn" right={<OfflineBadge />}>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã vận đơn hoặc SĐT" onKeyDown={(e) => e.key === "Enter" && find()} />
          <Button onClick={find}>Tìm</Button>
        </div>
        {code && <p className="mt-2 text-sm text-muted-foreground">Đang POD: <strong>{code}</strong></p>}
      </Section>

      {code && (
        <>
          <Section title="Thông tin người nhận">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Tên nhận thực tế *"><Input value={name} onChange={(e) => setName(e.target.value)} /></F>
              <F label="SĐT lấy hộ"><Input value={pickup} onChange={(e) => setPickup(e.target.value)} /></F>
            </div>
          </Section>
          <Section title="Ảnh POD (1–3)">
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p} alt="pod" className="h-20 w-24 rounded border object-cover" />
                  <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white text-xs">×</button>
                </div>
              ))}
              {photos.length < 3 && (
                <button onClick={addPhoto} className="flex h-20 w-24 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground hover:bg-muted">
                  <Camera className="h-6 w-6" />
                </button>
              )}
            </div>
          </Section>
          <Section title="Thu tiền">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Số thu"><Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></F>
              <F label="Phương thức">
                <Select value={pay} onValueChange={(v) => setPay(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAY_METHODS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}</SelectContent>
                </Select>
              </F>
            </div>
          </Section>
          <div className="sticky bottom-0 -mx-3 border-t bg-card px-3 py-3 md:mx-0 md:rounded-md">
            <Button size="lg" className="w-full gap-2" onClick={confirm}>
              <PackageCheck className="h-5 w-5" /> Xác nhận giao
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
