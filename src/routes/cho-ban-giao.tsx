import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
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
import { OrderPackageListRow } from "@/components/OrderPackageListRow";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { EditPackageDialog } from "@/components/EditPackageDialog";
import { formatVND, formatDateTime, officeName, type Order } from "@/lib/mock-data";
import { orderGoodsFare, packageCount } from "@/lib/package-label";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Home,
  Search,
  Warehouse,
  ChevronDown,
} from "lucide-react";

const TH_MUTED = "px-2 py-2 font-semibold text-slate-500";
const FEE_COL_COUNT = 4;

function OrderFeeHeaders() {
  return (
    <>
      <th className={`${TH_MUTED} text-right whitespace-nowrap`}>Cước</th>
      <th className={`${TH_MUTED} text-right whitespace-nowrap`}>
        <div>COD</div>
        <div className="text-[10px] font-medium normal-case tracking-normal text-slate-500">
          / Phí thu hộ
        </div>
      </th>
      <th className={`${TH_MUTED} text-right whitespace-nowrap`}>
        <div>Lấy tận nơi</div>
        <div className="text-[10px] font-medium normal-case tracking-normal text-slate-500">
          / Giao tận nơi
        </div>
      </th>
      <th className={`${TH_MUTED} text-right whitespace-nowrap`} title="Phí khai báo giá trị">
        Phí KBGT
      </th>
    </>
  );
}

function OrderFeeCells({ order }: { order: Order }) {
  const money = (n: number) => formatVND(n);
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap font-medium">
        {money(orderGoodsFare(order))}
      </td>
      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
        <div>COD {money(order.codAmount ?? 0)}</div>
        <div className="text-xs text-muted-foreground">Phí {money(order.codFee ?? 0)}</div>
      </td>
      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
        <div>Lấy {money(order.pickupFee ?? 0)}</div>
        <div className="text-xs text-muted-foreground">Giao {money(order.deliveryFee ?? 0)}</div>
      </td>
      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
        {money(order.declaredFee ?? 0)}
      </td>
    </>
  );
}

