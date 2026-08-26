import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatVND,
  formatDateTime,
  officeName,
  COLLECT_FORMS,
  PAY_METHODS,
  type Order,
} from "@/lib/mock-data";
import { orderGoodsLabel } from "@/lib/package-label";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { toast } from "sonner";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Wallet,
  AlertTriangle,
  Search,
  MoreHorizontal,
  Pencil,
  MessageSquare,
  FileText,
  Ban,
  Truck,
  Home,
  UserPlus,
  CheckCircle2,
  Zap,
} from "lucide-react";

const SHIPPER_OPTIONS = [
  { id: "SIEU_TOC", label: "Giao siêu tốc", eta: "~ 60 phút", shipper: "Ahamove", fare: 0 },
  { id: "2H", label: "Giao trong 2H", eta: "≤ 2 giờ", shipper: "Grab Express", fare: 0 },
  { id: "4H", label: "Giao trong 4H", eta: "≤ 4 giờ", shipper: "Lalamove", fare: 0 },
  { id: "TRONG_NGAY", label: "Giao trong ngày", eta: "≤ 8 giờ", shipper: "GHTK", fare: 0 },
];

export const Route = createFileRoute("/dieu-chinh")({
  head: () => ({ meta: [{ title: "Đơn hàng đến — X.E" }] }),
  component: () => (
    <ProtectedPage title="Đơn hàng đến" screen="dieu-chinh">
      <Page />
    </ProtectedPage>
  ),
});

