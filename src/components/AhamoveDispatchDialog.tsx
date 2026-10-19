import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressPicker } from "@/components/AddressPicker";
import { HomeDeliveryMap } from "@/components/HomeDeliveryMap";
import { ahamoveDispatch, ahamovePickupDispatch, grabDispatch, grabPickupDispatch } from "@/lib/api/domain-api";
import { estimateGrab, estimatePickupKm } from "@/lib/api/ahamove-api";
import { ahamoveBlockReason, ahamoveDue, ahamovePickupBlockReason } from "@/lib/ahamove";
import { findOfficeByToken, orderReceiverOffice } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useStore, type OrderX } from "@/lib/store";

const BULKY_CHOICES = [
  { id: "", title: "Tiêu chuẩn", size: "50×40×50cm ~ 30kg", fee: "Miễn phí" },
  { id: "TIER_2", title: "Mức 1", size: "60×50×60cm ~ 40kg", fee: "10.000đ" },
  { id: "TIER_3", title: "Mức 2", size: "70×60×70cm ~ 60kg", fee: "20.000đ" },
  { id: "TIER_4", title: "Mức 3", size: "90×70×90cm ~ 80kg", fee: "40.000đ" },
] as const;

const GRAB_VEHICLES = [
  { id: "", title: "Xe máy", size: "Hàng nhỏ" },
  { id: "TIER_2", title: "Ô tô", size: "Hàng vừa" },
  { id: "TIER_3", title: "Van", size: "Hàng cồng kềnh" },
  { id: "TIER_4", title: "Xe tải", size: "Hàng lớn" },
] as const;

const TIP_UNIT = 5000;
const TIP_CHOICES = [0, 1, 2, 3, 4, 5, 6] as const;

