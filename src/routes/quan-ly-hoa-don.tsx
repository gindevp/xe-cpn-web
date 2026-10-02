import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { InvoiceBackfillButton } from "@/components/InvoiceBackfillButton";
import { collectFormLabel, formatDateTime, formatVND } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { listInvoiceRows, markInvoicesPersonal, type InvoiceRow } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { downloadExcel } from "@/lib/csv";
import { canWrite } from "@/lib/rbac";
import { useAuth } from "@/lib/auth";
import {
  INVOICE_STATE_LABEL,
  INVOICE_TYPE_LABEL,
  invoiceStateOf,
  isPastDeadline,
  type InvoiceState,
} from "@/lib/invoice-policy";
import { cn } from "@/lib/utils";
import { CheckSquare, Download, FileText, RotateCcw, Search, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quan-ly-hoa-don")({
  head: () => ({
    meta: [
      { title: "Quản lý hoá đơn — X.E" },
      {
        name: "description",
        content: "Kế toán theo dõi đơn đã / chưa xuất hoá đơn điện tử, bỏ xuất tự động, xuất bù và xuất Excel.",
      },
      { property: "og:title", content: "Quản lý hoá đơn — X.E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Quản lý hoá đơn" screen="quan-ly-hoa-don">
      <Page />
    </ProtectedPage>
  ),
});

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: isoDay(from), to: isoDay(to) };
}

function money(n?: number) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return formatVND(Number(n)).replace(/\s*VNĐ$/i, "").trim();
}

function dt(s?: string) {
  return s ? formatDateTime(s) : "";
}

const stateOf = (r: InvoiceRow) => invoiceStateOf(r.invoiceStatus, r.invoiceType);
/** Chưa từng xuất / chưa tích (gồm lần trước lỗi) → được xuất bù. */
const canBackfill = (r: InvoiceRow) => {
  const s = stateOf(r);
  return s === "NOT_ISSUED" || s === "FAILED";
};
const payerName = (r: InvoiceRow) => (r.payer === "SENDER" ? r.senderName : r.receiverName) ?? "";
const payerPhone = (r: InvoiceRow) => (r.payer === "SENDER" ? r.senderPhone : r.receiverPhone) ?? "";

const STATE_FILTERS: { value: "" | InvoiceState; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "NOT_ISSUED", label: "Chưa xuất" },
  { value: "COMPANY", label: "Đã xuất DN" },
  { value: "PERSONAL", label: "Đã xuất cá nhân" },
  { value: "MANUAL", label: "Bỏ xuất tự động" },
  { value: "FAILED", label: "Lỗi" },
];