export const Route = createFileRoute("/cho-ban-giao")({
  head: () => ({
    meta: [
      { title: "Chờ bàn giao — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn khách chọn lấy tận nơi, nhân viên đang đến lấy hàng và chờ nhập kho.",
      },
      { property: "og:title", content: "Chờ bàn giao — X.E" },
      {
        property: "og:description",
        content:
          "Theo dõi đơn lấy tận nơi và nhập kho để chuyển sang Đơn chờ gán xe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Chờ bàn giao" screen="cho-ban-giao">
      <Page />
    </ProtectedPage>
  ),
});

type TabKey = "cho-lay" | "cho-nhan" | "dang-lay";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  {
    key: "cho-lay",
    label: "Chờ lấy hàng",
    hint: "Khách tạo đơn chọn lấy tận nơi, chờ shipper đến lấy hàng",
  },
  {
    key: "cho-nhan",
    label: "Chờ nhận hàng",
    hint: "Khách tạo đơn tự mang hàng đến bưu cục hoặc quét QR tại bưu cục, chờ xác nhận nhập kho",
  },
  {
    key: "dang-lay",
    label: "Đang lấy hàng",
    hint: "Shipper đang trên đường lấy hàng",
  },
];

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const [tab, setTab] = useState<TabKey>("cho-lay");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [senderOffice, setSenderOffice] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<{
    code: string;
    packageSeq?: number;
    batchPackages?: boolean;
  } | null>(null);
  const [editPkg, setEditPkg] = useState<{ code: string; seq: number } | null>(null);

  const toggleOrderPkgs = (code: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const scopeAll = hasAllOfficeScope(session);

  const inTab = (o: (typeof orders)[number], key: TabKey) => {
    // Chờ nhận hàng: khách quét QR tại bưu cục, hoặc đơn nháp khách tạo không tích lấy tận nơi
    // (khách tự mang hàng đến VP).
    if (key === "cho-nhan") return Boolean(o.qrDropOff) || (o.status === "DRAFT" && !o.homePickup);
    if (!o.homePickup) return false;
    const picking = Boolean(o.pickupStaff || o.pickingAt);
    return key === "dang-lay" ? picking : !picking;
  };

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const inScope = pendingHandoverOrders(orders, { allOffices: scopeAll, office: session?.office });
    return inScope.filter((o) => {
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(to + "T23:59:59")) return false;
      if (senderOffice && o.fromOffice !== senderOffice) return false;
      if (kw) {
        const hay = `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""} ${o.pickupAddress ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [orders, q, from, to, senderOffice, scopeAll, session]);

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, t) => ({ ...acc, [t.key]: base.filter((o) => inTab(o, t.key)).length }),
        {} as Record<TabKey, number>,
      ),
    [base],
  );

  const rows = useMemo(() => base.filter((o) => inTab(o, tab)), [base, tab]);


  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + packageCount(r), 0);
    const pickupFee = rows.reduce((s, r) => s + (r.pickupFee ?? 0), 0);
    const unpaid = rows.reduce(
      (s, r) => s + Math.max(0, r.fare + (r.pickupFee ?? 0) - (r.paidAmount ?? 0)),
      0,
    );
    return { orders: rows.length, qty, weight, pickupFee, unpaid };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) =>
    setSelected(v ? new Set(rows.map((r) => r.code)) : new Set());
  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code);
      else next.delete(code);
      return next;
    });

  const receiveToWarehouse = (codes: string[]) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        pickedUpAt: at,
        events: [
          ...(o.events ?? []),
          {
            at,
            by,
            action: "PICKUP_RECEIVED",
            detail: o.homePickup
              ? `Đã lấy hàng tận nơi & nhập kho ${officeName(o.fromOffice)}`
              : `Đã nhận hàng tại bưu cục & nhập kho ${officeName(o.fromOffice)}`,
          },
        ],
      });
      st.audit({
        action: "PICKUP_RECEIVED",
        entityType: "order",
        entityId: code,
        detail: "Nhập kho từ Chờ bàn giao",
      });
    }
    setSelected(new Set());
    toast.success(`Đã nhập kho ${codes.length} đơn · chuyển sang Đơn chờ gán xe`);
  };

  const startPickup = (codes: string[]) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        pickingAt: at,
        pickupStaff: o.pickupStaff ?? by,
        events: [
          ...(o.events ?? []),
          { at, by, action: "PICKUP_STARTED", detail: "Shipper bắt đầu đi lấy hàng" },
        ],
      });
      st.audit({
        action: "PICKUP_STARTED",
        entityType: "order",
        entityId: code,
        detail: "Chuyển sang Đang lấy hàng",
      });
    }
    setSelected(new Set());
    toast.success(`Đã chuyển ${codes.length} đơn sang Đang lấy hàng`);
  };

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
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} KG`} />
        <Kpi icon={Home} label="Phí lấy tận nơi" value={formatVND(metrics.pickupFee)} />
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
            <Label className="text-xs">Văn phòng gửi</Label>
            <SearchableSelect
              value={senderOffice || "all"}
              onValueChange={(v) => setSenderOffice(v === "all" ? "" : v)}
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
                placeholder="Mã đơn, SĐT, địa chỉ lấy"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={`${activeTab.label} (${rows.length})`}
        right={
          <div className="flex gap-2">
            {tab === "cho-lay" && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={selected.size === 0}
                onClick={() => startPickup([...selected])}
              >
                <Home className="h-4 w-4" />
                Shipper đi lấy ({selected.size})
              </Button>
            )}
            <Button
              className="gap-2"
              disabled={selected.size === 0}
              onClick={() => receiveToWarehouse([...selected])}
            >
              <Warehouse className="h-4 w-4" />
              {tab === "cho-nhan" ? "Xác nhận nhập kho" : "Nhập kho"} ({selected.size})
            </Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Không có đơn trong mục này</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className={`${TH_MUTED} pl-6`}>Mã đơn</th>
                  <th className={TH_MUTED}>Người gửi</th>
                  <th className={TH_MUTED}>Người nhận</th>
                  <th className={TH_MUTED}>VP gửi → VP nhận</th>
                  <th className={`${TH_MUTED} text-right`}>Kiện</th>
                  <th className={`${TH_MUTED} text-right`}>KL (kg)</th>
                  <OrderFeeHeaders />
                  <th className={`${TH_MUTED} text-right`}>Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.code}>
                    <tr className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(r.code)}
                          onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                          aria-label={`Chọn ${r.code}`}
                        />
                      </td>
                      <td className="px-2 py-2 pl-6 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center text-left"
                            title={expandedOrders.has(r.code) ? "Ẩn kiện" : "Xem kiện"}
                            onClick={() => toggleOrderPkgs(r.code)}
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                expandedOrders.has(r.code) && "rotate-180",
                              )}
                            />
                          </button>
                          <OrderCodeLink code={r.code} />
                        </span>
                        <Badge variant="secondary" className="ml-2 font-normal">
                          {r.qrDropOff
                            ? "Quét QR tại bưu cục"
                            : r.homePickup
                              ? "Lấy tận nơi"
                              : "Khách mang đến"}
                        </Badge>
                        <div className="pl-6 text-xs font-normal text-muted-foreground">
                          {formatDateTime(r.createdAt)}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div>{r.senderName ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{r.senderPhone}</div>
                        {!r.qrDropOff && (r.pickupAddress || r.address) ? (
                          <div className="mt-0.5 max-w-[220px] text-xs text-muted-foreground">
                            {r.pickupAddress ?? r.address}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <div>{r.receiverName}</div>
                        <div className="text-xs text-muted-foreground">{r.receiverPhone}</div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {officeName(r.fromOffice)} → {officeName(r.toOffice)}
                      </td>
                      <td className="px-2 py-2 text-right">{packageCount(r)}</td>
                      <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                      <OrderFeeCells order={r} />
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {tab === "cho-lay" && (
                            <Button size="sm" variant="ghost" onClick={() => startPickup([r.code])}>
                              Shipper đi lấy
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => receiveToWarehouse([r.code])}
                          >
                            {tab === "cho-nhan" ? "Xác nhận nhập kho" : "Nhập kho"}
                          </Button>
                        </div>
                        {tab !== "cho-nhan" && !r.qrDropOff ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            NV: {r.pickupStaff ?? "Chưa phân công"}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    {expandedOrders.has(r.code) && (
                      <OrderPackageListRow
                        order={r}
                        layout="rows"
                        leadingCols={1}
                        feeCols={FEE_COL_COUNT}
                        onPrintPackage={(code, seq) => setPrintTarget({ code, packageSeq: seq })}
                        onEditPackage={(code, seq) => setEditPkg({ code, seq })}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <PrintLabelDialog
        code={printTarget?.code ?? null}
        packageSeq={printTarget?.packageSeq}
        batchPackages={printTarget?.batchPackages}
        open={!!printTarget}
        onOpenChange={(v) => !v && setPrintTarget(null)}
      />
      <EditPackageDialog
        orderCode={editPkg?.code ?? null}
        packageSeq={editPkg?.seq ?? null}
        open={!!editPkg}
        onOpenChange={(v) => !v && setEditPkg(null)}
      />
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
