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
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Download,
  Package,
  PackageCheck,
  ReceiptText,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope, isAdminRole } from "@/lib/office-scope";
import { isReadOnlyRole } from "@/lib/rbac";
import { officeName, ROLE_LABELS, type Order, type Role } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { downloadExcel } from "@/lib/csv";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchBusinessReport,
  type BusinessReport,
  type BusinessTotals,
} from "@/lib/api/finance-config-api";
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
  "#274EA1",
  "#3B6FD1",
  "#059669",
  "#D97706",
  "#DC2626",
  "#7C3AED",
  "#0EA5E9",
  "#DB2777",
  "#65A30D",
  "#EA580C",
  "#0891B2",
  "#9333EA",
  "#CA8A04",
];

function isCustomerCreated(o: Order) {
  return (o.createdBy ?? "").trim().toLowerCase() === "customer";
}

/** Khách tự tạo hay nhân viên (kèm vai trò: Điều phối, Quầy…). */
function createdSource(o: Order) {
  if (!o.createdBy) return "";
  if (isCustomerCreated(o)) return "Khách hàng";
  const role = ROLE_LABELS[o.createdByRole as Role];
  return role ? `Nhân viên - ${role}` : "Nhân viên";
}

function createdByLabel(o: Order) {
  if (!o.createdBy) return "";
  if (isCustomerCreated(o)) return "Khách hàng";
  const name = o.createdByName?.trim();
  return name && name.toLowerCase() !== o.createdBy.toLowerCase()
    ? `${name} (${o.createdBy})`
    : o.createdBy;
}

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
  { key: "createdSource", label: "Nguồn tạo", get: createdSource },
  { key: "createdBy", label: "Người tạo", get: createdByLabel },
  { key: "updatedAt", label: "Cập nhật", get: (o) => o.updatedAt },
  { key: "senderName", label: "Người gửi", get: (o) => o.senderName ?? "" },
  { key: "senderPhone", label: "SĐT gửi", get: (o) => o.senderPhone },
  { key: "receiverName", label: "Người nhận", get: (o) => o.receiverName },
  { key: "receiverPhone", label: "SĐT nhận", get: (o) => o.receiverPhone },
  { key: "fromOffice", label: "VP gửi", get: (o) => officeName(o.fromOffice) || o.fromOffice },
  { key: "toOffice", label: "VP nhận", get: (o) => officeName(o.toOffice) || o.toOffice },
  {
    key: "hubOffice",
    label: "VP hub",
    get: (o) => (o.hubOffice ? officeName(o.hubOffice) || o.hubOffice : ""),
  },
  {
    key: "finalToOffice",
    label: "VP đích cuối",
    get: (o) => (o.finalToOffice ? officeName(o.finalToOffice) || o.finalToOffice : ""),
  },
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
  {
    key: "dueAmount",
    label: "Còn thu",
    get: (o) => Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0)),
  },
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
  {
    key: "invoiceRequested",
    label: "Yêu cầu HĐ",
    get: (o) => (o.invoiceRequested ? "Có" : "Không"),
  },
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

function localDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function DashboardPage() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const today = localDay(new Date());
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [date, setDate] = useState(today);
  const [office, setOffice] = useState<string>(ALL_OFFICES);
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const readOnly = isReadOnlyRole(session?.role);
  const isAdmin = isAdminRole(session?.role);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportOffice, setExportOffice] = useState<string>(ALL_OFFICES);
  const [exportFrom, setExportFrom] = useState(from);
  const [exportTo, setExportTo] = useState(to);
  const [exportKeys, setExportKeys] = useState<Set<string>>(
    () => new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)),
  );

  useEffect(() => {
    if (!isApiEnabled() || !from || !to || from > to) return;
    let cancelled = false;
    const officeCode = office === ALL_OFFICES ? undefined : resolveOfficeCode(office);
    setReportLoading(true);
    fetchBusinessReport(from, to, officeCode)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setReport(null);
          toast.error(e instanceof Error ? e.message : "Không tải được báo cáo kinh doanh");
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, office]);

  const officeOf = (o: { code: string; fromOffice?: string }) => {
    const raw = o.fromOffice || "";
    const named = offices.find((x) => x.code === raw || x.name === raw);
    return named?.name ?? (raw || "—");
  };

  const stat = useMemo(() => {
    const start = new Date(date + "T00:00:00").getTime();
    const end = start + 86400000;

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
      buckets,
      perOfficeTotals,
      officesShown: OFFICES_ONLY.filter((o) => office === ALL_OFFICES || o === office),
    };
  }, [orders, session, date, office, offices]);

  const maxBucket = Math.max(1, ...stat.buckets.map((b) => b.count));

  const openExportDialog = () => {
    setExportOffice(office);
    setExportFrom(from);
    setExportTo(to);
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Tổng quan hoạt động
            </div>
            <h1 className="mt-0.5 text-2xl font-bold">Báo cáo kinh doanh</h1>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Từ ngày</Label>
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Đến ngày</Label>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
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
        </div>

        {from > to ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Từ ngày không được sau Đến ngày.
          </div>
        ) : null}

        <div
          className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 ${reportLoading ? "opacity-60" : ""}`}
        >
          {KPI_CARDS.map((k) => (
            <KpiCard
              key={k.key}
              spec={k}
              value={report?.current[k.key] ?? null}
              previous={report?.previous[k.key] ?? null}
            />
          ))}
        </div>

        <OfficeOrdersChart report={report} loading={reportLoading} />

        {/* Biểu đồ khung giờ — column chart */}
        <Card>
          <CardContent className="py-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Số lượng đơn hàng theo khung giờ</div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Ngày</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 w-[150px]"
                />
              </div>
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
                      <td className="sticky left-0 bg-background py-1.5 pr-2 font-medium">
                        {name}
                      </td>
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
              <div className="text-sm font-medium">
                Trường thông tin đơn ({ORDER_EXPORT_FIELDS.length})
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={allFieldsSelected}
                  onCheckedChange={(v) => toggleAllFields(Boolean(v))}
                />
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

type KpiSpec = {
  key: keyof BusinessTotals;
  label: string;
  unit: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
};

const KPI_CARDS: KpiSpec[] = [
  {
    key: "totalRevenue",
    label: "Tổng doanh thu",
    unit: "VNĐ",
    hint: "DT phiếu thu + DT đơn tồn",
    icon: Wallet,
    tone: "bg-primary/10 text-primary",
  },
  {
    key: "receiptRevenue",
    label: "Doanh thu phiếu thu",
    unit: "VNĐ",
    hint: "Phiếu thu đã xác nhận, theo ngày thu tiền",
    icon: ReceiptText,
    tone: "bg-emerald-500/10 text-emerald-600",
  },
  {
    key: "backlogRevenue",
    label: "Doanh thu đơn tồn",
    unit: "VNĐ",
    hint: "Tổng phải thu của đơn tồn",
    icon: Coins,
    tone: "bg-amber-500/10 text-amber-600",
  },
  {
    key: "totalOrders",
    label: "Tổng số đơn",
    unit: "đơn",
    hint: "Đơn giao thành công + đơn tồn",
    icon: Package,
    tone: "bg-primary/10 text-primary",
  },
  {
    key: "deliveredCount",
    label: "Đơn giao thành công",
    unit: "đơn",
    hint: "Đơn đã giao (POD) trong khoảng ngày, theo VP giao",
    icon: PackageCheck,
    tone: "bg-emerald-500/10 text-emerald-600",
  },
  {
    key: "backlogCount",
    label: "Đơn tồn",
    unit: "đơn",
    hint: "Đơn tạo trong khoảng ngày, chưa giao / huỷ / hoàn xong tại cuối khoảng, theo VP gửi",
    icon: Warehouse,
    tone: "bg-amber-500/10 text-amber-600",
  },
];

function KpiCard({
  spec,
  value,
  previous,
}: {
  spec: KpiSpec;
  value: number | null;
  previous: number | null;
}) {
  const Icon = spec.icon;
  const cur = value == null ? null : Number(value);
  const prev = previous == null ? null : Number(previous);
  const pct =
    cur != null && prev != null && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  const up = pct != null && pct >= 0;
  return (
    <Card title={spec.hint}>
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${spec.tone}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 text-sm font-medium text-muted-foreground">{spec.label}</div>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="truncate text-2xl font-bold tabular-nums">
            {cur == null ? "—" : cur.toLocaleString("vi-VN")}
          </span>
          <span className="text-xs font-medium text-muted-foreground">{spec.unit}</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs">
          {pct == null ? (
            <span className="text-muted-foreground">— so với tháng trước</span>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-emerald-600" : "text-destructive"}`}
              >
                {up ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {Math.abs(pct).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
              </span>
              <span className="text-muted-foreground">so với tháng trước</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OfficeOrdersChart({
  report,
  loading,
}: {
  report: BusinessReport | null;
  loading: boolean;
}) {
  const rows = report?.offices ?? [];
  const maxTotal = Math.max(1, ...rows.map((r) => r.delivered + r.backlog));
  const pow = Math.pow(10, Math.floor(Math.log10(maxTotal)));
  const n = maxTotal / pow;
  const step = (n <= 2 ? 0.5 : n <= 5 ? 1 : 2) * pow;
  const yMax = Math.max(step * 4, Math.ceil(maxTotal / step) * step);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((yMax * (4 - i)) / 4));
  const fmt = (d?: string) => (d ? d.split("-").reverse().join("/") : "");

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Số lượng đơn hàng theo văn phòng</div>
            <div className="text-xs text-muted-foreground">
              Thống kê trạng thái xử lý và giao hàng thành công
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary/25" /> Đang xử lý
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Giao thành công
            </span>
            {report ? (
              <span className="text-muted-foreground">
                {fmt(report.from)} – {fmt(report.to)}
              </span>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            {loading ? "Đang tải…" : "Không có đơn trong khoảng ngày này"}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex h-72 flex-col justify-between pr-1 text-[10px] text-muted-foreground">
              {ticks.map((t) => (
                <div key={t} className="tabular-nums">
                  {t}
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="relative h-72">
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className={`h-px w-full ${i === ticks.length - 1 ? "bg-border" : "bg-border/40"}`}
                    />
                  ))}
                </div>
                <div className="relative flex h-full items-end gap-3">
                  {rows.map((r) => {
                    const total = r.delivered + r.backlog;
                    return (
                      <div
                        key={r.officeCode}
                        className="flex h-full flex-1 flex-col items-center justify-end"
                        title={`${r.officeName}\nĐang xử lý: ${r.backlog}\nGiao thành công: ${r.delivered}`}
                      >
                        <div className="mb-1 text-xs font-bold tabular-nums">
                          {total.toLocaleString("vi-VN")}
                        </div>
                        <div
                          className="flex w-full max-w-[72px] flex-col overflow-hidden rounded-t"
                          style={{ height: `${(total / yMax) * 100}%` }}
                        >
                          <div
                            className="flex items-center justify-center bg-primary text-[11px] font-semibold text-primary-foreground"
                            style={{ height: `${(r.delivered / total) * 100}%` }}
                          >
                            {r.delivered > 0 && r.delivered / yMax > 0.06
                              ? r.delivered.toLocaleString("vi-VN")
                              : ""}
                          </div>
                          <div
                            className="flex items-center justify-center bg-primary/25 text-[11px] font-semibold text-primary"
                            style={{ height: `${(r.backlog / total) * 100}%` }}
                          >
                            {r.backlog > 0 && r.backlog / yMax > 0.06
                              ? r.backlog.toLocaleString("vi-VN")
                              : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex gap-3">
                {rows.map((r) => (
                  <div
                    key={r.officeCode}
                    className="flex-1 text-center text-[11px] leading-tight text-muted-foreground"
                  >
                    {r.officeName}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
