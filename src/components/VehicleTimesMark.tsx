import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getVehicleDayTrips,
  getVehicleItineraries,
  reportVehicleEvent,
  type ItineraryOption,
  type VehicleDayItem,
} from "@/lib/api/vehicle-events-api";

const ITINERARY_KEY = "vehicleTimes.itinerary";
const LATE_MINUTES = 5;
const DWELL_REASONS = [
  "Không rõ nguyên nhân",
  "Tắc đường",
  "Xe tuyến về muộn",
  "Đợi khách",
  "Chờ phát sinh khách",
  "Tránh công an",
  "Bị công an bắt",
  "Lái xe thu tiền",
  "Lái xe ăn trưa",
  "VPHH bốc hàng",
] as const;

function pickupOf(it: VehicleDayItem) {
  return it.pickupAt || it.plannedDepartAt || null;
}

function lateMinutes(pickupAt?: string | null): number | null {
  if (!pickupAt) return null;
  const t = Date.parse(pickupAt);
  return Number.isNaN(t) ? null : Math.trunc((Date.now() - t) / 60000);
}

function hhmm(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function plateKey(s?: string | null) {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type Confirm = { item: VehicleDayItem; type: "ARRIVE" | "DEPART" };

/** Chấm xe đến/rời đúng như app, không chụp ảnh. */
export function VehicleTimesMark({ readOnly = false }: { readOnly?: boolean }) {
  const [itineraries, setItineraries] = useState<ItineraryOption[]>([]);
  const [itinerary, setItinerary] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VehicleDayItem[]>([]);
  const [officeName, setOfficeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await getVehicleItineraries();
        if (!alive) return;
        const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "vi"));
        setItineraries(sorted);
        const saved = localStorage.getItem(ITINERARY_KEY);
        const pick = sorted.find((it) => it.code === saved) ?? sorted[0];
        setItinerary(pick?.code ?? "");
      } catch (e) {
        if (alive) toast.error(e instanceof Error ? e.message : "Không tải được lộ trình");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!itinerary) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const board = await getVehicleDayTrips(itinerary);
      setItems(board.items);
      setOfficeName(board.officeName || board.officeCode || "");
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách xe");
    } finally {
      setLoading(false);
    }
  }, [itinerary]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = plateKey(query);
    return q ? items.filter((it) => plateKey(it.vehiclePlate).includes(q)) : items;
  }, [items, query]);

  const late = confirm?.type === "DEPART" ? lateMinutes(pickupOf(confirm.item)) : null;
  const needReason = late != null && late >= LATE_MINUTES;
  const canSubmit = !needReason || !!reason.trim();

  const openConfirm = (item: VehicleDayItem, type: Confirm["type"]) => {
    setReason("");
    setConfirm({ item, type });
  };

  const submit = async () => {
    if (!confirm || busy || !canSubmit) return;
    const { item, type } = confirm;
    setBusy(true);
    try {
      const saved = await reportVehicleEvent({
        eventType: type,
        externalTripId: item.externalTripId,
        vehiclePlate: item.vehiclePlate,
        driverName: item.driverName,
        routeLabel: item.routeLabel,
        plannedDepartAt: item.plannedDepartAt,
        itineraryCode: itinerary,
        ...(needReason ? { reason: reason.trim() } : {}),
      });
      setItems((prev) =>
        prev.map((it) =>
          it.externalTripId !== item.externalTripId
            ? it
            : type === "ARRIVE"
              ? { ...it, arrivedAt: saved.reportedAt, arrivedBy: saved.reportedBy }
              : { ...it, departedAt: saved.reportedAt, departedBy: saved.reportedBy },
        ),
      );
      toast.success(
        `${item.vehiclePlate || "Xe"} ${type === "ARRIVE" ? "đã đến" : "đã rời"} văn phòng lúc ${hhmm(saved.reportedAt)}`,
      );
      setConfirm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không ghi nhận được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <SearchableSelect
          value={itinerary}
          onValueChange={(code) => {
            setItinerary(code);
            localStorage.setItem(ITINERARY_KEY, code);
          }}
          options={itineraries.map((it) => ({ value: it.code, label: it.name }))}
          placeholder="Chọn lộ trình"
          emptyText="Không có lộ trình nào đi hoặc đến văn phòng của bạn."
          disabled={!itineraries.length}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm biển số"
            className="pl-8 uppercase"
          />
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || !itinerary}>
          Tải lại
        </Button>
      </div>
      <p className="text-sm font-medium">
        Danh sách xe hôm nay{officeName ? ` — ${officeName}` : ""}
        {shown.length ? ` (${shown.length})` : ""}
      </p>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Đang tải…</p>
      ) : !itinerary ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Chọn lộ trình để xem danh sách xe.</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {query ? "Không có xe khớp biển số." : "Hôm nay lộ trình này chưa có xe."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((it) => {
            const meta = [it.driverName, pickupOf(it) ? `Xuất bến ${hhmm(pickupOf(it))}` : ""].filter(Boolean).join("  •  ");
            return (
              <div key={it.externalTripId} className="space-y-2 rounded-lg border bg-card p-4 shadow-sm">
                <div className="text-base font-bold">{it.vehiclePlate || "Chưa có biển số"}</div>
                {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
                {it.arrivedAt ? (
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Đã đến lúc {hhmm(it.arrivedAt)}
                  </div>
                ) : null}
                {it.departedAt ? (
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Đã rời lúc {hhmm(it.departedAt)}
                  </div>
                ) : null}
                {readOnly ? null : !it.arrivedAt ? (
                  <Button className="w-full" onClick={() => openConfirm(it, "ARRIVE")}>
                    Xe đến VP
                  </Button>
                ) : !it.departedAt ? (
                  <Button className="w-full" onClick={() => openConfirm(it, "DEPART")}>
                    Xe rời VP
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm?.type === "ARRIVE" ? "Xác nhận xe đã đến văn phòng?" : "Xác nhận xe đã rời văn phòng?"}
            </DialogTitle>
          </DialogHeader>
          {confirm?.item.vehiclePlate ? <p className="text-center text-base font-bold text-primary">{confirm.item.vehiclePlate}</p> : null}
          {needReason ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-amber-700">
                Xe rời muộn {late ?? 0} phút so với giờ đón {hhmm(pickupOf(confirm!.item))} — nhập lý do *
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DWELL_REASONS.map((r) => {
                  const on = reason.trim() === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`rounded-full border px-2.5 py-1 text-sm ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border"}`}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Chọn nhanh ở trên hoặc tự nhập"
                maxLength={500}
                className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Quay lại
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !canSubmit}>
              {busy ? "Đang ghi…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
