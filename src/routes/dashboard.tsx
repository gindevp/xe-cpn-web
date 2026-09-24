import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  DollarSign,
  Download,
  TrendingUp,
  Wallet,
  Truck,
  Home,
  MapPin,
  Coins,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope, isAdminRole } from "@/lib/office-scope";
import { isReadOnlyRole } from "@/lib/rbac";
import { formatVND, officeName, type Order } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { downloadExcel } from "@/lib/csv";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { isApiEnabled } from "@/lib/api/client";
import { fetchCollectionsReport, fetchDashboardReport } from "@/lib/api/finance-config-api";
import { resolveOfficeCode } from "@/lib/api/sync";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — X.E Việt Nam" },
      { name: "description", content: "KPI vận hành X.E Việt Nam." },
    ],
  }),
  component: () => <DashboardPage />,
});

const ALL_OFFICES = "Tất cả văn phòng";

const OFFICE_COLORS = [
  "#274EA1", "#3B6FD1", "#059669", "#D97706", "#DC2626",
  "#7C3AED", "#0EA5E9", "#DB2777", "#65A30D", "#EA580C",
  "#0891B2", "#9333EA", "#CA8A04",
];

type ExportField = {
  key: string;
  label: string;
  get: (o: Order) => string | number | boolean;
};

