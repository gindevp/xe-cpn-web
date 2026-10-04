import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { EmptyState, Section } from "@/components/PageBits";
import { StageTabButton, StageTabRow } from "@/components/StageTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { downloadExcelSheets } from "@/lib/csv";
import { getVehicleEventReport, type VehicleEventReportItem } from "@/lib/api/vehicle-events-api";
import { cn } from "@/lib/utils";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-gio-xe")({
  head: () => ({
    meta: [
      { title: "Báo giờ xe đến/đi — X.E" },
      { name: "description", content: "Theo dõi giờ xe thực tế rời và đến văn phòng do nhân viên báo trên app." },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo giờ xe đến/đi" screen="bao-gio-xe">
      <Page />
    </ProtectedPage>
  ),
});

const VN_TZ = "Asia/Ho_Chi_Minh";
const ALL = "";
/** Rời VP trễ hơn giờ xuất bến quá ngưỡng này mới tô đỏ. */
const LATE_MINUTES = 5;
/** Dừng tại VP quá ngưỡng này thì app bắt nhập lý do khi báo rời. */
const MAX_DWELL_MINUTES = 5;

type Tab = "CHUYEN" | "NHAT_KY";
type TypeFilter = "" | "DEPART" | "ARRIVE";
type Ev = VehicleEventReportItem;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", hour12: false });

function dayOf(iso: string) {
  return dayFmt.format(new Date(iso));
}

function timeOf(iso?: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : "";
}

function viDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function dayTime(iso?: string | null) {
  return iso ? `${timeOf(iso)} ${viDay(dayOf(iso)).slice(0, 5)}` : "";
}

function today() {
  return dayFmt.format(new Date());
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

function minutesBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 60000);
}