/** Nội dung gọi Ahamove giao tận nơi — dùng trong tab "Đối tác vận chuyển" của popup Gán Shipper. */
export function AhamovePartnerPanel({
  order,
  busy,
  setBusy,
  onDone,
  purpose = "delivery",
  partner = "AHAMOVE",
}: {
  order: OrderX;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  /** delivery = giao từ VP nhận; pickup = lấy tại địa chỉ người gửi về VP gửi. */
  purpose?: "delivery" | "pickup";
  partner?: "AHAMOVE" | "GRAB";
}) {
  const offices = useStore((s) => s.offices);
  const [address, setAddress] = useState("");
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [linkPin, setLinkPin] = useState<{ lat: number; lng: number } | null>(null);
  const [useGps, setUseGps] = useState(false);
  const [bulkyTier, setBulkyTier] = useState("");
  const [tipUnits, setTipUnits] = useState(0);

  const pickupJob = purpose === "pickup";
  const grab = partner === "GRAB";
  const brand = grab ? "Grab" : "Ahamove";
  const orderCode = order.code;
  const orderAddress = pickupJob ? order.pickupAddress : order.address;
  useEffect(() => {
    setAddress(orderAddress ?? "");
    setRemarks("");
    setPin(null);
    setLinkPin(null);
    setUseGps(false);
    setBulkyTier("");
    setTipUnits(0);
    // Chỉ reset khi mở đơn khác — polling cập nhật đơn không được xoá địa chỉ NV đang sửa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode, orderAddress]);

  const office = findOfficeByToken(pickupJob ? order.fromOffice : orderReceiverOffice(order), offices);
  const block = pickupJob ? ahamovePickupBlockReason(order) : ahamoveBlockReason(order);
  const advance = pickupJob || block ? 0 : ahamoveDue(order);

  const hasAddress = address.trim().length > 0;
  const gps = useGps ? pin : linkPin;

  const [addrEst, setAddrEst] = useState<{ km: number | null; fee: number | null; bulky: boolean } | null>(null);
  const [addrEstErr, setAddrEstErr] = useState<string | null>(null);
  const [addrEstLoading, setAddrEstLoading] = useState(false);
  const officeLat = office?.latitude ?? null;
  const officeLng = office?.longitude ?? null;
  const officeAddress = office?.address;
  useEffect(() => {
    setAddrEst(null);
    setAddrEstErr(null);
    const addr = address.trim();
    const grabPin = useGps ? pin : linkPin;
    if (officeLat == null || officeLng == null) {
      setAddrEstLoading(false);
      return;
    }
    if (grab) {
      if ((useGps && !pin) || (!useGps && addr.length < 8 && !linkPin)) {
        setAddrEstLoading(false);
        return;
      }
    } else if (useGps || (addr.length < 8 && !linkPin)) {
      setAddrEstLoading(false);
      return;
    }
    let cancelled = false;
    setAddrEstLoading(true);
    const t = setTimeout(() => {
      const quote = grab
        ? estimateGrab({
            officeLat,
            officeLng,
            officeAddress: officeAddress ?? undefined,
            pinAddress: addr,
            pinLat: grabPin?.lat,
            pinLng: grabPin?.lng,
            orderCode,
            bulkyTier,
          })
        : estimatePickupKm({
            officeLat,
            officeLng,
            officeAddress,
            pinAddress: addr,
            pinLat: linkPin?.lat,
            pinLng: linkPin?.lng,
            orderCode,
            bulkyTier,
            tipUnits,
          });
      quote
        .then((r) => {
          if (cancelled) return;
          setAddrEst({
            km: r.distanceKm != null ? Number(r.distanceKm) : null,
            fee: r.totalPrice != null ? Number(r.totalPrice) : null,
            bulky: !!r.bulkyTier,
          });
        })
        .catch((e) => {
          if (!cancelled) setAddrEstErr(e instanceof Error ? e.message : "Không ước tính được phí");
        })
        .finally(() => {
          if (!cancelled) setAddrEstLoading(false);
        });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [useGps, address, officeLat, officeLng, officeAddress, orderCode, linkPin, pin, bulkyTier, tipUnits, grab]);
  const ready = useGps ? pin != null : hasAddress;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const body = {
        lat: gps?.lat,
        lng: gps?.lng,
        address: address.trim() || undefined,
        remarks: remarks.trim() || undefined,
        bulkyTier,
        tipUnits,
      };
      if (grab) {
        if (pickupJob) await grabPickupDispatch(order.code, body);
        else await grabDispatch(order.code, body);
      } else if (pickupJob) await ahamovePickupDispatch(order.code, body);
      else await ahamoveDispatch(order.code, body);
      toast.success(
        pickupJob
          ? `Đã gọi ${brand} lấy ${order.code} — chờ tài xế đến lấy`
          : `Đã gọi ${brand} cho ${order.code} — chờ tài xế nhận`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Gọi ${brand} thất bại`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <div>
          {pickupJob ? "Người gửi" : "Người nhận"}:{" "}
          <strong>{pickupJob ? order.senderName : order.receiverName}</strong> ·{" "}
          {pickupJob ? order.senderPhone : order.receiverPhone}
        </div>
        <div className="text-xs text-muted-foreground">
          {pickupJob ? "Giao về" : "Lấy hàng tại"}: {office?.name ?? (pickupJob ? order.fromOffice : orderReceiverOffice(order))}
          {office?.address ? ` — ${office.address}` : ""}
        </div>
      </div>
      {block ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {block}
        </p>
      ) : (
        <>
          <AddressPicker
            label={pickupJob ? "Địa chỉ lấy" : "Địa chỉ giao"}
            required
            value={address}
            onChange={setAddress}
            onPinChange={setLinkPin}
            allowMapLink
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={useGps} onCheckedChange={(v) => setUseGps(v === true)} />
            Lấy GPS trên bản đồ (ghim vị trí, xem phí ước tính)
          </label>
          <HomeDeliveryMap
            enabled={useGps}
            address={address}
            fixedPin={linkPin}
            label={pickupJob ? `lấy ${brand}` : `giao ${brand}`}
            officeLat={office?.latitude ?? null}
            officeLng={office?.longitude ?? null}
            officeAddress={office?.address}
            onPinChange={setPin}
            showFee={!grab}
            orderCode={order.code}
            bulkyTier={bulkyTier}
            tipUnits={tipUnits}
          />
          {useGps && !pin ? (
            <p className="text-xs text-destructive">Chưa ghim được vị trí — kéo ghim trên bản đồ hoặc bỏ chọn GPS.</p>
          ) : null}
          {!useGps || grab ? (
            <>
              <div className="rounded-md border px-3 py-2 text-sm">
                {addrEstLoading ? (
                  <span className="text-muted-foreground">Đang ước tính phí {brand}…</span>
                ) : addrEst ? (
                  <span>
                    {addrEst.km != null ? (
                      <>
                        Khoảng cách: <strong>{addrEst.km.toFixed(2)} km</strong>
                      </>
                    ) : null}
                    {addrEst.fee != null ? (
                      <span className="ml-2">
                        · Phí {brand} ~<strong>{addrEst.fee.toLocaleString("vi-VN")}đ</strong>
                        {!grab && (addrEst.bulky || tipUnits > 0) ? (
                          <span className="text-xs text-muted-foreground">
                            {addrEst.bulky ? " (đã cộng phụ phí)" : ""}
                            {tipUnits > 0 ? ` (gồm tip ${(tipUnits * TIP_UNIT).toLocaleString("vi-VN")}đ)` : ""}
                          </span>
                        ) : null}
                        {grab && tipUnits > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {` · tip ${(tipUnits * TIP_UNIT).toLocaleString("vi-VN")}đ trả khi giao thành công`}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-muted-foreground">{grab ? "(báo giá Grab)" : "(theo địa chỉ)"}</span>
                  </span>
                ) : addrEstErr ? (
                  <span className="text-destructive">{addrEstErr}</span>
                ) : (
                  <span className="text-muted-foreground">
                    {`Nhập địa chỉ ${pickupJob ? "lấy" : "giao"} để ước tính phí.`}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {grab
                  ? "Nhập địa chỉ là Grab báo giá. Có link map hoặc ghim thì dùng đúng toạ độ đó."
                  : "Gửi địa chỉ chi tiết cho Ahamove. Nếu đã dán link Google Maps trong popup, chỉ dòng địa chỉ chi tiết được gửi kèm GPS của link."}
              </p>
            </>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-xs">{grab ? "Loại xe Grab" : "Phụ phí hàng cồng kềnh"}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(grab ? GRAB_VEHICLES : BULKY_CHOICES).map((c) => {
                const on = bulkyTier === c.id;
                const fee = "fee" in c ? c.fee : null;
                return (
                  <button
                    key={c.id || "standard"}
                    type="button"
                    onClick={() => setBulkyTier(c.id)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-left",
                      on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="text-sm font-medium">{c.title}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.size}</div>
                    {fee ? (
                      <div className={cn("mt-1 text-xs font-semibold", c.id ? "text-foreground" : "text-emerald-700")}>
                        {fee}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {grab ? (
              <p className="text-[11px] text-muted-foreground">
                Phí trên báo giá là giá Grab cho loại xe này, không cộng thêm mức phụ phí.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hỗ trợ tài xế (tip)</Label>
            <div className="flex flex-wrap gap-1.5">
              {TIP_CHOICES.map((n) => {
                const on = tipUnits === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTipUnits(n)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      on ? "border-primary bg-primary/5 font-semibold text-primary" : "hover:bg-muted/50",
                    )}
                  >
                    {n === 0 ? "Không" : `${(n * TIP_UNIT).toLocaleString("vi-VN")}đ`}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {grab
                ? "Chọn trước, 5.000đ/suất, tối đa 30.000đ. Giao thành công thì hệ thống tự trả tip và cộng vào phí đối tác. Đơn tài xế phải ứng cước thì Grab không nhận tip."
                : "5.000đ/suất, tối đa 30.000đ. Cộng vào phí đối tác, không cộng cước khách."}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú cho tài xế</Label>
            <Input
              value={remarks}
              maxLength={200}
              placeholder="VD: gọi trước khi đến, hàng dễ vỡ…"
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          {advance > 0 ? (
            <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Tài xế sẽ ứng <strong>{advance.toLocaleString("vi-VN")}đ</strong> khi đến lấy, rồi thu lại{" "}
              {advance.toLocaleString("vi-VN")}đ của người nhận. Đơn vẫn <strong>chưa thu</strong> lúc gọi. Khi ship đến,
              điều phối quét bàn giao trên app thì mới chuyển <strong>đã thanh toán nhận ứng</strong>.
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Phí {brand} là chi phí đối tác, không cộng vào cước khách.
            {advance > 0 ? "" : " Không thu tiền khi giao."}
          </p>
        </>
      )}
      <Button className="w-full" disabled={busy || !ready || block != null} onClick={() => void submit()}>
        {busy ? "Đang gọi…" : `Gọi ${brand}`}
      </Button>
    </div>
  );
}