const STOCK_DAYS = 3;

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);
  const transitionOrder = useStore((s) => s.transitionOrder);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receiverOffice, setReceiverOffice] = useState("");
  const [q, setQ] = useState("");
  const [shipperOrder, setShipperOrder] = useState<Order | null>(null);
  const [deliverOrder, setDeliverOrder] = useState<Order | null>(null);

  const scopeAll = hasAllOfficeScope(session);

  const tripByCode = useMemo(() => {
    const m = new Map<string, (typeof trips)[number]>();
    for (const t of trips) m.set(t.code, t);
    return m;
  }, [trips]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders
      .filter((o) => o.status === "AT_DEST")
      .filter((o) => {
        if (
          !scopeAll &&
          session?.office &&
          o.fromOffice !== session.office &&
          o.toOffice !== session.office
        )
          return false;
        const at = o.updatedAt;
        if (from && new Date(at) < new Date(from)) return false;
        if (to && new Date(at) > new Date(to + "T23:59:59")) return false;
        if (receiverOffice && o.toOffice !== receiverOffice) return false;
        if (kw) {
          const hay = `${o.code} ${o.senderPhone} ${o.receiverPhone}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
  }, [orders, from, to, receiverOffice, q, scopeAll, session]);

  const now = Date.now();
  const isStock = (updatedAt: string) =>
    now - new Date(updatedAt).getTime() > STOCK_DAYS * 24 * 3600 * 1000;

  const metrics = useMemo(() => {
    const totalOrders = rows.length;
    const totalQuantity = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const totalWeight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const remain = rows.reduce(
      (s, r) => s + Math.max(0, r.fare - (r.paidAmount ?? 0)),
      0,
    );
    const stock = rows.filter((r) => isStock(r.updatedAt)).length;
    return { totalOrders, totalQuantity, totalWeight, paid, remain, stock };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="space-y-4">
      <StatsCards metrics={metrics} />

      <Section title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date"
              className="w-[160px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date"
              className="w-[160px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Văn phòng nhận</Label>
            <SearchableSelect
              value={receiverOffice || "__all__"}
              onValueChange={(v) =>
                setReceiverOffice(v === "__all__" ? "" : v)
              }
              className="w-[200px]"
              placeholder="Chọn văn phòng"
              options={[
                { value: "__all__", label: "Tất cả" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="ml-auto space-y-1.5">
            <Label className="text-xs">Tìm kiếm nhanh</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-[280px] pl-8"
                placeholder="Mã đơn hoặc SĐT"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Đơn hàng trong kho nhận (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Chưa có đơn nào trong kho nhận.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Mã đơn</th>
                  <th className="py-2 pr-4">Lộ trình</th>
                  <th className="py-2 pr-4">Ngày nhập kho</th>
                  <th className="py-2 pr-4">BKS</th>
                  <th className="py-2 pr-4 text-right">Số kiện</th>
                  <th className="py-2 pr-4">Tên hàng</th>
                  <th className="py-2 pr-4">Cách giao hàng</th>
                  <th className="py-2 pr-4">Trạng thái TT</th>
                  <th className="py-2 pr-4 text-right">Thu hộ</th>
                  <th className="py-2 pr-4">Người gửi</th>
                  <th className="py-2 pr-4">VP gửi</th>
                  <th className="py-2 pr-4">Người nhận</th>
                  <th className="py-2 pr-4">VP nhận</th>
                  <th className="py-2 pr-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const t = r.tripCode ? tripByCode.get(r.tripCode) : undefined;
                  const route = t?.route ?? `${r.fromOffice} → ${r.toOffice}`;
                  const goodsLabel = orderGoodsLabel(r);
                  const collectLabel =
                    COLLECT_FORMS.find((c) => c.value === r.collectForm)
                      ?.label ?? r.collectForm;
                  const paid = r.paidAmount ?? 0;
                  const remain = Math.max(0, r.fare - paid);
                  const stock = isStock(r.updatedAt);
                  return (
                    <tr
                      key={r.code}
                      className={`border-b last:border-0 align-top hover:bg-muted/40 ${stock ? "bg-warning/10" : ""}`}
                    >
                      <td className="py-2 pr-4 font-medium">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/van-don/$ma"
                            params={{ ma: r.code }}
                            className="text-primary hover:underline"
                          >
                            {r.code}
                          </Link>
                          {stock && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                              <AlertTriangle className="h-3 w-3" /> Tồn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{route}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDateTime(r.updatedAt)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {t?.bks ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">{r.quantity ?? 1}</td>
                      <td className="py-2 pr-4">{goodsLabel}</td>
                      <td className="py-2 pr-4">
                        {r.homeDelivery ? (
                          <Badge className="gap-1 bg-info/15 text-info hover:bg-info/20 border-info/30" variant="outline">
                            <Truck className="h-3 w-3" /> Giao tận nơi
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-muted text-foreground hover:bg-muted" variant="outline">
                            <Home className="h-3 w-3" /> Khách tự lấy
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-muted-foreground">
                            Đã thu: {formatVND(paid)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Chưa thu:{" "}
                            <span
                              className={
                                remain > 0
                                  ? "font-medium text-destructive"
                                  : "text-success"
                              }
                            >
                              {formatVND(remain)}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <div className="font-medium">{collectLabel}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div>{r.senderName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.senderPhone}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{officeName(r.fromOffice)}</td>
                      <td className="py-2 pr-4">
                        <div>{r.receiverName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.receiverPhone}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{officeName(r.toOffice)}</td>
                      <td className="py-2 pr-2 text-right">
                        <RowActions
                          code={r.code}
                          tripCode={r.tripCode ?? undefined}
                          canCancel={
                            r.status !== "CANCELLED" &&
                            r.status !== "DELIVERED" &&
                            r.status !== "RETURNED"
                          }
                          canDeliver={r.status === "AT_DEST"}
                          homeDelivery={!!r.homeDelivery}
                          onAssignShipper={() => setShipperOrder(r)}
                          onDeliver={() => setDeliverOrder(r)}
                          onCancel={() => {
                            if (!confirm(`Huỷ đơn ${r.code}?`)) return;
                            const res = transitionOrder(
                              r.code,
                              "CANCELLED",
                              "CANCEL",
                              "Huỷ từ Đơn hàng đến",
                            );
                            if (res.ok) toast.success(`Đã huỷ đơn ${r.code}`);
                            else toast.error(res.error);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <AssignShipperDialog
        order={shipperOrder}
        onClose={() => setShipperOrder(null)}
      />
      <DeliverDialog
        order={deliverOrder}
        onClose={() => setDeliverOrder(null)}
        onConfirm={(o, payMethod) => {
          const res = transitionOrder(
            o.code,
            "DELIVERED",
            "POD_QUAY",
            payMethod ? `Giao tại quầy · TT ${payMethod}` : "Giao tại quầy",
          );
          if (res.ok) {
            toast.success(`Đã giao đơn ${o.code}`);
            setDeliverOrder(null);
          } else toast.error(res.error);
        }}
      />
    </div>
  );
}

function RowActions({
  code,
  tripCode,
  canCancel,
  canDeliver,
  homeDelivery,
  onAssignShipper,
  onDeliver,
  onCancel,
}: {
  code: string;
  tripCode?: string;
  canCancel: boolean;
  canDeliver: boolean;
  homeDelivery: boolean;
  onAssignShipper: () => void;
  onDeliver: () => void;
  onCancel: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          disabled={!canDeliver}
          onClick={onAssignShipper}
        >
          <UserPlus className="mr-2 h-4 w-4" /> Gán shipper
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canDeliver}
          onClick={onDeliver}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" /> Giao hàng
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/van-don/$ma" params={{ ma: code }}>
            <Pencil className="mr-2 h-4 w-4" /> Sửa đơn hàng
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => toast.success(`Đã gửi SMS cho đơn ${code}`)}
        >
          <MessageSquare className="mr-2 h-4 w-4" /> Gửi SMS
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            toast.message(
              tripCode
                ? `Phơi hàng chuyến ${tripCode}`
                : `Đơn ${code} chưa có chuyến`,
            )
          }
        >
          <FileText className="mr-2 h-4 w-4" /> Xem phơi hàng
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canCancel}
          onClick={onCancel}
          className="text-destructive focus:text-destructive"
        >
          <Ban className="mr-2 h-4 w-4" /> Huỷ đơn
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Metrics = {
  totalOrders: number;
  totalQuantity: number;
  totalWeight: number;
  paid: number;
  remain: number;
  stock: number;
};

function StatsCards({ metrics }: { metrics: Metrics }) {
  const items = [
    {
      label: "Đơn hàng",
      value: metrics.totalOrders.toLocaleString("vi-VN"),
      unit: "đơn",
      icon: ClipboardList,
      color: "text-info",
      bg: "bg-info/10",
      highlight: false,
    },
    {
      label: "Số kiện",
      value: metrics.totalQuantity.toLocaleString("vi-VN"),
      unit: "kiện",
      icon: Package,
      color: "text-success",
      bg: "bg-success/10",
      highlight: false,
    },
    {
      label: "Khối lượng",
      value: metrics.totalWeight.toLocaleString("vi-VN"),
      unit: "KG",
      icon: Weight,
      color: "text-info",
      bg: "bg-info/10",
      highlight: false,
    },
    {
      label: "Tiền đã thu",
      value: metrics.paid.toLocaleString("vi-VN"),
      unit: "VNĐ",
      icon: Banknote,
      color: "text-warning",
      bg: "bg-warning/10",
      highlight: false,
    },
    {
      label: "Tiền chưa thu",
      value: metrics.remain.toLocaleString("vi-VN"),
      unit: "VNĐ",
      icon: Wallet,
      color: "text-destructive",
      bg: "bg-destructive/10",
      highlight: false,
    },
    {
      label: "Hàng tồn",
      value: metrics.stock.toLocaleString("vi-VN"),
      unit: `đơn > ${STOCK_DAYS} ngày`,
      icon: AlertTriangle,
      color: "text-warning-foreground",
      bg: "bg-warning",
      highlight: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card
            key={it.label}
            className={
              it.highlight
                ? "border-2 border-warning bg-warning/10 shadow-md ring-1 ring-warning/40"
                : "border"
            }
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${it.bg} ${it.color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div
                  className={`text-xs ${it.highlight ? "font-semibold text-warning-foreground" : "text-muted-foreground"}`}
                >
                  {it.label}
                </div>
                <div
                  className={`truncate text-lg font-semibold ${it.highlight ? "text-warning-foreground" : ""}`}
                >
                  {it.value}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {it.unit}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OrderInfoBlock({ order }: { order: Order }) {
  const goodsLabel = orderGoodsLabel(order);
  const collectLabel =
    COLLECT_FORMS.find((c) => c.value === order.collectForm)?.label ?? order.collectForm;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold text-primary">{order.code}</div>
        <Badge variant="outline">{collectLabel}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <div className="text-muted-foreground">Người nhận</div>
          <div className="font-medium">{order.receiverName}</div>
          <div className="text-muted-foreground">{order.receiverPhone}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Người gửi</div>
          <div className="font-medium">{order.senderName ?? "—"}</div>
          <div className="text-muted-foreground">{order.senderPhone}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Hàng</div>
          <div className="font-medium">
            {goodsLabel} · {order.quantity ?? 1} kiện · {order.weightKg ?? 0} KG
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Địa chỉ giao</div>
          <div className="font-medium truncate">{order.address ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function AssignShipperDialog({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string>("2H");
  if (!order) return null;
  const selected = SHIPPER_OPTIONS.find((s) => s.id === choice);
  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Gán shipper giao hàng
          </DialogTitle>
          <DialogDescription>
            Chọn hình thức chuyển phát cho đơn hàng bên dưới.
          </DialogDescription>
        </DialogHeader>

        <OrderInfoBlock order={order} />

        <div className="space-y-2">
          <Label className="text-sm font-medium">Lựa chọn chuyển phát</Label>
          <RadioGroup value={choice} onValueChange={setChoice} className="gap-2">
            {SHIPPER_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                htmlFor={`sh-${opt.id}`}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                  choice === opt.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                <RadioGroupItem id={`sh-${opt.id}`} value={opt.id} />
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {opt.shipper} · {opt.eta}
                  </div>
                </div>
                <div className="text-sm font-semibold">{formatVND(opt.fare)}</div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              toast.success(
                `Đã gán ${selected?.shipper} (${selected?.label}) cho đơn ${order.code}`,
              );
              onClose();
            }}
          >
            Xác nhận gán shipper
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: Order | null;
  onClose: () => void;
  onConfirm: (order: Order, payMethod?: string) => void;
}) {
  const [payMethod, setPayMethod] = useState<string>("TM");
  const [collected, setCollected] = useState(false);
  if (!order) return null;
  const paid = order.paidAmount ?? 0;
  const remain = Math.max(0, order.fare - paid);
  const needCollect = remain > 0;
  const canDeliver = !needCollect || collected;

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> Giao hàng tại quầy
          </DialogTitle>
          <DialogDescription>
            Xác nhận thông tin và thanh toán trước khi giao cho khách.
          </DialogDescription>
        </DialogHeader>

        <OrderInfoBlock order={order} />

        <div className="rounded-lg border p-3">
          <div className="mb-2 text-sm font-semibold">Thông tin thanh toán</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cước vận chuyển</span>
              <span className="font-medium">{formatVND(order.fare)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đã thu</span>
              <span className="font-medium text-success">{formatVND(paid)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="font-semibold">Cần thu</span>
              <span
                className={`font-bold ${remain > 0 ? "text-destructive" : "text-success"}`}
              >
                {formatVND(remain)}
              </span>
            </div>
          </div>

          {needCollect ? (
            <div className="mt-3 space-y-2">
              <Label className="text-xs">Hình thức thanh toán</Label>
              <SearchableSelect
                value={payMethod}
                onValueChange={setPayMethod}
                options={PAY_METHODS.map((p) => ({ value: p.value, label: p.label }))}
              />
              <Button
                type="button"
                variant={collected ? "outline" : "default"}
                className="w-full gap-2"
                onClick={() => setCollected((v) => !v)}
              >
                <Banknote className="h-4 w-4" />
                {collected
                  ? `Đã thu ${formatVND(remain)}`
                  : `Thu ${formatVND(remain)}`}
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-success/10 p-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Người gửi đã thanh toán đủ.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            disabled={!canDeliver}
            onClick={() => onConfirm(order, needCollect ? payMethod : undefined)}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" /> Xác nhận giao hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

