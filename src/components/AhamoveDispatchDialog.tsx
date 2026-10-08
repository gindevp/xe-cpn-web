import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressPicker } from "@/components/AddressPicker";
import { HomeDeliveryMap } from "@/components/HomeDeliveryMap";
import { ahamoveDispatch } from "@/lib/api/domain-api";
import { estimatePickupKm } from "@/lib/api/ahamove-api";
import { ahamoveBlockReason, ahamoveDue } from "@/lib/ahamove";
import { findOfficeByToken, orderReceiverOffice } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";

/** Nội dung gọi Ahamove giao tận nơi — dùng trong tab "Đối tác vận chuyển" của popup Gán Shipper. */
export function AhamovePartnerPanel({
  order,
  busy,
  setBusy,
  onDone,
}: {
  order: OrderX;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
}) {
  const offices = useStore((s) => s.offices);
  const [address, setAddress] = useState("");
  const [remarks, setRemarks] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [linkPin, setLinkPin] = useState<{ lat: number; lng: number } | null>(null);
  const [useGps, setUseGps] = useState(false);

  const orderCode = order.code;
  const orderAddress = order.address;
  useEffect(() => {
    setAddress(orderAddress ?? "");
    setRemarks("");
    setPin(null);
    setLinkPin(null);
    setUseGps(false);
    // Chỉ reset khi mở đơn khác — polling cập nhật đơn không được xoá địa chỉ NV đang sửa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  const office = findOfficeByToken(orderReceiverOffice(order), offices);
  const block = ahamoveBlockReason(order);
  const advance = block ? 0 : ahamoveDue(order);

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
    if (useGps || (addr.length < 8 && !linkPin) || officeLat == null || officeLng == null) {
      setAddrEstLoading(false);
      return;
    }
    let cancelled = false;
    setAddrEstLoading(true);
    const t = setTimeout(() => {
      estimatePickupKm({
        officeLat,
        officeLng,
        officeAddress,
        pinAddress: addr,
        pinLat: linkPin?.lat,
        pinLng: linkPin?.lng,
        orderCode,
      })
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
  }, [useGps, address, officeLat, officeLng, officeAddress, orderCode, linkPin]);
  const ready = useGps ? pin != null : hasAddress;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await ahamoveDispatch(order.code, {
        lat: gps?.lat,
        lng: gps?.lng,
        address: address.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });
      toast.success(`Đã gọi Ahamove cho ${order.code} — chờ tài xế nhận`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gọi Ahamove thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <div>
          Người nhận: <strong>{order.receiverName}</strong> · {order.receiverPhone}
        </div>
        <div className="text-xs text-muted-foreground">
          Lấy hàng tại: {office?.name ?? orderReceiverOffice(order)}
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
            label="Địa chỉ giao"
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
            label="giao Ahamove"
            officeLat={office?.latitude ?? null}
            officeLng={office?.longitude ?? null}
            officeAddress={office?.address}
            onPinChange={setPin}
            showFee
            orderCode={order.code}
          />
          {useGps && !pin ? (
            <p className="text-xs text-destructive">Chưa ghim được vị trí — kéo ghim trên bản đồ hoặc bỏ chọn GPS.</p>
          ) : null}
          {!useGps ? (
            <>
              <div className="rounded-md border px-3 py-2 text-sm">
                {addrEstLoading ? (
                  <span className="text-muted-foreground">Đang ước tính phí Ahamove…</span>
                ) : addrEst ? (
                  <span>
                    {addrEst.km != null ? (
                      <>
                        Khoảng cách: <strong>{addrEst.km.toFixed(2)} km</strong>
                      </>
                    ) : null}
                    {addrEst.fee != null ? (
                      <span className="ml-2">
                        · Phí Ahamove ~<strong>{addrEst.fee.toLocaleString("vi-VN")}đ</strong>
                        {addrEst.bulky ? <span className="text-xs text-muted-foreground"> (đã tính kích thước)</span> : null}
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-muted-foreground">(theo địa chỉ)</span>
                  </span>
                ) : addrEstErr ? (
                  <span className="text-destructive">{addrEstErr}</span>
                ) : (
                  <span className="text-muted-foreground">Nhập địa chỉ giao để ước tính phí.</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Gửi địa chỉ chi tiết cho Ahamove. Nếu đã dán link Google Maps trong popup, chỉ dòng địa chỉ chi tiết được gửi kèm GPS của link.
              </p>
            </>
          ) : null}
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
              Tài xế ứng <strong>{advance.toLocaleString("vi-VN")}đ</strong>, thu lại{" "}
              {advance.toLocaleString("vi-VN")}đ của người nhận. <strong>Bạn (người bàn giao) nhận nợ khoản này</strong> để
              nộp về công ty — hệ thống ghi nhận ngay khi gọi, không cần bấm thêm.
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Phí Ahamove là chi phí đối tác, không cộng vào cước khách.
            {advance > 0 ? "" : " Không thu tiền khi giao."}
          </p>
        </>
      )}
      <Button className="w-full" disabled={busy || !ready || block != null} onClick={() => void submit()}>
        {busy ? "Đang gọi…" : "Gọi Ahamove"}
      </Button>
    </div>
  );
}
