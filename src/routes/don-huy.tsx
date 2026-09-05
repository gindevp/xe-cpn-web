import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import {
  formatVND,
  formatDateTime,
  officeName,
} from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { toast } from "sonner";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Search,
  Undo2,
  Ban,
} from "lucide-react";

export const Route = createFileRoute("/don-huy")({
  head: () => ({
    meta: [
      { title: "Đơn huỷ — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn hàng đã bị điều phối huỷ trên hệ thống do khách tạo nhầm hoặc không gửi nữa.",
      },
      { property: "og:title", content: "Đơn huỷ — X.E" },
      {
        property: "og:description",
        content: "Theo dõi đơn huỷ, lý do huỷ, người huỷ và khôi phục đơn khi cần.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Đơn huỷ" screen="don-huy">
      <Page />
    </ProtectedPage>
  ),
});

function cancelInfo(o: OrderX) {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "CANCEL" || e.action === "CANCELLED" || e.action === "ORDER_CANCEL");
  return {
    at: ev?.at ?? o.updatedAt ?? o.createdAt,
    by: ev?.by ?? "-",
    reason: ev?.detail ?? "Khách tạo nhầm / không gửi nữa",
  };
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scopeAll = hasAllOfficeScope(session);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (o.status !== "CANCELLED") return false;
      if (
        !scopeAll &&
        session?.office &&
        o.fromOffice !== session.office &&
        o.toOffice !== session.office
      )
        return false;
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(to + "T23:59:59")) return false;
      if (office && o.fromOffice !== office && o.toOffice !== office) return false;
      if (kw) {
        const hay =
          `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [orders, q, from, to, office, scopeAll, session]);

  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const fare = rows.reduce((s, r) => s + r.fare + (r.pickupFee ?? 0), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    return { orders: rows.length, qty, weight, fare, paid };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) => setSelected(v ? new Set(rows.map((r) => r.code)) : new Set());
  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code);
      else next.delete(code);
      return next;
    });

  const restore = (codes: string[]) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        status: "CONFIRMED",
        stage: undefined,
        updatedAt: at,
        events: [
          ...(o.events ?? []),
          { at, by, action: "RESTORE", detail: "Khôi phục đơn đã huỷ về chờ gán xe" },
        ],
      } as Partial<OrderX>);
      st.audit({
        action: "RESTORE",
        entityType: "order",
        entityId: code,
        detail: "Khôi phục đơn huỷ",
      });
    }
    setSelected(new Set());
    toast.success(`Đã khôi phục ${codes.length} đơn`);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Đơn hàng được điều phối huỷ trên hệ thống khi khách tạo nhầm hoặc không gửi nữa. Có thể khôi
        phục lại đơn nếu huỷ nhầm.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={Ban} label="Đơn huỷ" value={String(metrics.orders)} />
        <Kpi icon={Package} label="Số kiện" value={String(metrics.qty)} />
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} KG`} />
        <Kpi icon={ClipboardList} label="Cước bị huỷ" value={formatVND(metrics.fare)} />
        <Kpi icon={Banknote} label="Tiền đã thu" value={formatVND(metrics.paid)} />
      </div>

      <Section title="Bộ lọc">
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
            <Label className="text-xs">Văn phòng</Label>
            <SearchableSelect
              value={office || "all"}
              onValueChange={(v) => setOffice(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
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

      <Section
        title={`Đơn huỷ (${rows.length})`}
        right={
          <Button
            variant="outline"
            className="gap-2"
            disabled={selected.size === 0}
            onClick={() => restore([...selected])}
          >
            <Undo2 className="h-4 w-4" />
            Khôi phục đơn ({selected.size})
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Không có đơn huỷ</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Thời gian huỷ</th>
                  <th className="px-2 py-2">Người huỷ</th>
                  <th className="px-2 py-2">Lý do huỷ</th>
                  <th className="px-2 py-2">Người gửi</th>
                  <th className="px-2 py-2">Người nhận</th>
                  <th className="px-2 py-2">VP gửi → VP nhận</th>
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const info = cancelInfo(r);
                  return (
                    <tr key={r.code} className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(r.code)}
                          onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                          aria-label={`Chọn ${r.code}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">
                        <div><OrderCodeLink code={r.code} /></div>
                        <Badge variant="destructive" className="mt-1">
                          Đã huỷ
                        </Badge>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(info.at)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{info.by}</td>
                      <td className="px-2 py-2 max-w-[220px] truncate" title={info.reason}>
                        {info.reason}
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
                      <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                      <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => restore([r.code])}>
                          Khôi phục
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
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-base font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