function Page() {
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const defaults = useMemo(() => defaultRange(), []);
  const canEdit = canWrite(session?.role, "quan-ly-hoa-don");

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [range, setRange] = useState(defaults);
  const [q, setQ] = useState("");
  const [office, setOffice] = useState("");
  const [state, setState] = useState<"" | InvoiceState>("");
  const [all, setAll] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setAll([]);
      return;
    }
    setLoading(true);
    try {
      setAll(await listInvoiceRows(range.from, range.to));
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách hoá đơn");
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter((r) => {
      if (state && stateOf(r) !== state) return false;
      if (office && r.fromOfficeCode !== office && r.toOfficeCode !== office) return false;
      if (kw) {
        const hay =
          `${r.orderCode} ${r.senderName ?? ""} ${r.senderPhone ?? ""} ${r.receiverName ?? ""} ${r.receiverPhone ?? ""} ${r.invoiceTaxCode ?? ""} ${r.invoiceCompanyName ?? ""} ${r.invoiceNo ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [all, q, state, office]);

  const { pageRows, pager } = usePagedRows(rows, "quan-ly-hoa-don");

  const counts = useMemo(() => {
    const c: Record<InvoiceState, number> = { NOT_ISSUED: 0, COMPANY: 0, PERSONAL: 0, MANUAL: 0, FAILED: 0, PENDING: 0 };
    for (const r of rows) c[stateOf(r)] += 1;
    return c;
  }, [rows]);

  const selectedRows = rows.filter((r) => selected.has(r.orderCode));
  // Đơn công nợ không tự xuất: chỉ xuất khi kế toán chọn đích danh.
  const backfillTargets = selectedRows.length
    ? selectedRows.filter(canBackfill)
    : rows.filter((r) => canBackfill(r) && !r.onCredit);
  const backfillCodes = backfillTargets.map((r) => r.orderCode);
  const lateCount = backfillTargets.filter((r) => isPastDeadline(r.paidAt)).length;
  const markable = selectedRows.filter(canBackfill);
  const unmarkable = selectedRows.filter((r) => stateOf(r) === "MANUAL");

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.orderCode));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (allOnPageSelected) next.delete(r.orderCode);
        else next.add(r.orderCode);
      }
      return next;
    });

  const mark = async (list: InvoiceRow[], marked: boolean) => {
    if (!list.length) return;
    const verb = marked
      ? "BỎ XUẤT TỰ ĐỘNG (hệ thống sẽ không tự xuất / xuất bù HĐ)"
      : "Bỏ tích bỏ xuất tự động (đơn về Chưa xuất)";
    if (!window.confirm(`${verb} cho ${list.length} đơn?`)) return;
    setMarking(true);
    try {
      const res = await markInvoicesPersonal(
        list.map((r) => r.orderCode),
        marked,
      );
      const failed = Object.entries(res).filter(([, v]) => v !== "OK");
      if (failed.length) {
        toast.error(`${failed.length} đơn không cập nhật được: ${failed.slice(0, 5).map(([k, v]) => `${k} (${v})`).join("; ")}`);
      } else {
        toast.success(marked ? `Đã tích ${list.length} đơn` : `Đã bỏ tích ${list.length} đơn`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được");
    } finally {
      setMarking(false);
    }
  };

  const exportExcel = () => {
    if (!rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    const headers = [
      "Mã đơn",
      "Mốc thanh toán",
      "Hạn yêu cầu HĐ công ty",
      "HTTT",
      "Công nợ",
      "Người trả",
      "Tên người trả",
      "SĐT người trả",
      "VP gửi",
      "VP nhận",
      "Người gửi",
      "SĐT gửi",
      "Người nhận",
      "SĐT nhận",
      "Tổng tiền HĐ (gồm VAT)",
      "Trạng thái HĐ",
      "Loại HĐ",
      "Xuất muộn",
      "Số HĐ",
      "Ký hiệu",
      "Ngày xuất / tích",
      "MST",
      "Tên công ty",
      "Lỗi",
    ];
    const data = rows.map((r) => [
      r.orderCode,
      dt(r.paidAt),
      dt(r.deadlineAt),
      collectFormLabel(r.paymentTerm),
      r.onCredit ? "Có" : "",
      r.payer === "SENDER" ? "Người gửi" : "Người nhận",
      payerName(r),
      payerPhone(r),
      r.fromOfficeName ?? "",
      r.toOfficeName ?? "",
      r.senderName ?? "",
      r.senderPhone ?? "",
      r.receiverName ?? "",
      r.receiverPhone ?? "",
      Number(r.invoiceAmount ?? 0),
      INVOICE_STATE_LABEL[stateOf(r)].text,
      r.invoiceType && stateOf(r) !== "MANUAL" ? INVOICE_TYPE_LABEL[r.invoiceType] : "",
      r.late ? "Có" : "",
      r.invoiceNo ?? "",
      r.invoiceSeries ?? "",
      dt(r.invoiceIssuedAt),
      r.invoiceTaxCode ?? "",
      r.invoiceCompanyName ?? "",
      r.invoiceError ?? "",
    ]);
    downloadExcel(`hoa-don-${range.from}_${range.to}`, headers, data);
  };

  const clearFilters = () => {
    const d = defaultRange();
    setFrom(d.from);
    setTo(d.to);
    setQ("");
    setOffice("");
    setState("");
    setRange(d);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Quản lý hoá đơn</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Lọc theo mốc thanh toán: gửi trả = lúc nhập kho gửi, nhận trả / COD = lúc giao thành công. Khách phải yêu cầu HĐ
        công ty trong 3 tiếng kể từ mốc này.
      </p>

      <Section>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mã đơn, tên, SĐT, MST, số HĐ..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">VP gửi / nhận</Label>
            <SearchableSelect
              value={office || "all"}
              onValueChange={(v) => setOffice(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[{ value: "all", label: "Tất cả" }, ...offices.map((o) => ({ value: o.code, label: o.name }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trạng thái HĐ</Label>
            <SearchableSelect
              value={state || "all"}
              onValueChange={(v) => setState(v === "all" ? "" : (v as InvoiceState))}
              placeholder="Tất cả"
              options={STATE_FILTERS.map((f) => ({ value: f.value || "all", label: f.label }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Thanh toán từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Xoá bộ lọc
          </Button>
          <Button size="sm" onClick={() => setRange({ from, to })}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Tìm kiếm
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Xuất Excel
          </Button>
          <div className="flex-1" />
          {canEdit ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={marking || !markable.length}
                onClick={() => void mark(markable, true)}
              >
                <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                Bỏ xuất tự động ({markable.length})
              </Button>
              {unmarkable.length ? (
                <Button variant="outline" size="sm" disabled={marking} onClick={() => void mark(unmarkable, false)}>
                  Bỏ tích ({unmarkable.length})
                </Button>
              ) : null}
              <InvoiceBackfillButton
                orderCodes={backfillCodes}
                lateCount={lateCount}
                label={`Xuất bù HĐ ${selectedRows.length ? "đơn đã chọn" : "tất cả đơn chưa xuất"} (${backfillCodes.length})`}
                onDone={() => void load()}
              />
            </>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {(Object.keys(INVOICE_STATE_LABEL) as InvoiceState[])
            .filter((k) => counts[k] > 0)
            .map((k) => (
              <span key={k} className={cn("rounded px-1.5 py-0.5 font-medium", INVOICE_STATE_LABEL[k].cls)}>
                {INVOICE_STATE_LABEL[k].text}: {counts[k]}
              </span>
            ))}
          {canEdit ? (
            <span className="text-muted-foreground">
              Xuất bù tất cả bỏ qua đơn công nợ — muốn xuất đơn công nợ thì tích chọn đơn đó rồi bấm xuất bù.
            </span>
          ) : null}
        </div>
      </Section>

      <Section title={loading ? "Đang tải…" : `${rows.length} đơn${selected.size ? ` · đã chọn ${selected.size}` : ""}`}>
        {!rows.length ? (
          <EmptyState>{loading ? "Đang tải…" : "Không có đơn trong khoảng lọc."}</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1300px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">
                    <button type="button" onClick={togglePage} aria-label="Chọn cả trang">
                      {allOnPageSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="px-2 py-2 font-medium">Mã đơn</th>
                  <th className="px-2 py-2 font-medium">Mốc thanh toán</th>
                  <th className="px-2 py-2 font-medium">HTTT</th>
                  <th className="px-2 py-2 font-medium">Người trả</th>
                  <th className="px-2 py-2 font-medium">VP gửi → VP nhận</th>
                  <th className="px-2 py-2 text-right font-medium">Tiền HĐ</th>
                  <th className="px-2 py-2 font-medium">Trạng thái HĐ</th>
                  <th className="px-2 py-2 font-medium">Số HĐ</th>
                  <th className="px-2 py-2 font-medium">Công ty / MST</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const st = stateOf(r);
                  const label = INVOICE_STATE_LABEL[st];
                  return (
                    <tr key={r.orderCode} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-2 align-top">
                        <button type="button" onClick={() => toggle(r.orderCode)} aria-label={`Chọn ${r.orderCode}`}>
                          {selected.has(r.orderCode) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <OrderCodeLink code={r.orderCode} />
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <div>{dt(r.paidAt) || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">Hạn {dt(r.deadlineAt) || "—"}</div>
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <div>{collectFormLabel(r.paymentTerm)}</div>
                        {r.onCredit ? <div className="text-[11px] font-medium text-amber-700">Công nợ</div> : null}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div>{payerName(r) || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {payerPhone(r)} · {r.payer === "SENDER" ? "người gửi" : "người nhận"}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {r.fromOfficeName || "—"} → {r.toOfficeName || "—"}
                      </td>
                      <td className="px-2 py-2 align-top text-right tabular-nums">{money(r.invoiceAmount)}</td>
                      <td className="px-2 py-2 align-top">
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", label.cls)}>
                          {label.text}
                        </span>
                        {r.late ? (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Muộn
                          </span>
                        ) : null}
                        {r.invoiceRequested && st === "NOT_ISSUED" ? (
                          <div className="mt-0.5 text-[11px] text-sky-700">Có yêu cầu HĐ công ty</div>
                        ) : null}
                        {st === "FAILED" && r.invoiceError ? (
                          <div className="mt-0.5 max-w-[220px] text-[11px] text-red-700">{r.invoiceError}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap text-xs">
                        <div>{r.invoiceNo || "—"}</div>
                        {r.invoiceIssuedAt ? (
                          <div className="text-muted-foreground">{dt(r.invoiceIssuedAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        <div>{r.invoiceCompanyName || "—"}</div>
                        <div className="text-muted-foreground">{r.invoiceTaxCode}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination pager={pager} />
      </Section>
    </div>
  );
}
