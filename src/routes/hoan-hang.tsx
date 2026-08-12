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
import { formatVND, formatDateTime, officeName, OFFICES, GOODS_TYPES } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  CheckCircle2,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/hoan-hang")({
  head: () => ({ meta: [{ title: "Hàng đã giao — X.E" }] }),
  component: () => (
    <ProtectedPage title="Hàng đã giao" screen="hoan-hang">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const orders = useStore((s) => s.orders);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [officeFilter, setOfficeFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");

  const delivered = useMemo(() => {
    return orders.filter((o) => o.status === "DELIVERED");
  }, [orders]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return delivered.filter((o) => {
      const d = (o.updatedAt ?? o.createdAt).slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (officeFilter !== "ALL" && o.toOffice !== officeFilter) return false;
      if (!kw) return true;
      return (
        o.code.toLowerCase().includes(kw) ||
        (o.receiverPhone ?? "").toLowerCase().includes(kw) ||
        (o.receiverName ?? "").toLowerCase().includes(kw) ||
        (o.senderPhone ?? "").toLowerCase().includes(kw) ||
        (o.senderName ?? "").toLowerCase().includes(kw)
      );
    });
  }, [delivered, from, to, officeFilter, q]);

  const kpi = useMemo(() => {
    let totalOrders = filtered.length;
    let totalPackages = 0;
    let totalWeight = 0;
    let collected = 0;
    filtered.forEach((o) => {
      totalPackages += o.quantity ?? 0;
      totalWeight += o.weightKg ?? 0;
      collected += o.paidAmount ?? 0;
    });
    return { totalOrders, totalPackages, totalWeight, collected };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={<ClipboardList className="h-5 w-5" />} label="Đơn đã giao" value={kpi.totalOrders.toString()} />
        <KpiCard icon={<Package className="h-5 w-5" />} label="Số kiện" value={kpi.totalPackages.toString()} />
        <KpiCard icon={<Weight className="h-5 w-5" />} label="Khối lượng (kg)" value={kpi.totalWeight.toFixed(1)} />
        <KpiCard icon={<Banknote className="h-5 w-5" />} label="Tiền đã thu" value={formatVND(kpi.collected)} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Từ ngày</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đến ngày</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Văn phòng nhận</Label>
              <Select value={officeFilter} onValueChange={setOfficeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả VP</SelectItem>
                  {OFFICES.map((o) => (
                    <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Mã đơn, SĐT, tên..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Section title={`Danh sách hàng đã giao (${filtered.length})`}>
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Mã đơn</th>
                  <th className="py-2 pr-4">Lộ trình</th>
                  <th className="py-2 pr-4">Thời gian giao</th>
                  <th className="py-2 pr-4">Số kiện</th>
                  <th className="py-2 pr-4">Tên hàng</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2 pr-4">Thu hộ</th>
                  <th className="py-2 pr-4">Người gửi</th>
                  <th className="py-2 pr-4">VP gửi</th>
                  <th className="py-2 pr-4">Người nhận</th>
                  <th className="py-2 pr-4">VP nhận</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.code} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-4 font-medium">{o.code}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {officeName(o.fromOffice)} → {officeName(o.toOffice)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(o.updatedAt)}</td>
                    <td className="py-2 pr-4">{o.quantity ?? 0}</td>
                    <td className="py-2 pr-4">{GOODS_TYPES.find((g) => g.value === o.goodsType)?.label ?? o.goodsType}</td>
                    <td className="py-2 pr-4">
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Đã giao
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{formatVND(Math.max(0, o.fare - (o.paidAmount ?? 0)))}</td>
                    <td className="py-2 pr-4">{o.senderName ?? o.senderPhone}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{officeName(o.fromOffice)}</td>
                    <td className="py-2 pr-4">{o.receiverName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{officeName(o.toOffice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4">
        <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
