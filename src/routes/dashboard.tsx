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
  ChevronDown,
  Coins,
  Download,
  Info,
  Package,
  PackageCheck,
  ReceiptText,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { hasAllOfficeScope, isAdminRole } from "@/lib/office-scope";
import { isReadOnlyRole } from "@/lib/rbac";
import {
  collectFormLabel,
  formatDateTime,
  officeName,
  orderReceiverOffice,
  isAutoException,
  openIssueType,
  ROLE_LABELS,
  type Order,
  type Role,
} from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore, type OrderX } from "@/lib/store";
import { downloadExcel } from "@/lib/csv";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchBusinessReport,
  type BusinessReport,
  type BusinessTotals,
} from "@/lib/api/finance-config-api";
import { resolveOfficeCode } from "@/lib/api/sync";
import { listOrdersPage } from "@/lib/api/domain-api";
import { orderTabStatusLabel } from "@/lib/customer-track-status";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
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
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 100;
/** Trạng thái xuất Excel = tên tab vận hành (top bar), nhóm theo màn. */
const EXPORT_TAB_GROUPS: { group: string; tabs: string[] }[] = [
  { group: "Chờ bàn giao", tabs: ["Chờ nhận hàng", "Chờ lấy hàng", "Đang lấy hàng"] },
  {
    group: "Nhập kho - Luân chuyển - Đang giao",
    tabs: [
      "Lấy hàng thành công",
      "Nhập kho gửi",
      "Đợi trung chuyển giao",
      "Hàng trên xe",
      "Nhập kho giao",
      "Đang giao hàng",
      "Giao hàng không thành công",
      "Chờ giao lại",
      "Đang hoàn",
    ],
  },
  { group: "Thành công", tabs: ["Giao thành công", "Hoàn thành công"] },
  {
    group: "Ngoại lệ - Hủy",
    tabs: ["Ngoại lệ", "Thất lạc", "Hư hỏng", "Chờ duyệt huỷ", "Đơn huỷ"],
  },
];
const EXPORT_TAB_OTHER = "Khác";
const EXPORT_TAB_KEYS = [...EXPORT_TAB_GROUPS.flatMap((g) => g.tabs), EXPORT_TAB_OTHER];
const EXPORT_TAB_SET = new Set(EXPORT_TAB_KEYS);

/** Tab đơn đang nằm — cùng rule nhãn trạng thái nội bộ; ngoại lệ tự động (quá hạn ở kho đích) như màn Ngoại lệ. */
function exportTabOf(o: OrderX): string {
  if (!openIssueType(o.issue) && isAutoException(o)) return "Ngoại lệ";
  const label = orderTabStatusLabel(o);
  if (o.status === "RETURNING" && !openIssueType(o.issue)) return "Đang hoàn";
  return EXPORT_TAB_SET.has(label) ? label : EXPORT_TAB_OTHER;
}

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
  /** Giải thích khi rê chuột vào trường trong hộp Xuất Excel. */
  hint: string;
  get: (o: Order) => string | number | boolean;
};

const money = (v?: number | null) => (v ? v : "");
const dateTime = (iso?: string | null) => (iso ? formatDateTime(iso) : "");

