import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatVND, formatDateTime, officeName } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { ClipboardList, Package, Weight, Banknote, Search } from "lucide-react";

export const Route = createFileRoute("/giao-thanh-cong")({
  head: () => ({
    meta: [
      { title: "Giao thành công — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn hàng đã giao thành công: shipper tích giao thành công hoặc điều phối xác nhận giao tại bưu cục.",
      },
      { property: "og:title", content: "Giao thành công — X.E" },
      {
        property: "og:description",
        content: "Theo dõi đơn giao thành công theo ngày, văn phòng và hình thức giao.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Giao thành công" screen="giao-thanh-cong">
      <Page />
    </ProtectedPage>
  ),
});

function deliveredBy(o: OrderX): "SHIPPER" | "OFFICE" {
  const ev = [...(o.events ?? [])].reverse().find((e) => e.action === "DELIVERED");
  const detail = `${ev?.detail ?? ""}`.toLowerCase();
  if (o.homeDelivery || detail.includes("shipper")) return "SHIPPER";
  return "OFFICE";
}

function deliveredAt(o: OrderX): string {
  const ev = [...(o.events ?? [])].reverse().find((e) => e.action === "DELIVERED");
  return ev?.at ?? o.updatedAt ?? o.createdAt;
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [mode, setMode] = useState("");
  const [q, setQ] = useState("");

  const scopeAll = session?.role === "DH" || session?.role === "BL" || session?.role === "AD";

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders
      .filter((o) => o.status === "DELIVERED")
      .filter((o) => {
        if (!scopeAll && session?.office && o.fromOffice !== session.office && o.toOffice !== session.office)
          return false;
        const at = deliveredAt(o);
        if (from && new Date(at) < new Date(from)) return false;
        if (to && new Date(at) > new Date(to + "T23:59:59")) return false;
        if (office && o.fromOffice !== office && o.toOffice !== office) return false;
        if (mode && deliveredBy(o) !== mode) return false;
        if (kw) {
          const hay =
            `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => (deliveredAt(a) < deliveredAt(b) ? 1 : -1));
  }, [orders, q, from, to, office, mode, scopeAll, session]);

  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const unpaid = rows.reduce(
      (s, r) => s + Math.max(0, r.fare + (r.pickupFee ?? 0) - (r.paidAmount ?? 0)),
      0,
    );
    return { orders: rows.length, qty, weight, unpaid, paid };
  }, [rows]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Đơn hàng shipper tích giao thành công hoặc điều phối xác nhận giao thành công tại bưu cục.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={ClipboardList} label="Đơn giao thành công" value={String(metrics.orders)} />
        <Kpi icon={Package} label="Số kiện" value={String(metrics.qty)} />
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} kg`} />
        <Kpi icon={Banknote} label="Tiền đã thu" value={formatVND(metrics.paid)} />
        <Kpi icon={Banknote} label="Tiền chưa thu" value={formatVND(metrics.unpaid)} />
      </div>

      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Văn phòng</Label>
            <Select value={office || "all"} onValueChange={(v) => setOffice(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {offices.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hình thức giao</Label>
            <Select value={mode || "all"} onValueChange={(v) => setMode(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="SHIPPER">Shipper giao thành công</SelectItem>
                <SelectItem value="OFFICE">Giao tại bưu cục</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tìm kiếm</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Mã đơn, SĐT, tên khách"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Danh sách đơn giao thành công (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Chưa có đơn giao thành công</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Thời gian giao</th>
                  <th className="px-2 py-2">Hình thức</th>
                  <th className="px-2 py-2">Người gửi</th>
                  <th className="px-2 py-2">Người nhận</th>
                  <th className="px-2 py-2">VP gửi → VP nhận</th>
                  <th className="px-2 py-2">Chuyến</th>
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  <th className="px-2 py-2 text-right">Đã thu</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const by = deliveredBy(r);
                  return (
                    <tr key={r.code} className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2 font-medium">{r.code}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(deliveredAt(r))}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Badge variant={by === "SHIPPER" ? "default" : "secondary"}>
                          {by === "SHIPPER" ? "Shipper giao" : "Nhận tại bưu cục"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        <div>{r.senderName ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{r.senderPhone}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div>{r.receiverName}</div>
                        <div className="text-xs text-muted-foreground">{r.receiverPhone}</div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {officeName(r.fromOffice)} → {officeName(r.toOffice)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.tripCode ?? "-"}</td>
                      <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                      <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                      <td className="px-2 py-2 text-right">{formatVND(r.paidAmount ?? 0)}</td>
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

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
