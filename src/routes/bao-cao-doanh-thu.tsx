import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { EmptyState } from "@/components/PageBits";
import { TablePagination } from "@/components/TablePagination";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { usePagedRows } from "@/lib/use-paged-rows";
import { isApiEnabled } from "@/lib/api/client";
import {
  getRevenueReport,
  type RevenueKind,
  type RevenueReport,
  type RevenueRow,
} from "@/lib/api/revenue-api";
import { assignedOfficeCode, hasAllOfficeScope } from "@/lib/office-scope";
import { downloadExcel } from "@/lib/csv";
import { Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-cao-doanh-thu")({
  head: () => ({
    meta: [
      { title: "Báo cáo doanh thu — X.E" },
      {
        name: "description",
        content: "Doanh thu theo đơn: tiền thu ở văn phòng nào tính doanh thu cho văn phòng đó.",
      },
      { property: "og:title", content: "Báo cáo doanh thu — X.E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo cáo doanh thu" screen="bao-cao-doanh-thu">
      <Page />
    </ProtectedPage>
  ),
});

const KIND_OPTIONS: { value: RevenueKind; label: string }[] = [
  { value: "ALL", label: "Tất cả" },
  { value: "BACKLOG", label: "Đơn tồn" },
  { value: "DELIVERED", label: "Đơn giao thành công" },
];

const MONEY_COLS: { key: keyof RevenueReport["totals"]; label: string }[] = [
  { key: "goodsFare", label: "Cước giao hàng" },
  { key: "deliveryFee", label: "Cước giao hàng tận nơi" },
  { key: "pickupFee", label: "Phí lấy hàng" },
  { key: "codFee", label: "Phí thu hộ COD" },
  { key: "declaredFee", label: "Phí KBGT" },
  { key: "discount", label: "Giảm giá" },
  { key: "total", label: "Tổng doanh thu" },
];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function vnDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function money(n?: number) {
  return `${Math.round(Number(n ?? 0)).toLocaleString("vi-VN")} đ`;
}

const sideLabel = (r: RevenueRow) => (r.side === "SENDER" ? "Thu đầu gửi" : "Thu lúc giao");

function Page() {
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const allScope = hasAllOfficeScope(session);
  const ownOffice = assignedOfficeCode(session?.office);
  const today = useMemo(() => isoDay(new Date()), []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [office, setOffice] = useState(allScope ? "" : ownOffice);
  const [kind, setKind] = useState<RevenueKind>("ALL");
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isApiEnabled() || !from || !to) return;
    let alive = true;
    setLoading(true);
    getRevenueReport({ from, to, officeCode: office || undefined, kind })
      .then((r) => alive && setReport(r))
      .catch((e) => {
        if (!alive) return;
        toast.error(e instanceof Error ? e.message : "Không tải được báo cáo doanh thu");
        setReport(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to, office, kind]);

  const rows = report?.rows ?? [];
  const { pageRows, pager } = usePagedRows(rows, "bao-cao-doanh-thu");
  const firstIndex = rows.indexOf(pageRows[0]);

  const exportExcel = () => {
    if (!report || !rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    const headers = [
      "STT",
      "Mã đơn",
      "Ngày tạo",
      "Văn phòng",
      "Thu tại",
      ...MONEY_COLS.map((c) => c.label),
    ];
    const data = rows.map((r, i) => [
      i + 1,
      r.orderCode,
      vnDate(r.createdAt),
      r.officeName,
      sideLabel(r),
      ...MONEY_COLS.map((c) => Number(r[c.key] ?? 0)),
    ]);
    data.push([
      "",
      "Tổng",
      "",
      "",
      "",
      ...MONEY_COLS.map((c) => Number(report.totals[c.key] ?? 0)),
    ]);
    downloadExcel(`bao-cao-doanh-thu-${from}_${to}${office ? `-${office}` : ""}`, headers, data);
  };

  const officeOptions = allScope
    ? [
        { value: "all", label: "Tất cả VP" },
        ...offices.map((o) => ({ value: o.code, label: o.name })),
      ]
    : offices.filter((o) => o.code === ownOffice).map((o) => ({ value: o.code, label: o.name }));

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Báo cáo doanh thu</h1>
          <p className="text-xs text-muted-foreground">Doanh thu theo đơn</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Xuất Excel
        </Button>
      </div>

      <div className="grid gap-3 px-4 pb-3 sm:grid-cols-2 lg:grid-cols-[160px_160px_220px_220px]">
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Văn phòng</Label>
          <SearchableSelect
            value={office || "all"}
            onValueChange={(v) => setOffice(v === "all" ? "" : v)}
            disabled={!allScope}
            placeholder="Tất cả VP"
            options={officeOptions}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Loại đơn</Label>
          <SearchableSelect
            value={kind}
            onValueChange={(v) => setKind(v as RevenueKind)}
            placeholder="Tất cả"
            options={KIND_OPTIONS}
          />
        </div>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted-foreground">
        Lọc theo ngày tạo đơn. Tiền thu ở VP nào tính doanh thu cho VP đó: thu đầu gửi tính cho VP
        gửi, thu lúc giao tính cho VP nhận — đơn thu ở cả hai nơi hiện ở cả 2 VP, mỗi VP phần mình
        thu. Đơn chưa thu tiền chưa có doanh thu. Không gồm tiền thu hộ COD, đơn huỷ, đơn hoàn.
      </p>

      {!rows.length ? (
        <div className="px-4 pb-4">
          <EmptyState>{loading ? "Đang tải…" : "Không có doanh thu trong khoảng lọc."}</EmptyState>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">STT</th>
                  <th className="px-3 py-2.5 text-left font-medium">Mã đơn</th>
                  <th className="px-3 py-2.5 text-left font-medium">Ngày tạo</th>
                  <th className="px-3 py-2.5 text-left font-medium">Văn phòng</th>
                  {MONEY_COLS.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 text-right font-medium last:pr-4">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={`${r.orderCode}-${r.side}`} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground">{firstIndex + i + 1}</td>
                    <td className="px-3 py-2.5 font-semibold">
                      <OrderCodeLink code={r.orderCode} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{vnDate(r.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div>{r.officeName}</div>
                      <div className="text-[11px] text-muted-foreground">{sideLabel(r)}</div>
                    </td>
                    {MONEY_COLS.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2.5 text-right tabular-nums last:pr-4 ${c.key === "total" ? "font-semibold" : ""}`}
                      >
                        {c.key === "discount" && r.discount > 0
                          ? `−${money(r.discount)}`
                          : money(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {report ? (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="px-4 py-2.5" colSpan={4}>
                      Tổng · {rows.length} dòng
                    </td>
                    {MONEY_COLS.map((c) => (
                      <td key={c.key} className="px-3 py-2.5 text-right tabular-nums last:pr-4">
                        {c.key === "discount" && report.totals.discount > 0
                          ? `−${money(report.totals.discount)}`
                          : money(report.totals[c.key])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <div className="px-4 pb-3">
            <TablePagination pager={pager} />
          </div>
        </>
      )}
    </div>
  );
}