const ORDER_EXPORT_FIELDS: ExportField[] = [
  {
    key: "code",
    label: "Mã đơn",
    hint: "Mã vận đơn in trên tem và biên nhận.",
    get: (o) => o.code,
  },
  {
    key: "status",
    label: "Trạng thái",
    hint: "Tên tab vận hành đơn đang nằm (Nhập kho gửi, Hàng trên xe, Nhập kho giao, Giao thành công, Ngoại lệ, Đơn huỷ…) — giống bộ lọc trạng thái khi xuất.",
    get: (o) => exportTabOf(o as OrderX),
  },
  {
    key: "createdAt",
    label: "Ngày tạo",
    hint: "Thời điểm tạo đơn (giờ Việt Nam).",
    get: (o) => dateTime(o.createdAt),
  },
  {
    key: "createdSource",
    label: "Nguồn tạo",
    hint: "Khách tự tạo trên app/web, hay nhân viên tạo (kèm vai trò: Điều phối, Quầy…).",
    get: createdSource,
  },
  {
    key: "createdBy",
    label: "Người tạo",
    hint: 'Họ tên và tài khoản nhân viên tạo đơn; ghi "Khách hàng" nếu khách tự tạo.',
    get: createdByLabel,
  },
  {
    key: "senderName",
    label: "Người gửi",
    hint: "Tên người gửi hàng.",
    get: (o) => o.senderName ?? "",
  },
  {
    key: "senderPhone",
    label: "SĐT gửi",
    hint: "Số điện thoại người gửi.",
    get: (o) => o.senderPhone,
  },
  {
    key: "receiverName",
    label: "Người nhận",
    hint: "Tên người nhận hàng.",
    get: (o) => o.receiverName,
  },
  {
    key: "receiverPhone",
    label: "SĐT nhận",
    hint: "Số điện thoại người nhận.",
    get: (o) => o.receiverPhone,
  },
  {
    key: "fromOffice",
    label: "VP gửi",
    hint: "Văn phòng nhận hàng từ người gửi.",
    get: (o) => officeName(o.fromOffice) || o.fromOffice,
  },
  {
    key: "toOffice",
    label: "VP nhận",
    hint: "Văn phòng trả hàng cho người nhận. Nếu đơn đã đổi điểm nhận thì là văn phòng mới.",
    get: (o) => officeName(orderReceiverOffice(o)) || orderReceiverOffice(o),
  },
  {
    key: "address",
    label: "Địa chỉ giao",
    hint: "Địa chỉ giao tận nơi (chỉ có khi khách chọn giao tận nơi).",
    get: (o) => o.address ?? "",
  },
  {
    key: "goodsType",
    label: "Loại hàng",
    hint: "Loại hàng khai khi tạo đơn.",
    get: (o) => o.goodsType,
  },
  {
    key: "quantity",
    label: "Số kiện",
    hint: "Số kiện hàng của đơn.",
    get: (o) => o.quantity ?? "",
  },
  {
    key: "weightKg",
    label: "Cân nặng (kg)",
    hint: "Tổng cân nặng khai/cân của đơn.",
    get: (o) => o.weightKg ?? "",
  },
  {
    key: "collectForm",
    label: "Hình thức thu",
    hint: "Ai trả cước: người gửi trả, người nhận trả, hoặc chia % trả trước khi gửi / trả sau khi nhận (30–70, 50–50, 70–30).",
    get: (o) => collectFormLabel(o.collectForm),
  },
  {
    key: "goodsFare",
    label: "Cước hàng",
    hint: "Cước vận chuyển theo bảng giá, chưa gồm phí lấy/giao tận nơi, khai giá, COD.",
    get: (o) => money(o.goodsFare),
  },
  {
    key: "pickupFee",
    label: "Phí lấy tận nơi",
    hint: "Phí đến địa chỉ khách lấy hàng.",
    get: (o) => money(o.pickupFee),
  },
  {
    key: "deliveryFee",
    label: "Phí giao tận nơi",
    hint: "Phí giao hàng đến địa chỉ người nhận.",
    get: (o) => money(o.deliveryFee),
  },
  {
    key: "declaredFee",
    label: "Phí khai giá",
    hint: "Phí bảo hiểm theo giá trị hàng khách khai.",
    get: (o) => money(o.declaredFee),
  },
  {
    key: "codFee",
    label: "Phí COD",
    hint: "Phí dịch vụ thu hộ tiền hàng.",
    get: (o) => money(o.codFee),
  },
  {
    key: "discountAmount",
    label: "Giảm giá",
    hint: "Số tiền được giảm trên đơn.",
    get: (o) => money(o.discountAmount),
  },
  {
    key: "fare",
    label: "Tổng cước",
    hint: "Tổng tiền cước khách phải trả = cước hàng + phí lấy/giao tận nơi + phí khai giá + phí COD − giảm giá. Không gồm tiền COD thu hộ.",
    get: (o) => o.fare ?? 0,
  },
  {
    key: "paidAmount",
    label: "Đã thu",
    hint: "Số tiền cước đã thu của khách.",
    get: (o) => o.paidAmount ?? 0,
  },
  {
    key: "dueAmount",
    label: "Còn thu",
    hint: "Tiền cước còn phải thu = Tổng cước − Đã thu.",
    get: (o) => Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0)),
  },
  {
    key: "codAmount",
    label: "Tiền COD",
    hint: "Tiền hàng thu hộ người gửi khi giao cho người nhận (không phải cước).",
    get: (o) => money(o.codAmount),
  },
  {
    key: "vehiclePlate",
    label: "Biển số xe",
    hint: "Xe chở đơn (khi đã lên xe).",
    get: (o) => o.vehiclePlate ?? "",
  },
  {
    key: "driverName",
    label: "Tài xế",
    hint: "Tài xế của xe chở đơn.",
    get: (o) => o.driverName ?? "",
  },
  { key: "note", label: "Ghi chú", hint: "Ghi chú nhập khi tạo đơn.", get: (o) => o.note ?? "" },
  {
    key: "invoiceRequested",
    label: "Yêu cầu hoá đơn",
    hint: "Khách có yêu cầu xuất hoá đơn VAT cho đơn này không.",
    get: (o) => (o.invoiceRequested ? "Có" : "Không"),
  },
  {
    key: "invoiceNo",
    label: "Số hoá đơn",
    hint: "Số hoá đơn điện tử đã xuất (nếu có).",
    get: (o) => o.invoiceNo ?? "",
  },
];

function localDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ngày 30 của tháng (hoặc ngày cuối nếu tháng ngắn hơn). */
function monthDay30(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const day = Math.min(30, last);
  return `${iso.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

function DashboardPage() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const today = localDay(new Date());
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(() => monthDay30(today));
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
      const perOfficeOrders: Record<string, OrderX[]> = {};
      for (const o of realInBucket) {
        const off = officeOf(o);
        if (office !== ALL_OFFICES && off !== office) continue;
        perOffice[off] = (perOffice[off] || 0) + 1;
        (perOfficeOrders[off] ??= []).push(o);
      }
      const count = Object.values(perOffice).reduce((a, b) => a + b, 0);
      return { label, count, perOffice, perOfficeOrders };
    });

    const perOfficeTotals: Record<string, number> = {};
    for (const b of buckets) {
      for (const [k, v] of Object.entries(b.perOffice)) {
        perOfficeTotals[k] = (perOfficeTotals[k] || 0) + v;
      }
    }

    return {
      totalOrders: created.length,
      orders: created,
      buckets,
      perOfficeTotals,
      officesShown: OFFICES_ONLY.filter((o) => office === ALL_OFFICES || o === office),
    };
  }, [orders, session, date, office, offices]);

  const maxBucket = Math.max(1, ...stat.buckets.map((b) => b.count));
  const [hourDrill, setHourDrill] = useState<{ title: string; orders: OrderX[] } | null>(null);
  const openHourDrill = (title: string, list: OrderX[]) => {
    if (!list.length) return;
    setHourDrill({
      title,
      orders: [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    });
  };

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

  const [exporting, setExporting] = useState(false);
  /** Đơn trong khoảng ngày/VP (mọi tab) — tải một lần khi đổi bộ lọc, lọc tab tại chỗ. */
  const [exportPool, setExportPool] = useState<OrderX[] | null>(null);
  const [exportPoolLoading, setExportPoolLoading] = useState(false);
  const [exportTabs, setExportTabs] = useState<Set<string>>(() => new Set(EXPORT_TAB_KEYS));
  const allTabsSelected = exportTabs.size === EXPORT_TAB_KEYS.length;
  const [exportTabsOpen, setExportTabsOpen] = useState(false);
  const toggleExportTab = (t: string, on: boolean) =>
    setExportTabs((prev) => {
      const next = new Set(prev);
      if (on) next.add(t);
      else next.delete(t);
      return next;
    });

  useEffect(() => {
    if (!exportOpen || !isApiEnabled() || exportFrom > exportTo) {
      setExportPool(null);
      setExportPoolLoading(false);
      return;
    }
    const officeCode =
      exportOffice === ALL_OFFICES
        ? undefined
        : (offices.find((x) => x.name === exportOffice)?.code ?? resolveOfficeCode(exportOffice));
    let cancelled = false;
    setExportPoolLoading(true);
    const timer = setTimeout(async () => {
      try {
        const all: OrderX[] = [];
        for (let page = 0; page < EXPORT_MAX_PAGES && !cancelled; page++) {
          const { rows, total } = await listOrdersPage({
            createdFrom: exportFrom,
            createdTo: exportTo,
            officeCode: officeCode || undefined,
            cancelRequests: "include",
            size: EXPORT_PAGE_SIZE,
            page,
            sort: "createdAt,asc",
          });
          all.push(...rows);
          if (rows.length < EXPORT_PAGE_SIZE || all.length >= total) break;
        }
        if (!cancelled) setExportPool(all);
      } catch (e) {
        if (!cancelled) {
          setExportPool(null);
          toast.error(e instanceof Error ? e.message : "Không tải được danh sách đơn");
        }
      } finally {
        if (!cancelled) setExportPoolLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [exportOpen, exportFrom, exportTo, exportOffice, offices]);

  const exportTabCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of exportPool ?? []) {
      const t = exportTabOf(o);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [exportPool]);

  const exportRows = useMemo(
    () => (exportPool ?? []).filter((o) => exportTabs.has(exportTabOf(o))),
    [exportPool, exportTabs],
  );

  const doExportExcel = async () => {
    if (!exportKeys.size) {
      toast.error("Chọn ít nhất một trường để xuất");
      return;
    }
    if (exportFrom > exportTo) {
      toast.error("Từ ngày không được sau Đến ngày");
      return;
    }
    if (!isApiEnabled()) {
      toast.error("Chưa kết nối máy chủ — không xuất được");
      return;
    }
    if (!exportPool) {
      toast.error("Danh sách đơn chưa tải xong");
      return;
    }
    if (!exportRows.length) {
      toast.error("Không có đơn nào thuộc các trạng thái đã chọn");
      return;
    }
    const fields = ORDER_EXPORT_FIELDS.filter((f) => exportKeys.has(f.key));

    setExporting(true);
    try {
      const rows = exportRows;
      downloadExcel(
        `don-hang-${exportFrom}_${exportTo}`,
        fields.map((f) => f.label),
        rows.map((o) => fields.map((f) => f.get(o))),
      );
      toast.success(`Đã xuất ${rows.length} đơn · ${fields.length} cột`);
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách đơn để xuất");
    } finally {
      setExporting(false);
    }
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
                          <HourCount
                            n={b.perOffice[name] || 0}
                            blankZero
                            onOpen={() => openHourDrill(`${name} · ${b.label}`, b.perOfficeOrders[name] ?? [])}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                        <HourCount
                          n={stat.perOfficeTotals[name] || 0}
                          onOpen={() =>
                            openHourDrill(
                              `${name} · cả ngày`,
                              stat.buckets.flatMap((b) => b.perOfficeOrders[name] ?? []),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="sticky left-0 bg-muted/40 py-1.5 pr-2">Tổng</td>
                    {stat.buckets.map((b) => (
                      <td key={b.label} className="px-1.5 py-1.5 text-right tabular-nums">
                        <HourCount
                          n={b.count}
                          onOpen={() =>
                            openHourDrill(`Tất cả văn phòng · ${b.label}`, Object.values(b.perOfficeOrders).flat())
                          }
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <HourCount n={stat.totalOrders} onOpen={() => openHourDrill("Cả ngày", stat.orders)} />
                    </td>
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

      <Dialog open={!!hourDrill} onOpenChange={(open) => !open && setHourDrill(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{hourDrill?.title}</DialogTitle>
            <DialogDescription>
              {hourDrill?.orders.length ?? 0} đơn tạo trong khung này, mọi trạng thái.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto px-5 py-3">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">Mã đơn</th>
                  <th className="py-2 pr-2 font-medium">Giờ tạo</th>
                  <th className="py-2 pr-2 font-medium">Trạng thái</th>
                  <th className="py-2 pr-2 font-medium">Người gửi</th>
                  <th className="py-2 font-medium">Người nhận</th>
                </tr>
              </thead>
              <tbody>
                {hourDrill?.orders.map((o) => (
                  <tr key={o.code} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <OrderCodeLink code={o.code} />
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDateTime(o.createdAt)}</td>
                    <td className="py-2 pr-2">{orderTabStatusLabel(o)}</td>
                    <td className="py-2 pr-2">
                      <div>{o.senderName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.senderPhone}</div>
                    </td>
                    <td className="py-2">
                      <div>{o.receiverName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.receiverPhone}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium"
                  onClick={() => setExportTabsOpen((v) => !v)}
                  aria-expanded={exportTabsOpen}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      !exportTabsOpen && "-rotate-90",
                    )}
                  />
                  Trạng thái theo tab
                  <span className="truncate font-normal text-muted-foreground">
                    ·{" "}
                    {allTabsSelected
                      ? "Tất cả"
                      : `Đã chọn ${exportTabs.size}/${EXPORT_TAB_KEYS.length}`}
                  </span>
                </button>
                {exportTabsOpen ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={allTabsSelected}
                      onCheckedChange={(v) =>
                        setExportTabs(v ? new Set(EXPORT_TAB_KEYS) : new Set())
                      }
                    />
                    Chọn tất cả
                  </label>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setExportTabsOpen(true)}
                  >
                    Lọc trạng thái
                  </button>
                )}
              </div>
              {exportTabsOpen &&
                [
                  ...EXPORT_TAB_GROUPS,
                  ...((exportTabCounts.get(EXPORT_TAB_OTHER) ?? 0) > 0
                    ? [{ group: "Khác", tabs: [EXPORT_TAB_OTHER] }]
                    : []),
                ].map((g) => {
                  const groupOn = g.tabs.every((t) => exportTabs.has(t));
                  return (
                    <div key={g.group} className="rounded-md border px-3 py-2">
                      <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Checkbox
                          checked={groupOn}
                          onCheckedChange={(v) =>
                            g.tabs.forEach((t) => toggleExportTab(t, Boolean(v)))
                          }
                        />
                        {g.group}
                      </label>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {g.tabs.map((t) => (
                          <label
                            key={t}
                            className="flex cursor-pointer items-center gap-1.5 text-sm"
                          >
                            <Checkbox
                              checked={exportTabs.has(t)}
                              onCheckedChange={(v) => toggleExportTab(t, Boolean(v))}
                            />
                            {t}
                            {exportPool ? (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                ({(exportTabCounts.get(t) ?? 0).toLocaleString("vi-VN")})
                              </span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
              <div className="text-sm font-semibold">
                {exportFrom > exportTo
                  ? "Khoảng ngày không hợp lệ"
                  : exportPoolLoading
                    ? "Đang tải danh sách đơn…"
                    : !exportPool
                      ? "Chưa tải được danh sách đơn"
                      : exportTabs.size === 0
                        ? "Chưa chọn trạng thái nào"
                        : `Sẽ tải về ${exportRows.length.toLocaleString("vi-VN")} / ${exportPool.length.toLocaleString("vi-VN")} đơn`}
              </div>
              <div className="mt-1">
                Gồm đơn{" "}
                <b>
                  {allTabsSelected
                    ? "mọi tab"
                    : EXPORT_TAB_KEYS.filter((t) => exportTabs.has(t)).join(", ") || "—"}
                </b>
                , <b>tạo</b> trong khoảng ngày trên
                {exportOffice === ALL_OFFICES
                  ? ", trên toàn hệ thống."
                  : `, có VP gửi, VP đến hoặc VP nhận là ${exportOffice}.`}{" "}
                Trạng thái = tab đơn đang nằm lúc xuất (cột “Trạng thái” trong file ghi đúng tên tab
                này).
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

            <TooltipProvider delayDuration={200}>
              <div className="grid max-h-[40vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {ORDER_EXPORT_FIELDS.map((f) => (
                  <Tooltip key={f.key}>
                    <TooltipTrigger asChild>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40">
                        <Checkbox
                          className="mt-0.5"
                          checked={exportKeys.has(f.key)}
                          onCheckedChange={(v) => toggleExportKey(f.key, Boolean(v))}
                        />
                        <span className="flex-1">{f.label}</span>
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs leading-relaxed">
                      {f.hint}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <DialogFooter className="border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={exporting}
              onClick={() => void doExportExcel()}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Đang tải đơn…" : `Xuất Excel (${exportKeys.size} cột)`}
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
    hint: "Phiếu thu đã xác nhận, theo ngày thu tiền (không gồm tiền thu hộ COD)",
    icon: ReceiptText,
    tone: "bg-emerald-500/10 text-emerald-600",
  },
  {
    key: "backlogRevenue",
    label: "Doanh thu đơn tồn",
    unit: "VNĐ",
    hint: "Cước đơn tồn chưa lên phiếu thu",
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

function fmtDayRevenue(n: number) {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  }
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("vi-VN");
}

function OfficeOrdersChart({
  report,
  loading,
}: {
  report: BusinessReport | null;
  loading: boolean;
}) {
  const rows = report?.days ?? [];
  const maxTotal = Math.max(1, ...rows.map((r) => r.sent + r.received));
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
            <div className="text-sm font-semibold">Số lượng đơn hàng</div>
            <div className="text-xs text-muted-foreground">
              Đơn gửi và đơn nhận theo ngày. Số trên cột là tổng cước đơn gửi trong ngày.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary/25" /> Đơn gửi
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Đơn nhận
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
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="relative h-72 min-w-[720px]">
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className={`h-px w-full ${i === ticks.length - 1 ? "bg-border" : "bg-border/40"}`}
                    />
                  ))}
                </div>
                <div className="relative flex h-full items-end gap-1">
                  {rows.map((r) => {
                    const total = r.sent + r.received;
                    const revenue = Number(r.revenue) || 0;
                    return (
                      <div
                        key={r.date}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                        title={`${fmt(r.date)}\nĐơn gửi: ${r.sent}\nĐơn nhận: ${r.received}\nDoanh thu: ${revenue.toLocaleString("vi-VN")} đ`}
                      >
                        <div className="mb-1 max-w-full truncate text-[10px] font-bold tabular-nums">
                          {revenue > 0 ? fmtDayRevenue(revenue) : ""}
                        </div>
                        <div
                          className="flex w-full max-w-[28px] flex-col overflow-hidden rounded-t"
                          style={{ height: total > 0 ? `${(total / yMax) * 100}%` : "0%" }}
                        >
                          <div
                            className="flex items-center justify-center bg-primary text-[10px] font-semibold text-primary-foreground"
                            style={{ height: total > 0 ? `${(r.received / total) * 100}%` : "0%" }}
                          >
                            {r.received > 0 && r.received / yMax > 0.08 ? r.received : ""}
                          </div>
                          <div
                            className="flex items-center justify-center bg-primary/25 text-[10px] font-semibold text-primary"
                            style={{ height: total > 0 ? `${(r.sent / total) * 100}%` : "0%" }}
                          >
                            {r.sent > 0 && r.sent / yMax > 0.08 ? r.sent : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex min-w-[720px] gap-1">
                {rows.map((r) => (
                  <div
                    key={r.date}
                    className="flex-1 text-center text-[10px] leading-tight text-muted-foreground"
                  >
                    {Number(r.date.slice(8, 10))}
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

function HourCount({
  n,
  onOpen,
  blankZero,
}: {
  n: number;
  onOpen: () => void;
  blankZero?: boolean;
}) {
  if (!n) return <>{blankZero ? "" : 0}</>;
  return (
    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onOpen}>
      {n}
    </button>
  );
}
