import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MoneyInput } from "@/components/MoneyInput";
import { NumberInput } from "@/components/NumberInput";
import { OTHER_GOODS, goodsGroupSelectOptions, isOtherGoodsGroup, type Order } from "@/lib/mock-data";
import { applyPackageEdit, packageCode, packageRows } from "@/lib/package-label";
import { calcFare, computeGoodsLineFare } from "@/lib/pricing";
import { formatKg, formatMoney, summarizeChanges } from "@/lib/order-change-log";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

type Props = {
  orderCode: string | null;
  packageSeq: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Cước kiện: giống tạo đơn — không sửa tay; có giá SP thì × số lượng, không thì theo cân nặng/tuyến. */
function computePackageFare(opts: {
  group?: string;
  route?: string;
  kind: string;
  goodsName: string;
  itemQty: number;
  weightKg: number;
}): number {
  return computeGoodsLineFare({
    group: opts.group,
    kind: opts.kind,
    name: opts.goodsName,
    sl: opts.itemQty,
    weight: opts.weightKg,
    route: opts.route,
  });
}

export function EditPackageDialog({ orderCode, packageSeq, open, onOpenChange }: Props) {
  const orders = useStore((s) => s.orders);
  const updateOrder = useStore((s) => s.updateOrder);
  const productPricing = useStore((s) => s.productPricing);
  const pricingRules = useStore((s) => s.pricingRules);
  const order = orderCode ? orders.find((o) => o.code === orderCode) : null;
  const row = order && packageSeq ? packageRows(order).find((p) => p.seq === packageSeq) : null;

  const [group, setGroup] = useState("");
  const [kind, setKind] = useState("");
  const [goodsName, setGoodsName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [weightKg, setWeightKg] = useState(0);

  useEffect(() => {
    if (!open || !row) return;
    const inferred =
      row.kind === OTHER_GOODS
        ? OTHER_GOODS
        : productPricing.find((p) => p.name.trim().toLowerCase() === row.kind.trim().toLowerCase())?.group.trim() ??
          "";
    setGroup(inferred);
    setKind(row.kind);
    setGoodsName(row.goodsName);
    setItemQty(row.itemQty);
    setWeightKg(row.weightKg ?? 0);
  }, [open, row, productPricing]);

  const groupOptions = useMemo(() => goodsGroupSelectOptions(productPricing), [productPricing]);

  const kindOptions = useMemo(() => {
    if (!group || isOtherGoodsGroup(group)) return [];
    const names = [
      ...new Set(
        productPricing
          .filter((p) => p.group.trim() === group)
          .map((p) => p.name.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "vi"));
    return names.map((n) => ({ value: n, label: n }));
  }, [productPricing, group]);

  const fare = useMemo(
    () =>
      computePackageFare({
        group,
        route: order?.route,
        kind,
        goodsName,
        itemQty,
        weightKg,
      }),
    [group, order?.route, kind, goodsName, itemQty, weightKg, pricingRules, productPricing],
  );

  const save = () => {
    if (!order || !packageSeq || !row) return;
    if (!group.trim()) {
      toast.error("Vui lòng chọn nhóm hàng");
      return;
    }
    if (!isOtherGoodsGroup(group) && !kind.trim()) {
      toast.error("Vui lòng chọn tên hàng hóa");
      return;
    }
    if (isOtherGoodsGroup(group) && !goodsName.trim()) {
      toast.error("Vui lòng nhập tên hàng");
      return;
    }
    const nextWeight = isOtherGoodsGroup(group) ? weightKg : 0;
    const patch = applyPackageEdit(order, packageSeq, {
      kind,
      goodsName,
      itemQty,
      weightKg: nextWeight,
      fare,
    });
    const nameAfter = kind === OTHER_GOODS ? goodsName.trim() || OTHER_GOODS : kind.trim();
    const nameBefore =
      row.kind === OTHER_GOODS ? row.goodsName.trim() || OTHER_GOODS : row.kind.trim();
    const detail = summarizeChanges([
      { label: "Hàng", from: nameBefore, to: nameAfter },
      { label: "SL", from: row.itemQty, to: itemQty },
      { label: "KL", from: formatKg(row.weightKg), to: formatKg(nextWeight) },
      { label: "Cước", from: formatMoney(row.fare), to: formatMoney(fare) },
    ]);
    updateOrder(order.code, patch, {
      eventAction: "PACKAGE_EDIT",
      eventDetail: detail
        ? `${packageCode(order.code, packageSeq)}: ${detail}`
        : `${packageCode(order.code, packageSeq)}: (không đổi)`,
    });
    toast.success(`Đã cập nhật kiện ${packageCode(order.code, packageSeq)}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Sửa kiện
            {order && packageSeq ? ` · ${packageCode(order.code, packageSeq)}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!row ? (
          <p className="text-sm text-muted-foreground">Không tìm thấy kiện</p>
        ) : (
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Mã kiện</Label>
              <Input value={row.code} readOnly className="bg-muted/40 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Nhóm hàng</Label>
              <SearchableSelect
                value={group}
                onValueChange={(v) => {
                  setGroup(v);
                  setKind(isOtherGoodsGroup(v) ? OTHER_GOODS : "");
                  setGoodsName("");
                  if (!isOtherGoodsGroup(v)) setWeightKg(0);
                }}
                options={groupOptions}
                placeholder="Chọn nhóm hàng"
              />
            </div>
            {group && !isOtherGoodsGroup(group) ? (
              <div className="space-y-1.5">
                <Label>Tên hàng hóa</Label>
                <SearchableSelect
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v);
                    setGoodsName("");
                  }}
                  options={kindOptions}
                  placeholder="Chọn tên hàng hóa"
                />
              </div>
            ) : null}
            {isOtherGoodsGroup(group) ? (
              <div className="space-y-1.5">
                <Label>Tên hàng</Label>
                <Input
                  value={goodsName}
                  onChange={(e) => {
                    setGoodsName(e.target.value);
                    setKind(OTHER_GOODS);
                  }}
                />
              </div>
            ) : null}
            <div className={isOtherGoodsGroup(group) ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
              <div className="space-y-1.5">
                <Label>Số lượng</Label>
                <NumberInput value={itemQty} onChange={setItemQty} min={1} />
              </div>
              {isOtherGoodsGroup(group) ? (
                <div className="space-y-1.5">
                  <Label>KL (kg)</Label>
                  <NumberInput decimal min={0} value={weightKg} onChange={setWeightKg} />
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Cước (tự tính)</Label>
              <MoneyInput value={fare} onChange={() => undefined} readOnly tabIndex={-1} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={save} disabled={!row}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact edit for order fields shown on warehouse/list tables. */
export function EditOrderBriefDialog({
  orderCode,
  open,
  onOpenChange,
}: {
  orderCode: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const orders = useStore((s) => s.orders);
  const updateOrder = useStore((s) => s.updateOrder);
  const pricingRules = useStore((s) => s.pricingRules);
  const order = orderCode ? orders.find((o: Order) => o.code === orderCode) : null;

  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [weightKg, setWeightKg] = useState(0);

  useEffect(() => {
    if (!open || !order) return;
    setSenderName(order.senderName ?? "");
    setSenderPhone(order.senderPhone ?? "");
    setReceiverName(order.receiverName ?? "");
    setReceiverPhone(order.receiverPhone ?? "");
    setWeightKg(order.weightKg ?? 0);
  }, [open, order]);

  // Giá trị tính lại đây là cước hàng; phí thu hộ / tận nơi / khai giá của đơn không đổi.
  const goodsFare = useMemo(() => {
    const pkgSum = order ? packageRows(order).reduce((s, p) => s + (p.fare || 0), 0) : 0;
    if (pkgSum > 0 && Math.abs((order?.weightKg ?? 0) - weightKg) < 1e-6) return pkgSum;
    const f = calcFare({ route: order?.route ?? "", realKg: Number(weightKg) || 0 });
    return Math.round(f.base + f.surcharge);
  }, [order, weightKg, pricingRules]);

  const hasFareComponents = order?.goodsFare != null;
  const fare = hasFareComponents
    ? Math.max(0, (order?.fare ?? 0) + goodsFare - (order?.goodsFare ?? 0))
    : goodsFare;

  const save = () => {
    if (!order) return;
    const nextSender = senderName.trim().toLocaleUpperCase("vi-VN");
    const nextSenderPhone = senderPhone.replace(/\D/g, "");
    const nextReceiver = receiverName.trim().toLocaleUpperCase("vi-VN") || "—";
    const nextReceiverPhone = receiverPhone.replace(/\D/g, "");
    const detail = summarizeChanges([
      { label: "Người gửi", from: order.senderName, to: nextSender },
      { label: "SĐT gửi", from: order.senderPhone, to: nextSenderPhone },
      { label: "Người nhận", from: order.receiverName, to: nextReceiver },
      { label: "SĐT nhận", from: order.receiverPhone, to: nextReceiverPhone },
      { label: "KL", from: formatKg(order.weightKg), to: formatKg(weightKg) },
      { label: "Cước", from: formatMoney(order.fare), to: formatMoney(fare) },
    ]);
    updateOrder(
      order.code,
      {
        senderName: nextSender,
        senderPhone: nextSenderPhone,
        receiverName: nextReceiver,
        receiverPhone: nextReceiverPhone,
        weightKg,
        fare,
        ...(hasFareComponents ? { goodsFare } : {}),
      },
      {
        eventAction: "ORDER_EDIT",
        eventDetail: detail || "(không đổi)",
      },
    );
    toast.success(`Đã cập nhật đơn ${order.code}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa đơn{order ? ` · ${order.code}` : ""}</DialogTitle>
        </DialogHeader>
        {!order ? (
          <p className="text-sm text-muted-foreground">Không tìm thấy đơn</p>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Người gửi</Label>
                <Input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value.toLocaleUpperCase("vi-VN"))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>SĐT gửi</Label>
                <Input
                  inputMode="numeric"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Người nhận</Label>
                <Input
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value.toLocaleUpperCase("vi-VN"))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>SĐT nhận</Label>
                <Input
                  inputMode="numeric"
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>KL (kg)</Label>
                <NumberInput decimal min={0} value={weightKg} onChange={setWeightKg} />
              </div>
              <div className="space-y-1.5">
                <Label>Cước (tự tính)</Label>
                <MoneyInput value={fare} onChange={() => undefined} readOnly tabIndex={-1} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={save} disabled={!order}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
