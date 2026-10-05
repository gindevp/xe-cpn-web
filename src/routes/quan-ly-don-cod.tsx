import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { formatVND, officeName, receiverOfficeName } from "@/lib/mock-data";
import { orderGoodsFare } from "@/lib/package-label";
import { useStore, type OrderX } from "@/lib/store";
import { fetchCodPaymentRequest, listOrders, markCodExported } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { downloadExcelRows } from "@/lib/csv";
import { downloadBlob, guestBillPayLabel, printImageBlob, renderGuestBillPng } from "@/lib/guest-bill-image";
import { Checkbox } from "@/components/ui/checkbox";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { canWrite } from "@/lib/rbac";
import { useAuth } from "@/lib/auth";
import {
  Banknote,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
  Search,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quan-ly-don-cod")({
  head: () => ({
    meta: [
      { title: "Quản lý đơn COD — X.E" },
      {
        name: "description",
        content: "Đơn giao thành công có thu hộ COD: tra cứu, xuất Excel và xác nhận đã xử lý.",
      },
      { property: "og:title", content: "Quản lý đơn COD — X.E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Quản lý đơn COD" screen="quan-ly-don-cod">
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

function processedAt(iso?: string) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function moneyCell(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatVND(n).replace(/\s*VNĐ$/i, "").trim();
}

/** Cước vận chuyển = cước hàng (không gồm phí thu hộ — phí đó là cột riêng). Đơn cũ chưa tách thì vẫn là fare. */
function cuocShipping(o: OrderX) {
  return orderGoodsFare(o);
}

function bankBlock(o: OrderX) {
  const lines = [o.bankName, o.bankAccountNo, o.bankAccountName].filter((x) => (x ?? "").trim());
  return lines.length ? lines : null;
}

function Page() {
  const { session } = useAuth();
  const trips = useStore((s) => s.trips);
  const { branchNames, itinerariesForBranchName } = useBranchItineraryMaster();
  const defaults = useMemo(() => defaultRange(), []);

  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [applied, setApplied] = useState({
    q: "",
    route: "",
    itinerary: "",
    from: defaults.from,
    to: defaults.to,
  });
  const [rows, setRows] = useState<OrderX[]>([]);
  const [loading, setLoading] = useState(false);
  const { pageRows, pager } = usePagedRows(rows, "quan-ly-don-cod");
  const setPage = pager.setPage;
  const [confirmTarget, setConfirmTarget] = useState<OrderX | null>(null);
  const [markingCode, setMarkingCode] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [docBusy, setDocBusy] = useState<string | null>(null);

  const canMark = canWrite(session?.role, "quan-ly-don-cod");

  const tripByCode = useMemo(() => {
    const m = new Map<string, { bks?: string; driver?: string }>();
    for (const t of trips) m.set(t.code, { bks: t.bks, driver: t.driver });
    return m;
  }, [trips]);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listOrders({
        status: "DELIVERED",
        paymentTerm: "COD",
        keyword: applied.q || undefined,
        createdFrom: applied.from || undefined,
        createdTo: applied.to || undefined,
        routeLabel: applied.route || undefined,
        itineraryLabel: applied.itinerary || undefined,
        size: 500,
        sort: "createdAt,desc",
      });
      setRows(list.filter((o) => o.collectForm === "COD" || (o.codAmount ?? 0) > 0));
      setPage(1);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được danh sách COD");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, setPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const tripInfo = (o: OrderX) => {
    const code = o.tripCode ?? [...(o.legs ?? [])].reverse().find((l) => l.tripCode)?.tripCode;
    const fromApi = { plate: o.vehiclePlate, driver: o.driverName };
    const fromStore = code ? tripByCode.get(code) : undefined;
    return {
      plate: fromApi.plate || fromStore?.bks || "",
      driver: fromApi.driver || fromStore?.driver || "",
      code,
    };
  };

  const exportColumns = (list: OrderX[]) => [
    [
      "Mã đơn",
      "Người gửi",
      "SĐT gửi",
      "Người nhận",
      "SĐT nhận",
      "VP gửi",
      "VP nhận",
      "BKS",
      "Tài xế",
      "Cước",
      "COD",
      "Phí thu hộ",
      "Ngân hàng",
      "Số TK",
      "Chủ TK",
    ],
    ...list.map((o) => {
      const t = tripInfo(o);
      return [
        o.code,
        o.senderName ?? "",
        o.senderPhone ?? "",
        o.receiverName ?? "",
        o.receiverPhone ?? "",
        officeName(o.fromOffice) || "",
        receiverOfficeName(o) || "",
        t.plate,
        t.driver,
        cuocShipping(o),
        o.codAmount ?? 0,
        o.codFee ?? 0,
        o.bankName ?? "",
        o.bankAccountNo ?? "",
        o.bankAccountName ?? "",
      ];
    }),
  ];

  const exportPlain = () => {
    if (!rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    downloadExcelRows(`don-cod-${applied.from}_${applied.to}`, exportColumns(rows), "DonCOD");
  };

  const markProcessed = async (order: OrderX) => {
    if (!canMark || markingCode) return;
    setMarkingCode(order.code);
    try {
      const res = await markCodExported([order.code]);
      if (!res?.updated) {
        toast.error(`Không xác nhận được ${order.code} (đơn không còn là đơn COD đã giao)`);
        return;
      }
      const at = new Date().toISOString();
      const by = session?.username;
      setRows((prev) =>
        prev.map((r) =>
          r.code === order.code ? { ...r, codExportedAt: at, codExportedBy: by, codExportedByName: undefined } : r,
        ),
      );
      toast.success(`Đã xác nhận xử lý COD đơn ${order.code}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Xác nhận thất bại");
    } finally {
      setMarkingCode(null);
    }
  };

  const printReceipt = async (order: OrderX) => {
    if (docBusy) return;
    setDocBusy(`bill:${order.code}`);
    try {
      const png = await renderGuestBillPng(order, guestBillPayLabel(order));
      await printImageBlob(png, `Biên nhận ${order.code}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không in được biên nhận");
    } finally {
      setDocBusy(null);
    }
  };

  const downloadPaymentRequest = async (order: OrderX) => {
    if (docBusy) return;
    setDocBusy(`dntt:${order.code}`);
    try {
      const blob = await fetchCodPaymentRequest(order.code);
      downloadBlob(blob, `de-nghi-thanh-toan-cod-${order.code}.xlsx`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tạo được giấy đề nghị thanh toán");
    } finally {
      setDocBusy(null);
    }
  };

  const clearFilters = () => {
    const d = defaultRange();
    setQ("");
    setRoute("");
    setItinerary("");
    setFrom(d.from);
    setTo(d.to);
    setApplied({ q: "", route: "", itinerary: "", from: d.from, to: d.to });
  };

  const itineraryOpts = route ? itinerariesForBranchName(route) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Quản lý đơn COD</h1>
      </div>

      <Section>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-1">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mã đơn, tên KH, SĐT..."
              onKeyDown={(e) => {
                if (e.key === "Enter") setApplied({ q, route, itinerary, from, to });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tuyến</Label>
            <SearchableSelect
              value={route}
              onValueChange={(v) => {
                setRoute(v);
                setItinerary("");
              }}
              placeholder="Tất cả"
              options={[{ value: "", label: "Tất cả" }, ...branchNames.map((r) => ({ value: r, label: r }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Lộ trình</Label>
            <SearchableSelect
              value={itinerary}
              onValueChange={setItinerary}
              placeholder="Tất cả"
              options={[{ value: "", label: "Tất cả" }, ...itineraryOpts.map((it) => ({ value: it, label: it }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
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
          <Button size="sm" onClick={() => setApplied({ q, route, itinerary, from, to })}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Tìm kiếm
          </Button>
          <Button variant="outline" size="sm" onClick={exportPlain} disabled={!rows.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Xuất excel
          </Button>
        </div>
      </Section>

      <Section title={loading ? "Đang tải…" : `${rows.length} đơn COD đã giao`}>
        {!rows.length ? (
          <EmptyState>Không có đơn COD giao thành công trong khoảng lọc.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1260px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Mã đơn</th>
                  <th className="px-3 py-2 font-medium">Người gửi</th>
                  <th className="px-3 py-2 font-medium">Người nhận</th>
                  <th className="px-3 py-2 font-medium">VP gửi - VP nhận</th>
                  <th className="px-3 py-2 font-medium">Chuyến</th>
                  <th className="px-3 py-2 font-medium text-right">Cước</th>
                  <th className="px-3 py-2 font-medium text-right">COD</th>
                  <th className="px-3 py-2 font-medium text-right">Phí thu hộ</th>
                  <th className="px-3 py-2 font-medium">Thông tin tài khoản nhận COD</th>
                  <th className="px-3 py-2 font-medium">Chứng từ</th>
                  <th className="px-3 py-2 font-medium">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const t = tripInfo(o);
                  const bank = bankBlock(o);
                  const exported = Boolean(o.codExportedAt);
                  return (
                    <tr key={o.code} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top">
                        <OrderCodeLink code={o.code} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{o.senderName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{o.senderPhone}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{o.receiverName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{o.receiverPhone}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <OfficeRouteCell order={o} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {t.plate || t.driver ? (
                          <>
                            <div>{t.plate || "—"}</div>
                            <div className="text-xs text-muted-foreground">{t.driver || "—"}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{moneyCell(cuocShipping(o))}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{moneyCell(o.codAmount)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{moneyCell(o.codFee)}</td>
                      <td className="px-3 py-2 align-top text-xs leading-relaxed">
                        {bank ? (
                          bank.map((line) => <div key={line}>{line}</div>)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 justify-start gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={!!docBusy}
                            onClick={() => void printReceipt(o)}
                          >
                            {docBusy === `bill:${o.code}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            In biên nhận
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 justify-start gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={!!docBusy}
                            onClick={() => void downloadPaymentRequest(o)}
                          >
                            {docBusy === `dntt:${o.code}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                            )}
                            Đề nghị thanh toán
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {exported ? (
                          <div className="space-y-0.5">
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Đã xử lý</Badge>
                            {o.codExportedByName || o.codExportedBy ? (
                              <div className="text-xs">
                                bởi {o.codExportedByName || o.codExportedBy}
                                {o.codExportedByName && o.codExportedBy ? (
                                  <span className="text-muted-foreground"> ({o.codExportedBy})</span>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="text-xs text-muted-foreground">lúc {processedAt(o.codExportedAt)}</div>
                          </div>
                        ) : canMark ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={markingCode === o.code}
                            onClick={() => setConfirmTarget(o)}
                          >
                            {markingCode === o.code ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Xác nhận đã xử lý
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">Chưa xử lý</span>
                        )}
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

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmChecked(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận đã xử lý COD?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                {confirmTarget ? (
                  <>
                    <div>
                      Đơn <b>{confirmTarget.code}</b> · COD <b>{moneyCell(confirmTarget.codAmount)}</b>
                    </div>
                    <div>
                      Người gửi: {confirmTarget.senderName || "—"} {confirmTarget.senderPhone ? `- ${confirmTarget.senderPhone}` : ""}
                    </div>
                    <div>
                      Tài khoản nhận:{" "}
                      {[confirmTarget.bankName, confirmTarget.bankAccountNo, confirmTarget.bankAccountName]
                        .filter(Boolean)
                        .join(" - ") || "—"}
                    </div>
                    <div className="text-muted-foreground">
                      Sau khi xác nhận sẽ ghi lại người thao tác và thời điểm; không hoàn tác trên màn này.
                    </div>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
            <Checkbox
              checked={confirmChecked}
              onCheckedChange={(v) => setConfirmChecked(v === true)}
              className="mt-0.5"
            />
            <span>Tôi xác nhận đã chuyển/trả đủ tiền COD cho người gửi.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmChecked}
              onClick={() => {
                setConfirmChecked(false);
                const target = confirmTarget;
                setConfirmTarget(null);
                if (target) void markProcessed(target);
              }}
            >
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
