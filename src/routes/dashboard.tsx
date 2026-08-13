import { createFileRoute, Link } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Package,
  DollarSign,
  Download,
  Search,
  TrendingUp,
  Wallet,
  Truck,
  Home,
  MapPin,
  Coins,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isReadOnlyRole } from "@/lib/rbac";
import { formatVND, ORDER_STATUS_LABEL } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { useEffect, useMemo, useState } from "react";
import { isApiEnabled } from "@/lib/api/client";
import { fetchCollectionsReport, fetchDashboardReport } from "@/lib/api/finance-config-api";
import { resolveOfficeCode } from "@/lib/api/sync";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — X.E Việt Nam" },
      { name: "description", content: "KPI vận hành X.E Việt Nam." },
    ],
  }),
  component: () => <DashboardPage />,

});

// Danh sách văn phòng chi nhánh (mock cho tổng quan)
const BRANCH_OFFICES = [
  "Tất cả văn phòng",
  "VP Ngọc Hồi",
  "VP Lê Duẩn",
  "VP Phố Vọng",
  "VP Trần Đại Nghĩa",
  "VP Giải Phóng",
  "VP Hà Đông",
  "VP BigC",
  "VP Ninh Bình",
  "VP Nam Định",
  "VP 104 Song Hào - NĐ",
  "VP Thái Bình",
  "VP Phú Thọ",
  "VP Việt Trì",
  "VP Yên Bái 1",
  "VP Yên Bái 3",
];

const OFFICE_COLORS = [
  "#274EA1", "#3B6FD1", "#059669", "#D97706", "#DC2626",
  "#7C3AED", "#0EA5E9", "#DB2777", "#65A30D", "#EA580C",
  "#0891B2", "#9333EA", "#CA8A04",
];


