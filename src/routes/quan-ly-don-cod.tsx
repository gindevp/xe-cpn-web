import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { formatVND } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { listOrders, markCodExported } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { downloadCSV } from "@/lib/csv";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { canWrite } from "@/lib/rbac";
import { useAuth } from "@/lib/auth";
import { Banknote, Download, Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quan-ly-don-cod")({
  head: () => ({
    meta: [
      { title: "Quản lý đơn COD — X.E" },
      {
        name: "description",
        content: "Đơn giao thành công có thu hộ COD: tra cứu, xuất Excel thanh toán và theo dõi trạng thái đã xuất.",
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

function moneyCell(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatVND(n).replace(/\s*VNĐ$/i, "").trim();
}

function cuocShipping(o: OrderX) {
  const fee = Number(o.codFee ?? 0);
  const fare = Number(o.fare ?? 0);
  return Math.max(0, fare - fee);
}

function bankBlock(o: OrderX) {
  const lines = [o.bankName, o.bankAccountNo, o.bankAccountName].filter((x) => (x ?? "").trim());
  return lines.length ? lines : null;
}

const PAGE_SIZE = 20;

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
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

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
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        o.fromOffice ?? "",
        o.finalToOffice || o.toOffice || "",
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
    downloadCSV(`don-cod-${applied.from}_${applied.to}.csv`, exportColumns(rows));
  };

  const exportForPayment = async () => {
    if (!rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    setExporting(true);
    try {
      downloadCSV(`thanh-toan-cod-${applied.from}_${applied.to}.csv`, exportColumns(rows));
      if (canMark && isApiEnabled()) {
        const codes = rows.map((r) => r.code).filter(Boolean);
        await markCodExported(codes);
        setRows((prev) =>
          prev.map((r) => (codes.includes(r.code) ? { ...r, codExportedAt: new Date().toISOString() } : r)),
        );
        toast.success(`Đã xuất ${codes.length} đơn và đánh dấu Đã xuất`);
      } else {
        toast.success("Đã tải file Excel");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Xuất / đánh dấu thất bại");
    } finally {
      setExporting(false);
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

      <Section title="Bộ lọc">
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
          <div className="flex-1" />
          <Button size="sm" onClick={() => void exportForPayment()} disabled={!rows.length || exporting}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Xuất excel để thanh toán COD
          </Button>
        </div>
      </Section>

      <Section title={loading ? "Đang tải…" : `${rows.length} đơn COD đã giao`}>
        {!rows.length ? (
          <EmptyState>Không có đơn COD giao thành công trong khoảng lọc.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1100px] text-left text-sm">
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
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
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
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        {(o.fromOffice || "—").slice(0, 8)} - {(o.finalToOffice || o.toOffice || "—").slice(0, 8)}
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
                        {exported ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Đã xuất</Badge>
                        ) : (
                          <span className="text-muted-foreground">Chưa xuất</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-center gap-1 text-sm">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹
            </Button>
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
              const n = i + 1;
              return (
                <Button
                  key={n}
                  variant={n === page ? "default" : "ghost"}
                  size="sm"
                  className="min-w-8"
                  onClick={() => setPage(n)}
                >
                  {n}
                </Button>
              );
            })}
            {pageCount > 7 && <span className="px-1 text-muted-foreground">… {pageCount}</span>}
            <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              ›
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