const ORDER_EXPORT_FIELDS: ExportField[] = [
  { key: "code", label: "Mã đơn", get: (o) => o.code },
  { key: "draftCode", label: "Mã nháp", get: (o) => o.draftCode ?? "" },
  { key: "status", label: "Trạng thái", get: (o) => o.status },
  { key: "stage", label: "Stage", get: (o) => o.stage ?? "" },
  { key: "returnStage", label: "Stage hoàn", get: (o) => o.returnStage ?? "" },
  { key: "createdAt", label: "Ngày tạo", get: (o) => o.createdAt },
  { key: "updatedAt", label: "Cập nhật", get: (o) => o.updatedAt },
  { key: "senderName", label: "Người gửi", get: (o) => o.senderName ?? "" },
  { key: "senderPhone", label: "SĐT gửi", get: (o) => o.senderPhone },
  { key: "receiverName", label: "Người nhận", get: (o) => o.receiverName },
  { key: "receiverPhone", label: "SĐT nhận", get: (o) => o.receiverPhone },
  { key: "fromOffice", label: "VP gửi", get: (o) => officeName(o.fromOffice) || o.fromOffice },
  { key: "toOffice", label: "VP nhận", get: (o) => officeName(o.toOffice) || o.toOffice },
  { key: "hubOffice", label: "VP hub", get: (o) => (o.hubOffice ? officeName(o.hubOffice) || o.hubOffice : "") },
  { key: "finalToOffice", label: "VP đích cuối", get: (o) => (o.finalToOffice ? officeName(o.finalToOffice) || o.finalToOffice : "") },
  { key: "address", label: "Địa chỉ giao", get: (o) => o.address ?? "" },
  { key: "pickupAddress", label: "Địa chỉ lấy", get: (o) => o.pickupAddress ?? "" },
  { key: "goodsType", label: "Loại hàng", get: (o) => o.goodsType },
  { key: "collectForm", label: "Hình thức thu", get: (o) => o.collectForm },
  { key: "weightKg", label: "Cân nặng (KG)", get: (o) => o.weightKg ?? "" },
  { key: "quantity", label: "Số lượng / kiện", get: (o) => o.quantity ?? "" },
  { key: "dimensions", label: "Kích thước", get: (o) => o.dimensions ?? "" },
  { key: "fare", label: "Tổng phải thu", get: (o) => o.fare ?? 0 },
  { key: "goodsFare", label: "Cước hàng", get: (o) => o.goodsFare ?? "" },
  { key: "pickupFee", label: "Phí lấy tận nơi", get: (o) => o.pickupFee ?? "" },
  { key: "deliveryFee", label: "Phí giao tận nơi", get: (o) => o.deliveryFee ?? "" },
  { key: "declaredFee", label: "Phí khai giá", get: (o) => o.declaredFee ?? "" },
  { key: "discountAmount", label: "Giảm giá", get: (o) => o.discountAmount ?? "" },
  { key: "paidAmount", label: "Đã thu", get: (o) => o.paidAmount ?? 0 },
  { key: "dueAmount", label: "Còn thu", get: (o) => Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0)) },
  { key: "codAmount", label: "COD", get: (o) => o.codAmount ?? "" },
  { key: "codFee", label: "Phí COD", get: (o) => o.codFee ?? "" },
  { key: "homePickup", label: "Lấy tận nơi", get: (o) => (o.homePickup ? "Có" : "Không") },
  { key: "homeDelivery", label: "Giao tận nơi", get: (o) => (o.homeDelivery ? "Có" : "Không") },
  { key: "pickupKm", label: "KM lấy", get: (o) => o.pickupKm ?? "" },
  { key: "deliveryKm", label: "KM giao", get: (o) => o.deliveryKm ?? "" },
  { key: "pickupStaff", label: "NV lấy hàng", get: (o) => o.pickupStaff ?? "" },
  { key: "pickingAt", label: "Giờ bắt đầu lấy", get: (o) => o.pickingAt ?? "" },
  { key: "pickedUpAt", label: "Giờ đã lấy", get: (o) => o.pickedUpAt ?? "" },
  { key: "qrDropOff", label: "QR drop-off", get: (o) => (o.qrDropOff ? "Có" : "Không") },
  { key: "route", label: "Tuyến", get: (o) => o.route ?? "" },
  { key: "itinerary", label: "Lộ trình", get: (o) => o.itinerary ?? "" },
  { key: "branchCode", label: "Mã chi nhánh", get: (o) => o.branchCode ?? "" },
  { key: "tripCode", label: "Mã chuyến", get: (o) => o.tripCode ?? "" },
  { key: "vehiclePlate", label: "Biển số", get: (o) => o.vehiclePlate ?? "" },
  { key: "driverName", label: "Tài xế", get: (o) => o.driverName ?? "" },
  { key: "departAt", label: "Giờ xuất phát", get: (o) => o.departAt ?? "" },
  { key: "shelf", label: "Kệ", get: (o) => o.shelf ?? "" },
  { key: "note", label: "Ghi chú", get: (o) => o.note ?? "" },
  { key: "bankName", label: "Ngân hàng", get: (o) => o.bankName ?? "" },
  { key: "bankAccountNo", label: "Số TK", get: (o) => o.bankAccountNo ?? "" },
  { key: "bankAccountName", label: "Chủ TK", get: (o) => o.bankAccountName ?? "" },
  { key: "invoiceRequested", label: "Yêu cầu HĐ", get: (o) => (o.invoiceRequested ? "Có" : "Không") },
  { key: "invoiceTaxCode", label: "MST", get: (o) => o.invoiceTaxCode ?? "" },
  { key: "invoiceCompanyName", label: "Tên công ty HĐ", get: (o) => o.invoiceCompanyName ?? "" },
  { key: "invoiceEmail", label: "Email HĐ", get: (o) => o.invoiceEmail ?? "" },
  { key: "invoiceCompanyAddress", label: "Địa chỉ HĐ", get: (o) => o.invoiceCompanyAddress ?? "" },
  { key: "invoiceStatus", label: "Trạng thái HĐ", get: (o) => o.invoiceStatus ?? "" },
  { key: "invoiceNo", label: "Số HĐ", get: (o) => o.invoiceNo ?? "" },
  { key: "invoiceSeries", label: "Ký hiệu HĐ", get: (o) => o.invoiceSeries ?? "" },
  { key: "invoiceCode", label: "Mã HĐ", get: (o) => o.invoiceCode ?? "" },
  { key: "invoiceGrossAmount", label: "HĐ gross", get: (o) => o.invoiceGrossAmount ?? "" },
  { key: "invoiceNetAmount", label: "HĐ net", get: (o) => o.invoiceNetAmount ?? "" },
  { key: "invoiceVatAmount", label: "VAT", get: (o) => o.invoiceVatAmount ?? "" },
  { key: "invoiceIssuedAt", label: "Ngày xuất HĐ", get: (o) => o.invoiceIssuedAt ?? "" },
  { key: "invoiceError", label: "Lỗi HĐ", get: (o) => o.invoiceError ?? "" },
  { key: "codExportedAt", label: "COD exported", get: (o) => o.codExportedAt ?? "" },
];