function DashboardPage() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [office, setOffice] = useState<string>(BRANCH_OFFICES[0]);
  const [search, setSearch] = useState("");
  const [apiPaid, setApiPaid] = useState<number | null>(null);
  const readOnly = isReadOnlyRole(session?.role);

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    const officeCode = office === BRANCH_OFFICES[0] ? undefined : resolveOfficeCode(office);
    Promise.all([
      fetchDashboardReport(officeCode, date).catch(() => null),
      fetchCollectionsReport(officeCode, date).catch(() => null),
    ]).then(([, col]) => {
      if (cancelled) return;
      const paid = col && typeof col.totalAmount === "number" ? col.totalAmount : Number((col as any)?.totalAmount ?? NaN);
      setApiPaid(Number.isFinite(paid) ? paid : null);
    });
    return () => {
      cancelled = true;
    };
  }, [date, office]);

  const officeOf = (o: { code: string; fromOffice?: string }) => {
    const raw = o.fromOffice || "";
    const named = offices.find((x) => x.code === raw || x.name === raw);
    if (named && BRANCH_OFFICES.includes(named.name)) return named.name;
    const byName = BRANCH_OFFICES.find((n) => n === raw || (named && n === named.name));
    if (byName && byName !== BRANCH_OFFICES[0]) return byName;
    let h = 0;
    for (let i = 0; i < o.code.length; i++) h = (h * 31 + o.code.charCodeAt(i)) >>> 0;
    return BRANCH_OFFICES[1 + (h % (BRANCH_OFFICES.length - 1))];
  };

  const stat = useMemo(() => {
    const start = new Date(date + "T00:00:00").getTime();
    const end = start + 86400000;
    const now = Date.now();

    const scopeRole = (o: any) =>
      session?.role === "DH" ||
      session?.role === "BL" ||
      session?.role === "AD" ||
      session?.office === "ALL"
        ? true
        : o.fromOffice === session?.office || o.toOffice === session?.office;

    const scoped = orders.filter((o) => {
      if (!scopeRole(o)) return false;
      if (office !== BRANCH_OFFICES[0] && officeOf(o) !== office) return false;
      return true;
    });

    // Đơn trong ngày
    const created = scoped.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start && t < end;
    });

    // Tổng doanh thu cước hàng trong ngày
    const revenueFare = created.reduce((s, o) => s + (o.fare || 0), 0);
    const revenuePickup = created.reduce((s, o) => s + (o.pickupFee || 0), 0);
    const revenueDelivery = created.reduce((s, o) => s + (o.deliveryFee || 0), 0);
    const revenueGoods = revenueFare;
    const revenueTotal = revenueFare + revenuePickup + revenueDelivery;

    // Chi phí ước tính ~ 62% cước hàng
    const cost = Math.round(revenueGoods * 0.62);
    const profit = revenueTotal - cost;

    // Breakdown số đơn
    const pickupHome = created.filter((o) => o.homePickup).length;
    const pickupRoute = created.filter((o) => !o.homePickup).length;
    const cod = created.filter((o) =>
      ["NHAN_TRA", "P30_70", "P50_50", "P70_30"].includes(o.collectForm),
    ).length;
    const deliverHome = created.filter((o) => o.homeDelivery).length;
    const deliverRoute = created.filter((o) => !o.homeDelivery).length;

    // Thu tiền thực tế (payments) trong ngày
    const paid = scoped.reduce((s, o) => {
      return (
        s +
        ((o as any).payments ?? [])
          .filter((p: any) => {
            const t = new Date(p.at).getTime();
            return t >= start && t < end;
          })
          .reduce((x: number, p: any) => x + p.amount, 0)
      );
    }, 0);

    // Tồn kho
    const ton24 = scoped.filter(
      (o) =>
        ["AT_DEST", "WAITING"].includes(o.status) &&
        now - new Date(o.updatedAt).getTime() > 24 * 3600 * 1000,
    ).length;
    const ton48 = scoped.filter(
      (o) =>
        ["AT_DEST", "WAITING"].includes(o.status) &&
        now - new Date(o.updatedAt).getTime() > 48 * 3600 * 1000,
    ).length;

    // Lệch chuyến mở
    const openTrips = trips.filter((t) => !["CLOSED", "CANCELLED"].includes(t.status));
    const lech = openTrips
      .map((t: any) => {
        const codes = t.loadedCodes ?? t.scannedCodes ?? [];
        const loaded = codes.length;
        const arrived = codes.filter((c: string) => {
          const o = orders.find((x) => x.code === c);
          return o && ["AT_DEST", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status);
        }).length;
        return { code: t.code, loaded, arrived, missing: loaded - arrived };
      })
      .filter((x) => x.missing > 0);

    // Tỉ lệ POD 7 ngày
    const weekStart = now - 7 * 86400 * 1000;
    const delivered = scoped.filter(
      (o) => o.status === "DELIVERED" && new Date(o.updatedAt).getTime() >= weekStart,
    ).length;
    const failed = scoped.filter(
      (o) => o.status === "FAILED_DELIVERY" && new Date(o.updatedAt).getTime() >= weekStart,
    ).length;
    const pod = delivered + failed === 0 ? 100 : (delivered * 100) / (delivered + failed);

    const OFFICES_ONLY = BRANCH_OFFICES.slice(1);

    const buckets = Array.from({ length: 12 }, (_, i) => {
      const label = `${String(i * 2).padStart(2, "0")}-${String(i * 2 + 2).padStart(2, "0")}h`;
      const perOffice: Record<string, number> = {};
      for (const name of OFFICES_ONLY) {
        if (office !== BRANCH_OFFICES[0] && name !== office) {
          perOffice[name] = 0;
          continue;
        }
        perOffice[name] = 0;
      }
      const realInBucket = created.filter(
        (o) => Math.floor(new Date(o.createdAt).getHours() / 2) === i,
      );
      for (const o of realInBucket) {
        const off = officeOf(o);
        if (office !== BRANCH_OFFICES[0] && off !== office) continue;
        perOffice[off] = (perOffice[off] || 0) + 1;
      }
      const count = Object.values(perOffice).reduce((a, b) => a + b, 0);
      return { label, count, perOffice };
    });

    // Tổng số đơn/văn phòng cả ngày (cho bảng phía dưới)
    const perOfficeTotals: Record<string, number> = {};
    for (const b of buckets) {
      for (const [k, v] of Object.entries(b.perOffice)) {
        perOfficeTotals[k] = (perOfficeTotals[k] || 0) + v;
      }
    }

    return {
      created,
      totalOrders: created.length,
      pickupHome,
      pickupRoute,
      cod,
      deliverHome,
      deliverRoute,
      revenueGoods,
      revenueTotal,
      cost,
      profit,
      paid: apiPaid ?? paid,
      ton24,
      ton48,
      lech,
      pod,
      buckets,
      perOfficeTotals,
      officesShown: OFFICES_ONLY.filter(
        (o) => office === BRANCH_OFFICES[0] || o === office,
      ),
    };
  }, [orders, trips, session, date, office, offices, apiPaid]);


  // Kết quả tìm kiếm đơn
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return orders
      .filter(
        (o) =>
          o.code.toLowerCase().includes(q) ||
          (o.receiverName || "").toLowerCase().includes(q) ||
          (o.senderName || "").toLowerCase().includes(q) ||
          (o.receiverPhone || "").includes(q) ||
          (o.senderPhone || "").includes(q),
      )
      .slice(0, 8);
  }, [orders, search]);

  const maxBucket = Math.max(1, ...stat.buckets.map((b) => b.count));

  const doExport = () => {
    downloadCSV(`kpi-${date}.csv`, [
      ["KPI", "Giá trị"],
      ["Văn phòng", office],
      ["Tổng số đơn", stat.totalOrders],
      ["Lấy tận nơi", stat.pickupHome],
      ["Lấy dọc đường", stat.pickupRoute],
      ["Thu hộ (COD)", stat.cod],
      ["Giao tận nơi", stat.deliverHome],
      ["Giao dọc đường", stat.deliverRoute],
      ["Tổng doanh thu hàng", stat.revenueGoods],
      ["Doanh thu", stat.revenueTotal],
      ["Chi phí", stat.cost],
      ["Lợi nhuận", stat.profit],
      ["Thu thực tế", stat.paid],
      ["Tồn >24h", stat.ton24],
      ["Tồn >48h", stat.ton48],
      ["Lệch chuyến mở", stat.lech.length],
      ["Tỉ lệ POD %", stat.pod.toFixed(1)],
      [],
      ["Khung giờ", "Số đơn"],
      ...stat.buckets.map((b) => [b.label, b.count]),
    ]);
  };

  const headerExtra = (
    <>
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-9 w-[150px] shrink-0"
      />
      <SearchableSelect
        value={office}
        onValueChange={setOffice}
        className="h-9 w-[180px] shrink-0"
        options={BRANCH_OFFICES.map((o) => ({ value: o, label: o }))}
      />
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên, SĐT hoặc mã đơn…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8"
        />
        {search && searchResults.length > 0 && (
          <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
            {searchResults.map((o) => (
              <Link
                key={o.code}
                to="/van-don/$ma"
                params={{ ma: o.code }}
                className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm hover:bg-accent last:border-0"
                onClick={() => setSearch("")}
              >
                <div className="min-w-0">
                  <div className="font-medium">{o.code}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {o.receiverName} · {o.receiverPhone}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px]">
                  {ORDER_STATUS_LABEL[o.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
        {search && searchResults.length === 0 && (
          <div className="absolute z-40 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-lg">
            Không tìm thấy đơn phù hợp.
          </div>
        )}
      </div>
    </>
  );

  return (
    <ProtectedPage title="Dashboard" screen="dashboard" headerExtra={headerExtra}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" className="gap-2" onClick={doExport}>
            <Download className="h-4 w-4" /> Xuất CSV
          </Button>
        </div>


      {/* Tổng số đơn hàng — breakdown */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tổng số đơn hàng
              </div>
              <div className="mt-1 text-3xl font-bold">
                {stat.totalOrders.toLocaleString("vi-VN")}
              </div>
            </div>
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Mini icon={Home} label="Lấy tận nơi" value={stat.pickupHome} />
            <Mini icon={MapPin} label="Lấy dọc đường" value={stat.pickupRoute} />
            <Mini icon={Coins} label="Thu hộ" value={stat.cod} />
            <Mini icon={Truck} label="Giao tận nơi" value={stat.deliverHome} />
            <Mini icon={MapPin} label="Giao dọc đường" value={stat.deliverRoute} />
          </div>
        </CardContent>
      </Card>

      {/* Doanh thu — breakdown */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Doanh thu
              </div>
              <div className="mt-1 text-3xl font-bold">{formatVND(stat.revenueTotal)}</div>
            </div>
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini icon={Package} label="Tổng doanh thu hàng" value={formatVND(stat.revenueGoods)} />
            <Mini icon={TrendingUp} label="Doanh thu" value={formatVND(stat.revenueTotal)} />
            <Mini icon={Wallet} label="Chi phí" value={formatVND(stat.cost)} />
            <Mini
              icon={TrendingUp}
              label="Lợi nhuận"
              value={formatVND(stat.profit)}
              tone={stat.profit >= 0 ? "pos" : "neg"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Biểu đồ khung giờ — column chart */}
      <Card>
        <CardContent className="py-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold">Số lượng đơn hàng theo khung giờ</div>
            <div className="text-xs text-muted-foreground">Ngày {date}</div>
          </div>

          {(() => {
            // Trục Y "đẹp": làm tròn maxBucket lên bội số 10/20/50/100
            const niceStep = (m: number) => {
              const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, m))));
              const n = m / pow;
              const step = n <= 2 ? 0.5 : n <= 5 ? 1 : 2;
              return step * pow;
            };
            const step = niceStep(maxBucket);
            const yMax = Math.max(step * 4, Math.ceil(maxBucket / step) * step);
            const ticks = Array.from({ length: 5 }, (_, i) => Math.round((yMax * (4 - i)) / 4));
            const peak = Math.max(...stat.buckets.map((b) => b.count));

            return (
              <div className="flex gap-2">
                {/* Trục Y */}
                <div className="flex h-72 flex-col justify-between pr-1 text-[10px] text-muted-foreground">
                  {ticks.map((t) => (
                    <div key={t} className="tabular-nums">
                      {t}
                    </div>
                  ))}
                </div>

                {/* Vùng vẽ */}
                <div className="flex-1">
                  <div className="relative h-72">
                    {/* Gridlines */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                      {ticks.map((t, i) => (
                        <div
                          key={i}
                          className={`h-px w-full ${
                            i === ticks.length - 1 ? "bg-border" : "bg-border/40"
                          }`}
                        />
                      ))}
                    </div>

                    {/* Columns */}
                    <div className="relative flex h-full items-end gap-2">

                    {stat.buckets.map((b) => {
                      const isPeak = b.count === peak && peak > 0;
                      const h = (b.count / yMax) * 100;
                      return (
                        <div
                          key={b.label}
                          className="group relative flex h-full flex-1 flex-col items-center justify-end"
                        >
                          <div
                            className={`w-full max-w-[52px] rounded-t transition-all ${
                              isPeak
                                ? "bg-primary shadow-md ring-2 ring-primary/30"
                                : "bg-primary/70 group-hover:bg-primary"
                            }`}
                            style={{ height: `${h}%`, minHeight: b.count > 0 ? 4 : 0 }}
                          >
                            <div
                              className={`-mt-5 text-center text-xs font-bold tabular-nums ${
                                isPeak ? "text-primary" : "text-foreground"
                              }`}
                            >
                              {b.count}
                            </div>
                          </div>

                          {/* Tooltip per-office */}
                          <div className="pointer-events-none absolute bottom-full z-20 mb-2 hidden w-56 rounded-md border bg-popover p-2 text-xs shadow-lg group-hover:block">
                            <div className="mb-1 flex items-center justify-between border-b pb-1 font-semibold">
                              <span>{b.label}</span>
                              <span className="tabular-nums">{b.count} đơn</span>
                            </div>
                            <div className="max-h-40 space-y-0.5 overflow-auto">
                              {stat.officesShown
                                .map((name, idx) => ({
                                  name,
                                  v: b.perOffice[name] || 0,
                                  c: OFFICE_COLORS[idx % OFFICE_COLORS.length],
                                }))
                                .filter((x) => x.v > 0)
                                .sort((a, b) => b.v - a.v)
                                .map((x) => (
                                  <div
                                    key={x.name}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-sm"
                                        style={{ backgroundColor: x.c }}
                                      />
                                      <span className="truncate">{x.name}</span>
                                    </div>
                                    <span className="tabular-nums">{x.v}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  {/* X-axis labels */}

                  <div className="mt-2 flex gap-2">
                    {stat.buckets.map((b) => {
                      const isPeak = b.count === peak && peak > 0;
                      return (
                        <div
                          key={b.label}
                          className={`flex-1 text-center text-[10px] tabular-nums ${
                            isPeak ? "font-semibold text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {b.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}


          {/* Chú thích văn phòng */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {stat.officesShown.map((name, idx) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: OFFICE_COLORS[idx % OFFICE_COLORS.length] }}
                />
                <span className="text-muted-foreground">{name}</span>
                <span className="font-semibold tabular-nums">
                  {stat.perOfficeTotals[name] || 0}
                </span>
              </div>
            ))}
          </div>

          {/* Bảng chi tiết văn phòng × khung giờ */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="sticky left-0 bg-background py-2 pr-2 text-left font-medium">
                    Văn phòng
                  </th>
                  {stat.buckets.map((b) => (
                    <th key={b.label} className="px-1.5 py-2 text-right font-medium">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {stat.officesShown.map((name, idx) => (
                  <tr key={name} className="border-b last:border-0">
                    <td className="sticky left-0 bg-background py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: OFFICE_COLORS[idx % OFFICE_COLORS.length] }}
                        />
                        <span className="truncate">{name}</span>
                      </div>
                    </td>
                    {stat.buckets.map((b) => {
                      const v = b.perOffice[name] || 0;
                      return (
                        <td
                          key={b.label}
                          className={`px-1.5 py-1.5 text-right tabular-nums ${
                            v === 0 ? "text-muted-foreground/40" : ""
                          }`}
                        >
                          {v}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {stat.perOfficeTotals[name] || 0}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-semibold">
                  <td className="sticky left-0 bg-muted/40 py-1.5 pr-2">Tổng</td>
                  {stat.buckets.map((b) => (
                    <td key={b.label} className="px-1.5 py-1.5 text-right tabular-nums">
                      {b.count}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{stat.totalOrders + 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>



      {readOnly && (
        <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
          Chế độ chỉ xem (Ban lãnh đạo) — mọi nút ghi đã ẩn.
        </div>
      )}
      </div>
    </ProtectedPage>
  );
}


function Mini({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string | number;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${
          tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : ""
        }`}
      >
        {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
      </div>
    </div>
  );
}
