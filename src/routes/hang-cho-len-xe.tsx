import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatVND,
  formatDateTime,
  officeName,
  COLLECT_FORMS,
  GOODS_TYPES,
} from "@/lib/mock-data";
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
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/hang-cho-len-xe")({
  head: () => ({
    meta: [
      { title: "Hàng chờ lên xe — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn đã gán xe, đang chờ tài xế bốc lên xe và xác nhận bàn giao.",
      },
      { property: "og:title", content: "Hàng chờ lên xe — X.E" },
      {
        property: "og:description",
        content:
          "Xác nhận bàn giao đơn hàng cho tài xế trước khi xe rời văn phòng.",
      },
    ],
  }),
  component: () => (
    <ProtectedPage title="Hàng chờ lên xe" screen="hang-cho-len-xe">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);
  const updateTrip = useStore((s) => s.updateTrip);
  const audit = useStore((s) => s.audit);

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
        if (!t) return false;
        // Waiting = assigned to trip but NOT yet loaded (handed to driver)
        return !(t.loadedCodes ?? []).includes(o.code);
      })
      .filter((o) =>
        !["DELIVERED", "CANCELLED", "RETURNED", "AT_DEST"].includes(o.status),
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
          const hay = `${o.code} ${o.senderPhone} ${o.receiverPhone} ${o.receiverName ?? ""}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
  }, [orders, tripByCode, from, to, receiverOffice, q, scopeAll, session]);

  const metrics = useMemo(() => {
    const tripSet = new Set(rows.map((r) => r.tripCode).filter(Boolean) as string[]);
    return {
      trips: tripSet.size,
      totalOrders: rows.length,
      totalQuantity: rows.reduce((s, r) => s + (r.quantity ?? 1), 0),
      totalWeight: rows.reduce((s, r) => s + (r.weightKg ?? 0), 0),
      paid: rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0),
      remain: rows.reduce(
        (s, r) => s + Math.max(0, r.fare - (r.paidAmount ?? 0)),
        0,
      ),
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

  const confirmHandover = (codes: string[]) => {
    // Group by trip and append to loadedCodes
    const byTrip = new Map<string, string[]>();
    for (const code of codes) {
      const o = orders.find((x) => x.code === code);
      if (!o?.tripCode) continue;
      const arr = byTrip.get(o.tripCode) ?? [];
      arr.push(code);
      byTrip.set(o.tripCode, arr);
    }
    let ok = 0;
    for (const [tripCode, codeList] of byTrip) {
      const t = tripByCode.get(tripCode);
      if (!t) continue;
      const merged = Array.from(new Set([...(t.loadedCodes ?? []), ...codeList]));
      const newlyAdded = codeList.filter(
        (c) => !(t.loadedCodes ?? []).includes(c),
      );
      updateTrip(tripCode, {
        loadedCodes: merged,
        scannedCodes: Array.from(
          new Set([...(t.scannedCodes ?? []), ...codeList]),
        ),
      });
      for (const c of newlyAdded) {
        audit({
          action: "HANDOVER_DRIVER",
          entityType: "order",
          entityId: c,
          detail: `Bàn giao tài xế · Trip ${tripCode}`,
        });
        ok++;
      }
    }
    if (ok) toast.success(`Đã xác nhận bàn giao ${ok} đơn cho tài xế`);
    else toast.error("Không có đơn nào được cập nhật");
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
            <Select
              value={receiverOffice || "__all__"}
              onValueChange={(v) => setReceiverOffice(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Chọn văn phòng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tất cả</SelectItem>
                {offices.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        title={`Đơn chờ bàn giao tài xế (${rows.length})`}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {hasSelection ? `Đã chọn ${selected.size}` : "Chưa chọn đơn"}
            </span>
            <Button
              size="sm"
              disabled={!hasSelection}
              onClick={() => confirmHandover(Array.from(selected))}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Xác nhận bàn giao tài xế
            </Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>
            Chưa có đơn nào chờ lên xe. Đơn sẽ xuất hiện tại đây sau khi được
            gán xe từ mục "Đơn chờ gán xe".
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-sm">
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
                  <th className="py-2 pr-4">Tài xế</th>
                  <th className="py-2 pr-4 text-right">Số kiện</th>
                  <th className="py-2 pr-4">Tên hàng</th>
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
                  const goodsLabel =
                    GOODS_TYPES.find((g) => g.value === r.goodsType)?.label ??
                    r.goodsType;
                  const collectLabel =
                    COLLECT_FORMS.find((c) => c.value === r.collectForm)
                      ?.label ?? r.collectForm;
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
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {t?.driver ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">{r.quantity ?? 1}</td>
                      <td className="py-2 pr-4">{goodsLabel}</td>
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => confirmHandover([r.code])}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Bàn giao
                        </Button>
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
      value: metrics.totalWeight.toLocaleString("vi-VN", {
        maximumFractionDigits: 1,
      }),
      unit: "kg",
      icon: Weight,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Tiền đã thu",
      value: formatVND(metrics.paid),
      unit: "",
      icon: Banknote,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Tiền chưa thu",
      value: formatVND(metrics.remain),
      unit: "",
      icon: Wallet,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${it.bg}`}
              >
                <Icon className={`h-5 w-5 ${it.color}`} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs text-muted-foreground">
                  {it.label}
                </div>
                <div className="truncate text-lg font-semibold">
                  {it.value}
                  {it.unit ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {it.unit}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
