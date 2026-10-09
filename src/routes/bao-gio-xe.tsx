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
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { downloadExcelSheets } from "@/lib/csv";
import { getVehicleEventPhoto, getVehicleEventReport, getVehiclePhotoPolicy, saveVehiclePhotoPolicy, type ItineraryOption, type VehicleEventReportItem } from "@/lib/api/vehicle-events-api";
import { VehicleTimesMark } from "@/components/VehicleTimesMark";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useStore } from "@/lib/store";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";
import { Switch } from "@/components/ui/switch";
import { ImageLightbox } from "@/components/ImageLightbox";
import { cn } from "@/lib/utils";
import { Camera, Download, RefreshCw } from "lucide-react";
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
/** Rời VP trễ hơn giờ đón từ ngần này phút là MUỘN (app bắt nhập lý do). */
const LATE_MINUTES = 5;

type Tab = "CHAM" | "CHUYEN" | "NHAT_KY";
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

/** Giờ đón tại VP (giờ xuất bến ± phút lệch lộ trình); bản ghi cũ chưa có thì lấy giờ xuất bến. */
function pickupOf(e?: Ev | null) {
  return e ? e.pickupAt || e.plannedDepartAt || null : null;
}

/** Phút lệch giờ rời thực tế so với giờ đón (âm = sớm), làm tròn về 0 như BE. */
function deviationOf(e?: Ev | null): number | null {
  if (!e || e.eventType !== "DEPART") return null;
  const p = pickupOf(e);
  if (!p) return null;
  return Math.trunc((Date.parse(e.eventAt) - Date.parse(p)) / 60000);
}

type Punctuality = "SOM" | "DUNG" | "MUON";

function punctualityOf(d: number | null): Punctuality | null {
  if (d == null) return null;
  if (d < 0) return "SOM";
  return d >= LATE_MINUTES ? "MUON" : "DUNG";
}

const PUNCTUALITY_LABEL: Record<Punctuality, string> = { SOM: "SỚM", DUNG: "ĐÚNG GIỜ", MUON: "MUỘN" };