function DashboardPage() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [office, setOffice] = useState<string>(ALL_OFFICES);
  const [apiPaid, setApiPaid] = useState<number | null>(null);
  const readOnly = isReadOnlyRole(session?.role);
  const isAdmin = isAdminRole(session?.role);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportOffice, setExportOffice] = useState<string>(ALL_OFFICES);
  const [exportFrom, setExportFrom] = useState(date);
  const [exportTo, setExportTo] = useState(date);
  const [exportKeys, setExportKeys] = useState<Set<string>>(
    () => new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)),
  );

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    const officeCode = office === ALL_OFFICES ? undefined : resolveOfficeCode(office);
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
    return named?.name ?? (raw || "—");
  };

  const stat = useMemo(() => {
    const start = new Date(date + "T00:00:00").getTime();
    const end = start + 86400000;
    const now = Date.now();

    const scopeRole = (o: any) =>
      hasAllOfficeScope(session)
        ? true
        : o.fromOffice === session?.office || o.toOffice === session?.office;

    const scoped = orders.filter((o) => {
      if (!scopeRole(o)) return false;
      if (office !== ALL_OFFICES && officeOf(o) !== office) return false;
      return true;
    });

    const created = scoped.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start && t < end;
    });

    const revenueFare = created.reduce((s, o) => s + (o.fare || 0), 0);
    const revenuePickup = created.reduce((s, o) => s + (o.pickupFee || 0), 0);
    const revenueDelivery = created.reduce((s, o) => s + (o.deliveryFee || 0), 0);
    const revenueGoods = revenueFare;
    const revenueTotal = revenueFare + revenuePickup + revenueDelivery;

    const cost = 0;
    const profit = revenueTotal - cost;

    const pickupHome = created.filter((o) => o.homePickup).length;
    const pickupRoute = created.filter((o) => !o.homePickup).length;
    const cod = created.filter((o) =>
      ["NHAN_TRA", "P30_70", "P50_50", "P70_30"].includes(o.collectForm),
    ).length;
    const deliverHome = created.filter((o) => o.homeDelivery).length;
    const deliverRoute = created.filter((o) => !o.homeDelivery).length;

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

    const weekStart = now - 7 * 86400 * 1000;
    const delivered = scoped.filter(
      (o) => o.status === "DELIVERED" && new Date(o.updatedAt).getTime() >= weekStart,
    ).length;
    const failed = scoped.filter(
      (o) => o.status === "FAILED_DELIVERY" && new Date(o.updatedAt).getTime() >= weekStart,
    ).length;
    const pod = delivered + failed === 0 ? 100 : (delivered * 100) / (delivered + failed);

    const OFFICES_ONLY = offices.map((o) => o.name);

    const buckets = Array.from({ length: 12 }, (_, i) => {
      const label = `${String(i * 2).padStart(2, "0")}-${String(i * 2 + 2).padStart(2, "0")}h`;
      const perOffice: Record<string, number> = {};
      for (const name of OFFICES_ONLY) {
        perOffice[name] = 0;
      }
      const realInBucket = created.filter(
        (o) => Math.floor(new Date(o.createdAt).getHours() / 2) === i,
      );
      for (const o of realInBucket) {
        const off = officeOf(o);
        if (office !== ALL_OFFICES && off !== office) continue;
        perOffice[off] = (perOffice[off] || 0) + 1;
      }
      const count = Object.values(perOffice).reduce((a, b) => a + b, 0);
      return { label, count, perOffice };
    });

    const perOfficeTotals: Record<string, number> = {};
    for (const b of buckets) {
      for (const [k, v] of Object.entries(b.perOffice)) {
        perOfficeTotals[k] = (perOfficeTotals[k] || 0) + v;
      }
    }

    return {
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
      officesShown: OFFICES_ONLY.filter((o) => office === ALL_OFFICES || o === office),
    };
  }, [orders, trips, session, date, office, offices, apiPaid]);

  const maxBucket = Math.max(1, ...stat.buckets.map((b) => b.count));

  const openExportDialog = () => {
    setExportOffice(office);
    setExportFrom(date);
    setExportTo(date);
    setExportKeys(new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)));
    setExportOpen(true);
  };

  const toggleExportKey = (key: string, on: boolean) => {
    setExportKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const allFieldsSelected = exportKeys.size === ORDER_EXPORT_FIELDS.length;
  const toggleAllFields = (on: boolean) => {
    setExportKeys(on ? new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)) : new Set());
  };

  const doExportExcel = () => {
    if (!exportKeys.size) {
      toast.error("Chọn ít nhất một trường để xuất");
      return;
    }
    if (exportFrom > exportTo) {
      toast.error("Từ ngày không được sau Đến ngày");
      return;
    }
    const start = new Date(exportFrom + "T00:00:00").getTime();
    const end = new Date(exportTo + "T23:59:59.999").getTime();
    const fields = ORDER_EXPORT_FIELDS.filter((f) => exportKeys.has(f.key));

    const rows = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      if (!Number.isFinite(t) || t < start || t > end) return false;
      if (exportOffice === ALL_OFFICES) return true;
      const fromName = officeOf(o);
      const toName =
        offices.find((x) => x.code === o.toOffice || x.name === o.toOffice)?.name ?? o.toOffice;
      return fromName === exportOffice || toName === exportOffice;
    });

    downloadExcel(
      `don-hang-${exportFrom}_${exportTo}`,
      fields.map((f) => f.label),
      rows.map((o) => fields.map((f) => f.get(o))),
    );
    toast.success(`Đã xuất ${rows.length} đơn · ${fields.length} cột`);
    setExportOpen(false);
  };

  return (
    <ProtectedPage title="Dashboard" screen="dashboard">
      <div className="space-y-4">
      {/* Lọc ngày / VP + Xuất Excel (admin) — trên KPI */}
      <div className="flex flex-wrap items-end justify-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Ngày</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Văn phòng</Label>
          <SearchableSelect
            value={office}
            onValueChange={setOffice}
            className="h-9 w-[200px]"
            options={[
              { value: ALL_OFFICES, label: ALL_OFFICES },
              ...offices.map((o) => ({ value: o.name, label: o.name })),
            ]}
          />
        </div>
        {isAdmin ? (
          <Button variant="outline" className="h-9 gap-2" onClick={openExportDialog}>
            <Download className="h-4 w-4" /> Xuất Excel
          </Button>
        ) : null}
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
                <div className="flex h-72 flex-col justify-between pr-1 text-[10px] text-muted-foreground">
                  {ticks.map((t) => (
                    <div key={t} className="tabular-nums">
                      {t}
                    </div>
                  ))}
                </div>

                <div className="flex-1">
                  <div className="relative h-72">
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
                              {Object.values(b.perOffice).every((v) => !v) && (
                                <div className="text-muted-foreground">Không có đơn</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  <div className="mt-2 flex gap-2">
                    {stat.buckets.map((b) => (
                      <div
                        key={b.label}
                        className="flex-1 text-center text-[10px] text-muted-foreground"
                      >
                        {b.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="mb-3 text-sm font-semibold">Số đơn theo văn phòng / khung giờ</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="sticky left-0 bg-background py-1.5 pr-2">Văn phòng</th>
                  {stat.buckets.map((b) => (
                    <th key={b.label} className="px-1.5 py-1.5 text-right font-normal">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {stat.officesShown.map((name) => (
                  <tr key={name} className="border-b hover:bg-muted/30">
                    <td className="sticky left-0 bg-background py-1.5 pr-2 font-medium">{name}</td>
                    {stat.buckets.map((b) => (
                      <td key={b.label} className="px-1.5 py-1.5 text-right tabular-nums">
                        {b.perOffice[name] || ""}
                      </td>
                    ))}
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
                  <td className="px-2 py-1.5 text-right tabular-nums">{stat.totalOrders}</td>
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

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Xuất Excel đơn hàng</DialogTitle>
            <DialogDescription>
              Lọc theo văn phòng và khoảng ngày tạo đơn, chọn các trường cần xuất. Chỉ admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs">Văn phòng</Label>
                <SearchableSelect
                  value={exportOffice}
                  onValueChange={setExportOffice}
                  className="h-9"
                  options={[
                    { value: ALL_OFFICES, label: ALL_OFFICES },
                    ...offices.map((o) => ({ value: o.name, label: o.name })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Từ ngày</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Đến ngày</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <div className="text-sm font-medium">Trường thông tin đơn ({ORDER_EXPORT_FIELDS.length})</div>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={allFieldsSelected} onCheckedChange={(v) => toggleAllFields(Boolean(v))} />
                Chọn tất cả
              </label>
            </div>

            <div className="grid max-h-[40vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {ORDER_EXPORT_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={exportKeys.has(f.key)}
                    onCheckedChange={(v) => toggleExportKey(f.key, Boolean(v))}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter className="border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Huỷ
            </Button>
            <Button type="button" className="gap-2" onClick={doExportExcel}>
              <Download className="h-4 w-4" />
              Xuất Excel ({exportKeys.size} cột)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedPage>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === "pos" ? "text-emerald-700" : tone === "neg" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
