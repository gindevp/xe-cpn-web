import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, OfflineBadge } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PAY_METHODS, formatVND } from "@/lib/mock-data";
import { MoneyInput } from "@/components/MoneyInput";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { PodPhotoInput } from "@/components/PodPhotoInput";
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
  const [amt, setAmt] = useState(0);
  const [pay, setPay] = useState<"TM" | "CK" | "THE">("TM");

  const find = () => {
    const s = q.trim();
    const o = orders.find((x) => x.code === s || x.receiverPhone === s);
    if (!o) return toast.error("Không tìm thấy đơn");
    if (o.status === "DELIVERED") return toast.error("Đã giao (E-POD-057)");
    setCode(o.code);
    setAmt(Math.max(0, o.fare + (o.deliveryFee ?? 0) - (o.paidAmount ?? 0)));
    toast.success(`Đã tìm ${o.code}`);
  };

  const confirm = () => {
    if (!name) return toast.error("Bắt buộc tên nhận thực tế");
    if (photos.length === 0) return toast.error("Cần ≥1 ảnh POD");
    const amount = amt || 0;
    // E-POD-057 vẫn chặn khi đã DELIVERED
    const cur = useStore.getState().orders.find((x) => x.code === code);
    if (cur?.status === "DELIVERED") return toast.error("Đã giao (E-POD-057)");

    if (!online) {
      enqueueOffline({
        kind: "POD_COUNTER",
        payload: { code, actualName: name, actualPhone: pickup, photos, amount, method: pay },
      });
      toast.info("Offline: đã lưu vào hàng đợi");
      setCode(""); setName(""); setPickup(""); setPhotos([]); setAmt(0); setQ("");
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
    const t = transitionOrder(
      code,
      "DELIVERED",
      "POD_QUAY",
      `${name}${amount ? " · thu " + formatVND(amount) : ""}`,
      { collectedAmount: amount || 0, paymentMethod: pay },
    );
    if (!t.ok) return toast.error(t.error);
    toast.success("Đã POD · DELIVERED");
    setCode(""); setName(""); setPickup(""); setPhotos([]); setAmt(0); setQ("");
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
            <PodPhotoInput photos={photos} onChange={setPhotos} max={3} />
          </Section>
          <Section title="Thu tiền">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Số thu"><MoneyInput value={amt} onChange={setAmt} /></F>
              <F label="Phương thức">
                <SearchableSelect
                  value={pay}
                  onValueChange={(v) => setPay(v as any)}
                  options={PAY_METHODS.map((p) => ({ value: p.value, label: p.label }))}
                />
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