function fmtMinutes(min: number) {
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} phút`;
}

/** "MUỘN 7 phút" / "SỚM 3 phút" / "ĐÚNG GIỜ (2 phút)". */
function delayText(e?: Ev | null): string {
  const d = deviationOf(e);
  const p = punctualityOf(d);
  if (d == null || !p) return "";
  if (p === "DUNG") return d ? `${PUNCTUALITY_LABEL.DUNG} (${fmtMinutes(d)})` : PUNCTUALITY_LABEL.DUNG;
  return `${PUNCTUALITY_LABEL[p]} ${fmtMinutes(d)}`;
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

function matches(e: Ev, q: string, route = "", branchRoutes: Set<string> | null = null) {
  if (route && routeKey(e.routeLabel) !== route) return false;
  if (branchRoutes && !branchRoutes.has(routeKey(e.routeLabel))) return false;
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

function DelayCell({ e }: { e?: Ev | null }) {
  const d = deviationOf(e);
  const p = punctualityOf(d);
  if (d == null || !p) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          p === "MUON" && "border-red-200 bg-red-50 text-red-700",
          p === "SOM" && "border-sky-200 bg-sky-50 text-sky-800",
          p === "DUNG" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        )}
      >
        {PUNCTUALITY_LABEL[p]}
      </span>
      <span className={cn("tabular-nums", p === "MUON" ? "font-medium text-destructive" : "text-muted-foreground")}>
        {fmtMinutes(d)}
      </span>
    </span>
  );
}

function PhotoButton({ e, onOpen }: { e?: Ev | null; onOpen: (e: Ev) => void }) {
  if (!e?.hasPhoto) return null;
  return (
    <button
      type="button"
      title="Xem ảnh xe rời VP"
      className="ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded border border-sky-200 bg-sky-50 align-middle text-sky-700 hover:bg-sky-100"
      onClick={() => onOpen(e)}
    >
      <Camera className="h-3.5 w-3.5" />
    </button>
  );
}

function Page() {
  const { session } = useAuth();
  const canMark =
    canWrite(session?.role, "bao-gio-xe") ||
    canWrite(session?.role, "hang-cho-len-xe") ||
    canWrite(session?.role, "quet-nhap");
  const canConfigure = canWrite(session?.role, "bao-tri");
  const [photoRequired, setPhotoRequired] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const master = useBranchItineraryMaster();
  const viewOffice = useStore((s) => s.viewOffice);
  const wide = hasAllOfficeScope(session);
  const officeCode = wide ? assignedOfficeCode(resolveViewOffice(session, viewOffice)) : assignedOfficeCode(session?.office);
  const [officeItineraries, setOfficeItineraries] = useState<ItineraryOption[] | null>(null);
  const [photoView, setPhotoView] = useState<{ title: string; url: string } | null>(null);
  const openPhoto = useCallback(async (e: Ev) => {
    try {
      const r = await getVehicleEventPhoto(e.id);
      setPhotoView({
        title: `Ảnh xe rời ${e.officeName} — ${e.vehiclePlate || tripLabel(e)} lúc ${dayTime(e.eventAt)}`,
        url: r.photo,
      });
    } catch (err: any) {
      toast.error(err?.message || "Không tải được ảnh");
    }
  }, []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [branch, setBranch] = useState(ALL);
  const [status, setStatus] = useState<"" | Punctuality>("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("CHUYEN");
  const [route, setRoute] = useState("");
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [loaded, setLoaded] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void getVehiclePhotoPolicy()
      .then((p) => {
        if (alive) setPhotoRequired(p.departPhotoRequired !== false);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const togglePhoto = async (on: boolean) => {
    if (!canConfigure || savingPolicy) return;
    setSavingPolicy(true);
    const prev = photoRequired;
    setPhotoRequired(on);
    try {
      const saved = await saveVehiclePhotoPolicy(on);
      setPhotoRequired(saved.departPhotoRequired !== false);
      toast.success(saved.departPhotoRequired ? "App bắt buộc chụp ảnh khi báo xe rời" : "App không bắt chụp ảnh khi báo xe rời");
    } catch (e) {
      setPhotoRequired(prev);
      toast.error(e instanceof Error ? e.message : "Không lưu được cấu hình");
    } finally {
      setSavingPolicy(false);
    }
  };

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
        const r = await getVehicleEventReport({ from: f, to: t, officeCode: officeCode || undefined });
        setEvents(r.events);
        setOfficeItineraries(officeCode ? (r.itineraries ?? []) : null);
        setLoaded({ from: f, to: t });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu báo giờ xe");
      } finally {
        setLoading(false);
      }
    },
    [from, to, officeCode],
  );

  useEffect(() => {
    void load();
    // Tải lần đầu và khi admin đổi VP đang xem. Đổi ngày thì bấm "Xem".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeCode]);

  const quick = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    void load({ from: f, to: t });
  };

  const q = search.trim().toLowerCase();

  /** null = xem toàn hệ thống. Có VP thì chỉ lộ trình báo giờ của VP đó. */
  const scopedItineraries = useMemo(() => {
    if (!officeItineraries) return master.itineraries;
    const codes = new Set(officeItineraries.map((it) => it.code));
    const names = new Set(officeItineraries.map((it) => it.name));
    return master.itineraries.filter((it) => (it.code && codes.has(it.code)) || (it.name && names.has(it.name)));
  }, [officeItineraries, master.itineraries]);

  const branchOptions = useMemo(() => {
    const ids = new Set(scopedItineraries.map((it) => it.branch?.id).filter((id): id is number => id != null));
    const branches = officeItineraries ? master.branches.filter((b) => ids.has(b.id)) : master.branches;
    return [...branches]
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .map((b) => ({ value: String(b.id), label: b.name }));
  }, [master.branches, scopedItineraries, officeItineraries]);

  /** Lộ trình thuộc tuyến đang chọn (tên + mã, dạng routeKey) — null = mọi tuyến. */
  const branchRoutes = useMemo(() => {
    if (!branch) return null;
    const keys = new Set<string>();
    for (const it of scopedItineraries) {
      if (String(it.branch?.id ?? "") !== branch) continue;
      if (it.name) keys.add(routeKey(it.name));
      if (it.code) keys.add(routeKey(it.code));
    }
    return keys;
  }, [branch, scopedItineraries]);

  /** Mọi lộ trình trong danh mục (lọc theo tuyến nếu chọn) + tên tuyến có trong dữ liệu mà danh mục không có. */
  const routeOptions = useMemo(() => {
    const names = scopedItineraries
      .filter((it) => !branch || String(it.branch?.id ?? "") === branch)
      .map((it) => it.name)
      .filter((n): n is string => !!n?.trim());
    if (!officeItineraries && !branch) {
      for (const e of events ?? []) if (e.routeLabel?.trim()) names.push(e.routeLabel.trim());
    }
    if (officeItineraries && !branch) {
      for (const it of officeItineraries) if (it.name?.trim()) names.push(it.name.trim());
    }
    const byKey = new Map<string, string>();
    for (const n of names) if (!byKey.has(routeKey(n))) byKey.set(routeKey(n), n);
    return [...byKey.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "vi"))
      .map(([value, label]) => ({ value, label }));
  }, [scopedItineraries, officeItineraries, branch, events]);

  useEffect(() => {
    if (branch && !branchOptions.some((o) => o.value === branch)) setBranch("");
  }, [branch, branchOptions]);

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
          (!status || punctualityOf(deviationOf(e)) === status) &&
          matches(e, q, route, branchRoutes)
        );
      })
      .sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  }, [events, loaded, status, q, route, branchRoutes]);

  /** Mỗi xe tại mỗi VP một dòng: giờ đến → giờ rời VP đó. */
  const tripRows = useMemo(() => {
    if (!events || !loaded) return [];
    const groups = new Map<string, Ev[]>();
    for (const e of events) {
      const d = dayOf(e.eventAt);
      if (d < loaded.from || d > loaded.to) continue;
      const k = `${e.officeCode}|${e.tripKey}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const out = [...groups.entries()].map(([key, list]) => {
      const arrive = list.find((e) => e.eventType === "ARRIVE");
      const depart = list.find((e) => e.eventType === "DEPART");
      const head = list.find((e) => pickupOf(e)) ?? list[0];
      return {
        key,
        head,
        arrive,
        depart,
        pickup: pickupOf(depart) ?? pickupOf(head),
        sortAt: arrive?.eventAt ?? pickupOf(head) ?? list[0].eventAt,
      };
    });
    return out
      .filter((t) => {
        if (status && punctualityOf(deviationOf(t.depart)) !== status) return false;
        return matches(t.head, q, route, branchRoutes);
      })
      .sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [events, loaded, status, q, route, branchRoutes]);
  const tripPage = usePagedRows(tripRows, "bao-gio-xe.trips");
  const logPage = usePagedRows(logRows, "bao-gio-xe.logs");

  const exportExcel = () => {
    if (!loaded) return;
    const scope = branchOptions.find((b) => b.value === branch)?.label || "toan-he-thong";
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
          "Thời gian dừng (lệch giờ đón)",
          "Lý do muộn",
        ],
        rows: tripRows.map((t, i) => [
          i + 1,
          viDay(dayOf(t.sortAt)),
          t.head.officeName,
          t.head.vehiclePlate ?? "",
          t.head.driverName ?? "",
          t.head.routeLabel ?? "",
          dayTime(t.pickup),
          dayTime(t.arrive?.eventAt),
          t.arrive ? reporter(t.arrive) : "",
          dayTime(t.depart?.eventAt),
          t.depart ? reporter(t.depart) : "",
          delayText(t.depart),
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
          "Lý do muộn",
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
          dayTime(pickupOf(e)),
          delayText(e),
          reporter(e),
          e.reason ?? "",
        ]),
      },
    ]);
  };

  const departCount = logRows.filter((e) => e.eventType === "DEPART").length;
  const arriveCount = logRows.length - departCount;
  const lateCount = logRows.filter((e) => punctualityOf(deviationOf(e)) === "MUON").length;

  return (
    <div className="space-y-4">
      <StageTabRow className="gap-2.5 md:gap-3">
        <StageTabButton active={tab === "CHAM"} onClick={() => setTab("CHAM")}>
          Chấm xe đến/đi
        </StageTabButton>
        <StageTabButton active={tab === "CHUYEN"} onClick={() => setTab("CHUYEN")}>
          Theo xe tại VP
        </StageTabButton>
        <StageTabButton active={tab === "NHAT_KY"} onClick={() => setTab("NHAT_KY")}>
          Nhật ký báo
        </StageTabButton>
      </StageTabRow>

      {tab === "CHAM" ? (
        <Section title="Chấm xe đến/đi">
          <p className="mb-3 text-xs text-muted-foreground">
            Cùng danh sách và quy tắc với app: chọn lộ trình, báo xe đến rồi mới báo xe rời. Rời muộn từ {LATE_MINUTES} phút so
            với giờ đón phải nhập lý do. Web không chụp ảnh — ảnh văn phòng sẽ lấy từ camera sau.
          </p>
          {canConfigure ? (
            <div className="mb-3 flex items-center gap-2">
              <Switch checked={photoRequired} disabled={savingPolicy} onCheckedChange={(v) => void togglePhoto(v)} />
              <span className="text-sm">App bắt buộc chụp ảnh khi báo xe rời</span>
            </div>
          ) : null}
          <VehicleTimesMark readOnly={!canMark} />
        </Section>
      ) : null}

      {tab !== "CHAM" ? (
      <>
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
            <Label className="text-xs">Tuyến</Label>
            <SearchableSelect
              value={branch}
              onValueChange={setBranch}
              options={[{ value: ALL, label: "Tất cả tuyến" }, ...branchOptions]}
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
            <Label className="text-xs">Trạng thái</Label>
            <SearchableSelect
              value={status}
              onValueChange={(v) => setStatus(v as "" | Punctuality)}
              options={[
                { value: "", label: "Tất cả trạng thái" },
                { value: "SOM", label: "Sớm" },
                { value: "DUNG", label: "Đúng giờ" },
                { value: "MUON", label: "Muộn" },
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
              ? `${tripRows.length} lượt xe · ${arriveCount} lượt đến · ${departCount} lượt rời${lateCount ? ` · ${lateCount} lượt rời muộn` : ""}`
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
          Giờ do nhân viên báo trên app (Báo cáo giờ xe đến/đi). Xuất bến KH là giờ đón tại VP = giờ xuất bến của xe ± phút
          lệch cài ở Lộ trình áp dụng của VP. Thời gian dừng = chênh giữa giờ rời VP thực tế và Xuất bến KH: rời trước là SỚM, trễ 0–
          {LATE_MINUTES - 1} phút là ĐÚNG GIỜ, từ {LATE_MINUTES} phút là MUỘN (bắt buộc nhập lý do khi báo rời). Báo xe rời trên app bắt buộc chụp ảnh xe —
          bấm icon máy ảnh cạnh giờ rời để xem.
        </p>
      </Section>

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
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{dayTime(t.pickup) || "—"}</td>
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
                            <PhotoButton e={t.depart} onOpen={(e) => void openPhoto(e)} />
                            <div className="text-[11px] text-muted-foreground">{reporter(t.depart)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Chưa báo rời</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <DelayCell e={t.depart} />
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
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums font-medium">
                        {dayTime(e.eventAt)}
                        <PhotoButton e={e} onOpen={(x) => void openPhoto(x)} />
                      </td>
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
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{dayTime(pickupOf(e)) || "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        <div className="whitespace-nowrap">
                          <DelayCell e={e} />
                        </div>
                        {e.reason ? <div className="max-w-[16rem] text-[11px] text-amber-800">Lý do: {e.reason}</div> : null}
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
      </>
      ) : null}
      <ImageLightbox
        open={!!photoView}
        onOpenChange={(v) => !v && setPhotoView(null)}
        urls={photoView ? [photoView.url] : []}
        title={photoView?.title}
      />
    </div>
  );
}
