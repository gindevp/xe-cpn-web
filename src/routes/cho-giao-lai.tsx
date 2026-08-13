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
import {
  formatVND,
  formatDateTime,
  officeName,
  ORDER_STATUS_LABEL,
  type Order,
} from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Search,
  RotateCcw,
  Undo2,
  Warehouse,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/cho-giao-lai")({
  head: () => ({
    meta: [
      { title: "Chờ giao lại — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn hàng người nhận từ chối nhận: điều phối xử lý giao lại hoặc luân chuyển hoàn về người gửi.",
      },
      { property: "og:title", content: "Chờ giao lại — X.E" },
      {
        property: "og:description",
        content:
          "Xử lý đơn bị từ chối nhận: giao lại lần nữa, hoặc nhập kho hoàn và chuyển hoàn về người gửi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Chờ giao lại" screen="cho-giao-lai">
      <Page />
    </ProtectedPage>
  ),
});

type Tab = "REDELIVER" | "RETURNING" | "RETURNED";

const TABS: { key: Tab; label: string; hint: string }[] = [
  {
    key: "REDELIVER",
    label: "Chờ giao lại",
    hint: "Người nhận từ chối nhận hàng. Điều phối chọn giao lại lần nữa hoặc hoàn về người gửi.",
  },
  {
    key: "RETURNING",
    label: "Đang hoàn về người gửi",
    hint: "Đơn đã chốt hoàn: nhập kho hoàn, luân chuyển ngược và trả lại cho người gửi.",
  },
  {
    key: "RETURNED",
    label: "Đã hoàn người gửi",
    hint: "Đơn đã trả lại thành công cho người gửi.",
  },
];

function tabOf(o: Order): Tab | null {
  if (o.status === "FAILED_DELIVERY") return "REDELIVER";
  if (o.status === "RETURNING") return "RETURNING";
  if (o.status === "RETURNED") return "RETURNED";
  return null;
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const [tab, setTab] = useState<Tab>("REDELIVER");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scopeAll = session?.role === "DH" || session?.role === "BL" || session?.role === "AD";

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!tabOf(o)) return false;
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

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, t) => ({ ...acc, [t.key]: base.filter((o) => tabOf(o) === t.key).length }),
        {} as Record<Tab, number>,
      ),
    [base],
  );

  const rows = useMemo(() => base.filter((o) => tabOf(o) === tab), [base, tab]);

  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const unpaid = rows.reduce(
      (s, r) => s + Math.max(0, r.fare + (r.pickupFee ?? 0) - (r.paidAmount ?? 0)),
      0,
    );
    return { orders: rows.length, qty, weight, paid, unpaid };
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

  const apply = (
    codes: string[],
    patch: Partial<Order>,
    action: string,
    detail: string,
    successMsg: string,
  ) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        ...patch,
        updatedAt: at,
        events: [...(o.events ?? []), { at, by, action, detail }],
      } as Partial<Order>);
      st.audit({ action, entityType: "order", entityId: code, detail });
    }
    setSelected(new Set());
    toast.success(`${successMsg} · ${codes.length} đơn`);
  };

  const redeliver = (codes: string[]) =>
    apply(
      codes,
      { status: "OUT_FOR_DELIVERY", stage: "DELIVERING" } as Partial<Order>,
      "REDELIVER",
      "Điều phối cho giao lại lần nữa",
      "Đã chuyển giao lại",
    );

  const startReturn = (codes: string[]) =>
    apply(
      codes,
      { status: "RETURNING", stage: undefined } as Partial<Order>,
      "RETURN_START",
      "Nhập kho hoàn, luân chuyển hoàn về người gửi",
      "Đã chuyển hoàn về người gửi",
    );

  const finishReturn = (codes: string[]) =>
    apply(
      codes,
      { status: "RETURNED", stage: undefined } as Partial<Order>,
      "RETURNED",
      "Đã trả hàng lại cho người gửi",
      "Đã hoàn người gửi",
    );

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={t.key === tab ? "default" : "outline"}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
          >
            {t.label} ({counts[t.key] ?? 0})
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={ClipboardList} label="Đơn hàng" value={String(metrics.orders)} />
        <Kpi icon={Package} label="Số kiện" value={String(metrics.qty)} />
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} kg`} />
        <Kpi icon={Banknote} label="Tiền đã thu" value={formatVND(metrics.paid)} />
        <Kpi icon={Banknote} label="Tiền chưa thu" value={formatVND(metrics.unpaid)} />
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
        title={`${activeTab.label} (${rows.length})`}
        right={
          <div className="flex gap-2">
            {tab === "REDELIVER" && (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={selected.size === 0}
                  onClick={() => startReturn([...selected])}
                >
                  <Undo2 className="h-4 w-4" />
                  Hoàn về người gửi ({selected.size})
                </Button>
                <Button
                  className="gap-2"
                  disabled={selected.size === 0}
                  onClick={() => redeliver([...selected])}
                >
                  <RotateCcw className="h-4 w-4" />
                  Giao lại ({selected.size})
                </Button>
              </>
            )}
            {tab === "RETURNING" && (
              <Button
                className="gap-2"
                disabled={selected.size === 0}
                onClick={() => finishReturn([...selected])}
              >
                <CheckCircle2 className="h-4 w-4" />
                Đã trả người gửi ({selected.size})
              </Button>
            )}
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Không có đơn trong mục này</EmptyState>
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
                  <th className="px-2 py-2">Cập nhật</th>
                  <th className="px-2 py-2">Người gửi</th>
                  <th className="px-2 py-2">Người nhận</th>
                  <th className="px-2 py-2">VP gửi → VP nhận</th>
                  <th className="px-2 py-2">Trạng thái</th>
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={selected.has(r.code)}
                        onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                        aria-label={`Chọn ${r.code}`}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium">{r.code}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(r.updatedAt ?? r.createdAt)}
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
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant="outline">{ORDER_STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                    <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                    <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {tab === "REDELIVER" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startReturn([r.code])}
                            >
                              Hoàn người gửi
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => redeliver([r.code])}>
                              Giao lại
                            </Button>
                          </>
                        )}
                        {tab === "RETURNING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => finishReturn([r.code])}
                          >
                            <Warehouse className="h-3.5 w-3.5" />
                            Đã trả người gửi
                          </Button>
                        )}
                      </div>
                    </td>
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
