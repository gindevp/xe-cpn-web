import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HomeDeliveryMap } from "@/components/HomeDeliveryMap";
import { ahamoveDispatch } from "@/lib/api/domain-api";
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

  const orderCode = order.code;
  const orderAddress = order.address;
  useEffect(() => {
    setAddress(orderAddress ?? "");
    setRemarks("");
    setPin(null);
    // Chỉ reset khi mở đơn khác — polling cập nhật đơn không được xoá địa chỉ NV đang sửa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  const office = findOfficeByToken(orderReceiverOffice(order), offices);
  const block = ahamoveBlockReason(order);
  const advance = block ? 0 : ahamoveDue(order);

  const submit = async () => {
    if (!pin) return;
    setBusy(true);
    try {
      await ahamoveDispatch(order.code, {
        lat: pin.lat,
        lng: pin.lng,
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
          <div className="space-y-1">
            <Label className="text-xs">Địa chỉ giao</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <HomeDeliveryMap
            enabled
            address={address}
            label="giao Ahamove"
            officeLat={office?.latitude ?? null}
            officeLng={office?.longitude ?? null}
            officeAddress={office?.address}
            onPinChange={setPin}
            showFee
          />
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
              Tài xế ứng <strong>{advance.toLocaleString("vi-VN")}đ</strong> cho VP lúc lấy hàng, thu lại{" "}
              {advance.toLocaleString("vi-VN")}đ của người nhận. Nhận tiền xong bấm{" "}
              <strong>"Đã nhận tiền ứng"</strong> ở tab Đang giao. Trong lúc chờ, đơn bị khoá thu tiền / sửa cước.
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Phí Ahamove là chi phí đối tác, không cộng vào cước khách.
            {advance > 0 ? "" : " Không thu tiền khi giao."}
          </p>
        </>
      )}
      <Button className="w-full" disabled={busy || !pin || block != null} onClick={() => void submit()}>
        {busy ? "Đang gọi…" : "Gọi Ahamove"}
      </Button>
    </div>
  );
}
