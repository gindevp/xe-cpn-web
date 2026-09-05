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
import { OTHER_GOODS, type Order } from "@/lib/mock-data";
import { applyPackageEdit, packageCode, packageRows } from "@/lib/package-label";
import { calcFare, findProductPrice } from "@/lib/pricing";
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
  route?: string;
  kind: string;
  goodsName: string;
  itemQty: number;
  weightKg: number;
}): number {
  const nameKey = opts.kind.trim() === OTHER_GOODS ? opts.goodsName.trim() : opts.kind.trim();
  const pp = findProductPrice(nameKey);
  const unit = pp ? (pp.price > 0 ? pp.price : pp.currentPrice) : 0;
  if (unit > 0) {
    return Math.round(unit * Math.max(1, Math.round(opts.itemQty) || 1));
  }
  const fare = calcFare({
    route: opts.route ?? "",
    realKg: Number(opts.weightKg) || 0,
  });
  return Math.round(fare.base + fare.surcharge);
}

export function EditPackageDialog({ orderCode, packageSeq, open, onOpenChange }: Props) {
  const orders = useStore((s) => s.orders);
  const updateOrder = useStore((s) => s.updateOrder);
  const productPricing = useStore((s) => s.productPricing);
  const pricingRules = useStore((s) => s.pricingRules);
  const order = orderCode ? orders.find((o) => o.code === orderCode) : null;
  const row = order && packageSeq ? packageRows(order).find((p) => p.seq === packageSeq) : null;

  const [kind, setKind] = useState("");
  const [goodsName, setGoodsName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [weightKg, setWeightKg] = useState(0);

  useEffect(() => {
    if (!open || !row) return;
    setKind(row.kind);
    setGoodsName(row.goodsName);
    setItemQty(row.itemQty);
    setWeightKg(row.weightKg ?? 0);
  }, [open, row]);

  const kindOptions = useMemo(() => {
    const names = [...new Set(productPricing.map((p) => p.name.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [...names, OTHER_GOODS].map((g) => ({ value: g, label: g }));
  }, [productPricing]);

  const fare = useMemo(
    () =>
      computePackageFare({
        route: order?.route,
        kind,
        goodsName,
        itemQty,
        weightKg,
      }),
    [order?.route, kind, goodsName, itemQty, weightKg, pricingRules, productPricing],
  );

  const save = () => {
    if (!order || !packageSeq) return;
    const patch = applyPackageEdit(order, packageSeq, {
      kind,
      goodsName,
      itemQty,
      weightKg,
      fare,
    });
    updateOrder(order.code, patch);
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
              <Label>Loại hàng</Label>
              <SearchableSelect
                value={kind}
                onValueChange={(v) => {
                  setKind(v);
                  if (v !== OTHER_GOODS) setGoodsName("");
                }}
                options={kindOptions}
                placeholder="Chọn loại hàng"
              />
            </div>
            {kind === OTHER_GOODS ? (
              <div className="space-y-1.5">
                <Label>Tên hàng</Label>
                <Input value={goodsName} onChange={(e) => setGoodsName(e.target.value)} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Số lượng</Label>
                <NumberInput value={itemQty} onChange={setItemQty} min={1} />
              </div>
              <div className="space-y-1.5">
                <Label>KL (kg)</Label>
                <NumberInput decimal min={0} value={weightKg} onChange={setWeightKg} />
              </div>
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

  const fare = useMemo(() => {
    const pkgSum = order ? packageRows(order).reduce((s, p) => s + (p.fare || 0), 0) : 0;
    if (pkgSum > 0 && Math.abs((order?.weightKg ?? 0) - weightKg) < 1e-6) return pkgSum;
    const f = calcFare({ route: order?.route ?? "", realKg: Number(weightKg) || 0 });
    return Math.round(f.base + f.surcharge);
  }, [order, weightKg, pricingRules]);

  const save = () => {
    if (!order) return;
    updateOrder(order.code, {
      senderName: senderName.trim().toLocaleUpperCase("vi-VN"),
      senderPhone: senderPhone.replace(/\D/g, ""),
      receiverName: receiverName.trim().toLocaleUpperCase("vi-VN") || "—",
      receiverPhone: receiverPhone.replace(/\D/g, ""),
      weightKg,
      fare,
    });
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
