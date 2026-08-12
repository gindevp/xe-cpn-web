import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GOODS_TYPES, COLLECT_FORMS, formatVND } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { calcFare, genDraftCode, isValidVNPhone } from "@/lib/pricing";
import { toast } from "sonner";
import xeLogo from "@/assets/xe-logo.png";

export const Route = createFileRoute("/tao-don")({
  head: () => ({
    meta: [
      { title: "Tạo đơn — X.E Việt Nam" },
      { name: "description", content: "Khách tạo đơn nháp qua QR — X.E Việt Nam." },
    ],
  }),
  component: PublicOrderForm,
});

function PublicOrderForm() {
  const offices = useStore((s) => s.offices);
  const profiles = useStore((s) => s.customerProfiles);
  const addOrder = useStore((s) => s.addOrder);
  const upsertCustomer = useStore((s) => s.upsertCustomer);

  const [senderPhone, setSenderPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [goodsType, setGoodsType] = useState("");
  const [collectForm, setCollectForm] = useState("");
  const [toOffice, setToOffice] = useState("");
  const [homeDelivery, setHomeDelivery] = useState(false);
  const [homeAddress, setHomeAddress] = useState("");
  const [hubOffice, setHubOffice] = useState("");
  const [note, setNote] = useState("");
  const [homePickup, setHomePickup] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [estWeight, setEstWeight] = useState("");
  const [draft, setDraft] = useState<{ code: string; fare: number } | null>(null);

  // BR-012 autofill sender name from profile
  useEffect(() => {
    if (isValidVNPhone(senderPhone) && profiles[senderPhone] && !senderName) {
      setSenderName(profiles[senderPhone].name);
      toast.info("Đã tự điền tên gửi từ hồ sơ khách");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderPhone]);

  const estKg = useMemo(() => {
    // BR-029: dùng điểm giữa bậc, >10 kg → 12 kg
    const map: Record<string, number> = { "0–1 kg": 0.5, "1–3 kg": 2, "3–5 kg": 4, "5–10 kg": 7.5, ">10 kg": 12 };
    return map[estWeight] ?? 0;
  }, [estWeight]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidVNPhone(senderPhone) || !isValidVNPhone(receiverPhone)) {
      toast.error("SĐT không hợp lệ (VN)");
      return;
    }
    if (goodsType === "CAM_GUI") { toast.error("Loại hàng bị chặn gửi"); return; }
    if (!receiverName || !goodsType || !collectForm) { toast.error("Vui lòng điền các trường bắt buộc"); return; }
    if (homeDelivery && (!homeAddress || !hubOffice)) { toast.error("Giao TN cần địa chỉ + VP đầu mối"); return; }
    if (!homeDelivery && !toOffice) { toast.error("Vui lòng chọn VP đích"); return; }

    const fromOffice = "GP"; // demo public
    const targetOffice = homeDelivery ? hubOffice : toOffice;
    const route = `${fromOffice} → ${targetOffice}`;
    const fareBd = calcFare({
      route, realKg: estKg, goodsType,
      homeDelivery, homePickup,
    });
    const now = new Date().toISOString();

    const { isApiEnabled } = await import("@/lib/api/client");
    let draftCode = genDraftCode(fromOffice);
    let fare = fareBd.total;
    if (isApiEnabled()) {
      try {
        const { createDraft } = await import("@/lib/api/domain-api");
        const res = await createDraft({
          senderPhone,
          senderName: senderName || undefined,
          receiverName,
          receiverPhone,
          goodsType,
          paymentTerm: collectForm,
          estimatedWeightKg: estKg || undefined,
          homeDelivery,
          deliveryAddress: homeDelivery ? homeAddress : undefined,
          homePickup,
          pickupAddress: homePickup ? pickupAddress || undefined : undefined,
          toOfficeCode: homeDelivery ? undefined : targetOffice,
          hubOfficeCode: homeDelivery ? hubOffice : undefined,
          fromOfficeCode: fromOffice,
          note: note || undefined,
        });
        draftCode = res.draftCode || res.orderCode;
        fare = Number(res.fareAmount ?? fare);
      } catch (err: any) {
        toast.error(err?.message || "Không tạo được đơn nháp trên máy chủ");
        return;
      }
    }

    const o: OrderX = {
      code: draftCode, // temporary; will be replaced at counter confirm
      draftCode,
      senderPhone, senderName,
      receiverName, receiverPhone,
      fromOffice,
      toOffice: homeDelivery ? fromOffice : targetOffice,
      hubOffice: homeDelivery ? hubOffice : undefined,
      address: homeDelivery ? homeAddress : undefined,
      goodsType, collectForm,
      weightKg: estKg || undefined,
      quantity: 1,
      fare,
      pickupFee: fareBd.pickupFee, deliveryFee: fareBd.deliveryFee,
      homeDelivery, homePickup,
      status: "DRAFT",
      createdAt: now, updatedAt: now,
      note,
      events: [{ at: now, by: "customer", action: "DRAFT_CREATE" }],
    };
    addOrder(o);
    upsertCustomer(senderPhone, senderName);
    setDraft({ code: draftCode, fare });
    toast.success("Đã tạo đơn nháp");
  };

  void pickupAddress;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center gap-3">
        <img src={xeLogo} alt="X.E" className="h-10 w-10 rounded-md" />
          <div>
            <div className="text-base font-semibold">X.E Việt Nam</div>
            <div className="text-xs text-muted-foreground">Tạo đơn nhanh qua QR</div>
          </div>
        </div>

        {draft && (
          <Card className="mb-4 border-success/40 bg-success/10">
            <CardContent className="py-4">
              <div className="text-sm font-medium">Đơn nháp đã tạo</div>
              <div className="mt-1 text-lg font-semibold">{draft.code}</div>
              <div className="mt-1 text-sm">
                Cước <span className="text-muted-foreground">(Tạm tính)</span>: <span className="font-semibold">{formatVND(draft.fare)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Đến quầy X.E để chốt đơn và cân chính xác. Đơn nháp hết hạn sau 24h.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Thông tin đơn gửi</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="SĐT người gửi *"><Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="09xxxxxxxx" /></F>
                <F label="Tên người gửi"><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} /></F>
                <F label="Tên người nhận *"><Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} /></F>
                <F label="SĐT người nhận *"><Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="09xxxxxxxx" /></F>
                <F label="Loại hàng *">
                  <Select value={goodsType} onValueChange={setGoodsType}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>{GOODS_TYPES.map((g) => (<SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>))}</SelectContent>
                  </Select>
                </F>
                <F label="Hình thức thu *">
                  <Select value={collectForm} onValueChange={setCollectForm}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>{COLLECT_FORMS.map((g) => (<SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>))}</SelectContent>
                  </Select>
                </F>
                <F label="Ước lượng cân">
                  <Select value={estWeight} onValueChange={setEstWeight}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {["0–1 kg", "1–3 kg", "3–5 kg", "5–10 kg", ">10 kg"].map((w) => (<SelectItem key={w} value={w}>{w}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </F>
              </div>

              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="hd" checked={homeDelivery} onCheckedChange={(v) => setHomeDelivery(Boolean(v))} />
                  <Label htmlFor="hd">Giao tận nhà</Label>
                </div>
                {homeDelivery ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <F label="Địa chỉ giao *"><Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} /></F>
                    <F label="VP đầu mối *">
                      <Select value={hubOffice} onValueChange={setHubOffice}>
                        <SelectTrigger><SelectValue placeholder="Chọn VP" /></SelectTrigger>
                        <SelectContent>{offices.map((o) => (<SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </F>
                  </div>
                ) : (
                  <div className="mt-3">
                    <F label="VP đích *">
                      <Select value={toOffice} onValueChange={setToOffice}>
                        <SelectTrigger><SelectValue placeholder="Chọn VP" /></SelectTrigger>
                        <SelectContent>{offices.map((o) => (<SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </F>
                  </div>
                )}
              </div>

              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="hp" checked={homePickup} onCheckedChange={(v) => setHomePickup(Boolean(v))} />
                  <Label htmlFor="hp">Lấy tận nhà</Label>
                </div>
                {homePickup && (
                  <div className="mt-3">
                    <F label="Địa chỉ lấy"><Input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} /></F>
                  </div>
                )}
              </div>

              <F label="Ghi chú"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></F>
              <Button type="submit" className="w-full">Tạo đơn nháp</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
