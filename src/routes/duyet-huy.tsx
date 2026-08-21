import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/lib/mock-data";
import { orderGoodsLabel } from "@/lib/package-label";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Truck,
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Wallet,
  Search,
  MoreHorizontal,
  Pencil,
  MessageSquare,
  FileText,
  Ban,
  Undo2,
  Inbox,
} from "lucide-react";

export const Route = createFileRoute("/duyet-huy")({
  head: () => ({ meta: [{ title: "Hàng trên xe — X.E" }] }),
  component: () => (
    <ProtectedPage title="Hàng trên xe" screen="duyet-huy">
      <Page />
    </ProtectedPage>
  ),
});

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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scopeAll =
    session?.role === "DH" || session?.role === "BL" || session?.role === "AD";

  const tripByCode = useMemo(() => {
    const m = new Map<string, (typeof trips)[number]>();
    for (const t of trips) m.set(t.code, t);
    return m;
  }, [trips]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (!o.tripCode) return false;
        const t = tripByCode.get(o.tripCode);
        // Only orders already handed to driver (loaded on truck)
        return !!t && (t.loadedCodes ?? []).includes(o.code);
      })
      .filter((o) =>
        ["IN_TRANSIT", "WAITING", "AT_DEST"].includes(o.status) ||
        !["DELIVERED", "CANCELLED", "RETURNED"].includes(o.status),
      )
      .filter((o) => {
        if (
          !scopeAll &&
          session?.office &&
          o.fromOffice !== session.office &&
          o.toOffice !== session.office
        )
          return false;
        const t = o.tripCode ? tripByCode.get(o.tripCode) : undefined;
        const depart = t?.departAt ?? o.updatedAt;
        if (from && new Date(depart) < new Date(from)) return false;
        if (to && new Date(depart) > new Date(to + "T23:59:59")) return false;
        if (receiverOffice && o.toOffice !== receiverOffice) return false;
        if (kw) {
          const hay = `${o.code} ${o.senderPhone} ${o.receiverPhone}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
  }, [orders, tripByCode, from, to, receiverOffice, q, scopeAll, session]);

  const metrics = useMemo(() => {
    const tripSet = new Set(rows.map((r) => r.tripCode).filter(Boolean) as string[]);
    const totalOrders = rows.length;
    const totalQuantity = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const totalWeight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const remain = rows.reduce(
      (s, r) => s + Math.max(0, r.fare - (r.paidAmount ?? 0)),
      0,
    );
    return {
      trips: tripSet.size,
      totalOrders,
      totalQuantity,
      totalWeight,
      paid,
      remain,
    };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) => {
    if (v) setSelected(new Set(rows.map((r) => r.code)));
    else setSelected(new Set());
  };
  const toggleOne = (code: string, v: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (v) n.add(code);
      else n.delete(code);
      return n;
    });
  };

  const hasSelection = selected.size > 0;

  const doReturnToOrigin = () => {
    const codes = Array.from(selected);
    let ok = 0;
    let fail = 0;
    for (const code of codes) {
      const res = transitionOrder(
        code,
        "WAITING",
        "SCAN_REMOVE",
        "Nhập lại kho gửi từ Hàng trên xe",
      );
      if (res.ok) ok++;
      else fail++;
    }
    if (ok) toast.success(`Đã nhập lại kho gửi ${ok} đơn`);
    if (fail) toast.error(`${fail} đơn không thể chuyển`);
    setSelected(new Set());
  };

  const doArriveDest = () => {
    const codes = Array.from(selected);
    let ok = 0;
    let fail = 0;
    for (const code of codes) {
      const res = transitionOrder(
        code,
        "AT_DEST",
        "SCAN_IN",
        "Nhập kho nhận từ Hàng trên xe",
      );
      if (res.ok) ok++;
      else fail++;
    }
    if (ok) toast.success(`Đã nhập kho nhận ${ok} đơn`);
    if (fail) toast.error(`${fail} đơn không thể chuyển`);
    setSelected(new Set());
  };

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

      <Section
        title={`Đơn hàng trên xe (${rows.length})`}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {hasSelection ? `Đã chọn ${selected.size}` : "Chưa chọn đơn"}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasSelection}
              onClick={doReturnToOrigin}
            >
              <Undo2 className="mr-2 h-4 w-4" /> Nhập lại kho gửi
            </Button>
            <Button
              size="sm"
              disabled={!hasSelection}
              onClick={doArriveDest}
            >
              <Inbox className="mr-2 h-4 w-4" /> Nhập kho nhận
            </Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Chưa có đơn nào đang trên xe.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 w-8">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="py-2 pr-4">Mã đơn</th>
                  <th className="py-2 pr-4">Lộ trình</th>
                  <th className="py-2 pr-4">Ngày giờ đi</th>
                  <th className="py-2 pr-4">BKS</th>
                  <th className="py-2 pr-4 text-right">Số kiện</th>
                  <th className="py-2 pr-4">Tên hàng</th>
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
                  const isSel = selected.has(r.code);
                  return (
                    <tr
                      key={r.code}
                      className="border-b last:border-0 align-top hover:bg-muted/40"
                    >
                      <td className="py-2 pr-2">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={(v) => toggleOne(r.code, !!v)}
                          aria-label={`Chọn ${r.code}`}
                        />
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        <Link
                          to="/van-don/$ma"
                          params={{ ma: r.code }}
                          className="text-primary hover:underline"
                        >
                          {r.code}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{route}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {t?.departAt ? formatDateTime(t.departAt) : "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {t?.bks ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">{r.quantity ?? 1}</td>
                      <td className="py-2 pr-4">{goodsLabel}</td>
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
                          onCancel={() => {
                            if (!confirm(`Huỷ đơn ${r.code}?`)) return;
                            const res = transitionOrder(
                              r.code,
                              "CANCELLED",
                              "CANCEL",
                              "Huỷ từ Hàng trên xe",
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
    </div>
  );
}

function RowActions({
  code,
  tripCode,
  canCancel,
  onCancel,
}: {
  code: string;
  tripCode?: string;
  canCancel: boolean;
  onCancel: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
  trips: number;
  totalOrders: number;
  totalQuantity: number;
  totalWeight: number;
  paid: number;
  remain: number;
};

function StatsCards({ metrics }: { metrics: Metrics }) {
  const items = [
    {
      label: "Số chuyến",
      value: metrics.trips.toLocaleString("vi-VN"),
      unit: "chuyến",
      icon: Truck,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Đơn hàng",
      value: metrics.totalOrders.toLocaleString("vi-VN"),
      unit: "đơn",
      icon: ClipboardList,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Số kiện",
      value: metrics.totalQuantity.toLocaleString("vi-VN"),
      unit: "kiện",
      icon: Package,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Khối lượng",
      value: metrics.totalWeight.toLocaleString("vi-VN"),
      unit: "kg",
      icon: Weight,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Tiền đã thu",
      value: metrics.paid.toLocaleString("vi-VN"),
      unit: "₫",
      icon: Banknote,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Tiền chưa thu",
      value: metrics.remain.toLocaleString("vi-VN"),
      unit: "₫",
      icon: Wallet,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label} className="border">
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${it.bg} ${it.color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{it.label}</div>
                <div className="truncate text-lg font-semibold">
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