function fmtDuration(min: number | null) {
  if (min == null || min < 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} phút`;
}

/** Chênh giờ rời VP so với giờ xuất bến kế hoạch. */
function delayText(e: Ev): string {
  if (e.eventType !== "DEPART") return "";
  const d = minutesBetween(e.plannedDepartAt, e.eventAt);
  if (d == null) return "";
  if (Math.abs(d) <= LATE_MINUTES) return "Đúng giờ";
  return d > 0 ? `Trễ ${d} phút` : `Sớm ${-d} phút`;
}

function tripLabel(e: Ev) {
  return e.tripCode || (e.source === "CRM" ? "Limousine" : e.tripKey);
}

function reporter(e: Ev) {
  return e.reportedByName || e.reportedBy || "";
}

function routeKey(s?: string | null) {
  return (s ?? "").normalize("NFC").replace(/\s+/g, "").toUpperCase();
}

function matches(e: Ev, q: string, route = "") {
  if (route && routeKey(e.routeLabel) !== route) return false;
  if (!q) return true;
  return [e.vehiclePlate, e.tripCode, e.externalTripId, e.driverName, e.routeLabel]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().includes(q));
}

function TypeBadge({ type }: { type: Ev["eventType"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
        type === "DEPART"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {type === "DEPART" ? "Rời VP" : "Đến VP"}
    </span>
  );
}

function DelayCell({ e }: { e: Ev }) {
  const t = delayText(e);
  if (!t) return <span className="text-muted-foreground">—</span>;
  return <span className={cn(t.startsWith("Trễ") ? "font-medium text-destructive" : "text-muted-foreground")}>{t}</span>;
}

function Page() {
  const offices = useStore((s) => s.offices);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [office, setOffice] = useState(ALL);
  const [type, setType] = useState<TypeFilter>("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("CHUYEN");
  const [route, setRoute] = useState("");
  const [officeItineraries, setOfficeItineraries] = useState<{ code: string; name: string }[]>([]);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [loaded, setLoaded] = useState<{ from: string; to: string; office: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (range?: { from: string; to: string }) => {
      const f = range?.from ?? from;
      const t = range?.to ?? to;
      if (!f || !t || t < f) {
        toast.error("Khoảng ngày không hợp lệ");
        return;
      }
      setLoading(true);
      try {
        const r = await getVehicleEventReport({ from: f, to: t, officeCode: office || undefined });
        setEvents(r.events);
        setOfficeItineraries(r.itineraries ?? []);
        setLoaded({ from: f, to: t, office });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu báo giờ xe");
      } finally {
        setLoading(false);
      }
    },
    [from, to, office],
  );

  useEffect(() => {
    void load();
    // Chỉ tải lần đầu — sau đó bấm "Xem".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quick = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    void load({ from: f, to: t });
  };

  const q = search.trim().toLowerCase();

  /** VP đang xem: lộ trình VP báo giờ (theo cấu hình Danh mục VP); toàn hệ thống: lộ trình có trong dữ liệu. */
  const routeOptions = useMemo(() => {
    const names = officeItineraries.length
      ? officeItineraries.map((it) => it.name)
      : [...new Set((events ?? []).map((e) => e.routeLabel?.trim()).filter((v): v is string => !!v))];
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "vi")).map((n) => ({ value: routeKey(n), label: n }));
  }, [officeItineraries, events]);

  useEffect(() => {
    if (route && !routeOptions.some((o) => o.value === route)) setRoute("");
  }, [route, routeOptions]);

  const logRows = useMemo(() => {
    if (!events || !loaded) return [];
    return events
      .filter((e) => {
        const d = dayOf(e.eventAt);
        return (
          d >= loaded.from &&
          d <= loaded.to &&
          (!loaded.office || e.officeCode === loaded.office) &&
          (!type || e.eventType === type) &&
          matches(e, q, route)
        );
      })
      .sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  }, [events, loaded, type, q, route]);

  /** Mỗi xe tại mỗi VP một dòng: giờ đến → giờ rời VP đó. */
  const tripRows = useMemo(() => {
    if (!events || !loaded) return [];
    const groups = new Map<string, Ev[]>();
    for (const e of events) {
      const d = dayOf(e.eventAt);
      if (d < loaded.from || d > loaded.to) continue;
      if (loaded.office && e.officeCode !== loaded.office) continue;
      const k = `${e.officeCode}|${e.tripKey}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const out = [...groups.entries()].map(([key, list]) => {
      const arrive = list.find((e) => e.eventType === "ARRIVE");
      const depart = list.find((e) => e.eventType === "DEPART");
      const head = list.find((e) => e.plannedDepartAt) ?? list[0];
      return {
        key,
        head,
        arrive,
        depart,
        dwell: minutesBetween(arrive?.eventAt, depart?.eventAt),
        sortAt: arrive?.eventAt ?? head.plannedDepartAt ?? list[0].eventAt,
      };
    });
    return out
      .filter((t) => {
        if (type === "DEPART" && !t.depart) return false;
        if (type === "ARRIVE" && !t.arrive) return false;
        return matches(t.head, q, route);
      })
      .sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [events, loaded, type, q, route]);
  const tripPage = usePagedRows(tripRows, "bao-gio-xe.trips");
  const logPage = usePagedRows(logRows, "bao-gio-xe.logs");

  const exportExcel = () => {
    if (!loaded) return;
    const scope = loaded.office || "toan-he-thong";
    downloadExcelSheets(`bao-gio-xe_${scope}_${loaded.from}_${loaded.to}`, [
      {
        name: "Theo xe tại VP",
        headers: [
          "STT",
          "Ngày",
          "Văn phòng",
          "Biển số",
          "Tài xế",
          "Tuyến",
          "Giờ xuất bến KH",
          "Giờ đến VP",
          "Người báo đến",
          "Giờ rời VP",
          "Người báo rời",
          "Thời gian dừng",
          "Lý do dừng lâu",
        ],
        rows: tripRows.map((t, i) => [
          i + 1,
          viDay(dayOf(t.sortAt)),
          t.head.officeName,
          t.head.vehiclePlate ?? "",
          t.head.driverName ?? "",
          t.head.routeLabel ?? "",
          dayTime(t.head.plannedDepartAt),
          dayTime(t.arrive?.eventAt),
          t.arrive ? reporter(t.arrive) : "",
          dayTime(t.depart?.eventAt),
          t.depart ? reporter(t.depart) : "",
          fmtDuration(t.dwell),
          t.depart?.reason ?? "",
        ]),
      },
      {
        name: "Nhật ký báo",
        headers: [
          "STT",
          "Ngày",
          "Giờ báo",
          "Văn phòng",
          "Loại",
          "Chuyến",
          "Biển số",
          "Tài xế",
          "Tuyến",
          "Giờ xuất bến KH",
          "Chênh giờ",
          "Người báo",
          "Lý do dừng lâu",
        ],
        rows: logRows.map((e, i) => [
          i + 1,
          viDay(dayOf(e.eventAt)),
          timeOf(e.eventAt),
          e.officeName,
          e.eventType === "DEPART" ? "Rời VP" : "Đến VP",
          tripLabel(e),
          e.vehiclePlate ?? "",
          e.driverName ?? "",
          e.routeLabel ?? "",
          dayTime(e.plannedDepartAt),
          delayText(e),
          reporter(e),
          e.reason ?? "",
        ]),
      },
    ]);
  };

  const departCount = logRows.filter((e) => e.eventType === "DEPART").length;
  const arriveCount = logRows.length - departCount;
  const lateCount = logRows.filter((e) => delayText(e).startsWith("Trễ")).length;

  return (
    <div className="space-y-4">
      <Section>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
              value={office}
              onValueChange={setOffice}
              options={[
                { value: ALL, label: "Toàn hệ thống" },
                ...[...offices]
                  .sort((a, b) => a.name.localeCompare(b.name, "vi"))
                  .map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Lộ trình</Label>
            <SearchableSelect
              value={route}
              onValueChange={setRoute}
              options={[{ value: "", label: "Tất cả lộ trình" }, ...routeOptions]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Loại</Label>
            <SearchableSelect
              value={type}
              onValueChange={(v) => setType(v as TypeFilter)}
              options={[
                { value: "", label: "Xe đến & xe rời" },
                { value: "DEPART", label: "Xe rời VP" },
                { value: "ARRIVE", label: "Xe đến VP" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tìm</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Biển số, chuyến, tài xế, tuyến" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {loaded
              ? `${tripRows.length} lượt xe · ${arriveCount} lượt đến · ${departCount} lượt rời${lateCount ? ` · ${lateCount} lượt rời trễ` : ""}`
              : loading
                ? "Đang tải…"
                : "Chưa có dữ liệu"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => quick(today(), today())} disabled={loading}>
              Hôm nay
            </Button>
            <Button variant="outline" size="sm" onClick={() => quick(monthStart(today()), today())} disabled={loading}>
              Tháng này
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-4 w-4" /> Xem
            </Button>
            <Button size="sm" className="gap-2" onClick={exportExcel} disabled={!loaded || (!tripRows.length && !logRows.length)}>
              <Download className="h-4 w-4" /> Xuất Excel
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Giờ do nhân viên báo trên app (Báo cáo giờ xe đến/đi). Chênh giờ rời so với giờ xuất bến kế hoạch; trễ quá{" "}
          {LATE_MINUTES} phút tô đỏ. Tab Theo xe tại VP ghép giờ đến và giờ rời của cùng một xe tại từng văn phòng; xe dừng
          quá {MAX_DWELL_MINUTES} phút tô đỏ và phải có lý do khi báo rời.
        </p>
      </Section>

      <StageTabRow className="gap-2.5 md:gap-3">
        <StageTabButton active={tab === "CHUYEN"} onClick={() => setTab("CHUYEN")}>
          Theo xe tại VP
        </StageTabButton>
        <StageTabButton active={tab === "NHAT_KY"} onClick={() => setTab("NHAT_KY")}>
          Nhật ký báo
        </StageTabButton>
      </StageTabRow>

      {tab === "CHUYEN" ? (
        <Section title={`Theo xe tại VP (${tripRows.length})`}>
          {tripRows.length === 0 ? (
            <EmptyState>{loading ? "Đang tải…" : "Chưa có xe nào được báo giờ"}</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Văn phòng</th>
                    <th className="px-2 py-2">Xe / tài xế</th>
                    <th className="px-2 py-2">Tuyến</th>
                    <th className="px-2 py-2">Xuất bến KH</th>
                    <th className="px-2 py-2">Giờ đến VP</th>
                    <th className="px-2 py-2">Giờ rời VP</th>
                    <th className="px-2 py-2 text-right">Thời gian dừng</th>
                  </tr>
                </thead>
                <tbody>
                  {tripPage.pageRows.map((t) => (
                    <tr key={t.key} className="border-b align-top hover:bg-muted/40">
                      <td className="px-2 py-2 text-muted-foreground">{t.head.officeName}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{t.head.vehiclePlate || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{t.head.driverName || ""}</div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{t.head.routeLabel || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{dayTime(t.head.plannedDepartAt) || "—"}</td>
                      <td className="px-2 py-2">
                        {t.arrive ? (
                          <div className="whitespace-nowrap">
                            <span className="tabular-nums font-medium">{dayTime(t.arrive.eventAt)}</span>
                            <div className="text-[11px] text-muted-foreground">{reporter(t.arrive)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Chưa báo đến</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {t.depart ? (
                          <div className="whitespace-nowrap">
                            <span className="tabular-nums font-medium">{dayTime(t.depart.eventAt)}</span>
                            <div className="text-[11px] text-muted-foreground">{reporter(t.depart)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Chưa báo rời</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={cn(
                            "tabular-nums",
                            t.dwell != null && t.dwell > MAX_DWELL_MINUTES && "font-medium text-destructive",
                          )}
                        >
                          {fmtDuration(t.dwell) || "—"}
                        </span>
                        {t.depart?.reason ? (
                          <div className="ml-auto max-w-[16rem] text-[11px] text-amber-800">Lý do: {t.depart.reason}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination pager={tripPage.pager} />
            </div>
          )}
        </Section>
      ) : (
        <Section title={`Nhật ký báo (${logRows.length})`}>
          {logRows.length === 0 ? (
            <EmptyState>{loading ? "Đang tải…" : "Chưa có lượt báo nào"}</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Giờ báo</th>
                    <th className="px-2 py-2">Văn phòng</th>
                    <th className="px-2 py-2">Loại</th>
                    <th className="px-2 py-2">Chuyến</th>
                    <th className="px-2 py-2">Xe / tài xế</th>
                    <th className="px-2 py-2">Tuyến</th>
                    <th className="px-2 py-2">Xuất bến KH</th>
                    <th className="px-2 py-2">Chênh giờ</th>
                    <th className="px-2 py-2">Người báo</th>
                  </tr>
                </thead>
                <tbody>
                  {logPage.pageRows.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums font-medium">{dayTime(e.eventAt)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{e.officeName}</td>
                      <td className="px-2 py-2">
                        <TypeBadge type={e.eventType} />
                      </td>
                      <td className="px-2 py-2">{tripLabel(e)}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{e.vehiclePlate || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{e.driverName || ""}</div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{e.routeLabel || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{dayTime(e.plannedDepartAt) || "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        <div className="whitespace-nowrap">
                          <DelayCell e={e} />
                        </div>
                        {e.reason ? <div className="max-w-[16rem] text-[11px] text-amber-800">Lý do dừng: {e.reason}</div> : null}
                      </td>
                      <td className="px-2 py-2 text-xs">{reporter(e) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination pager={logPage.pager} />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
