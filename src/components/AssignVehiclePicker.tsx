import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { isApiEnabled } from "@/lib/api/client";
import type { AvailableTrip } from "@/lib/api/domain-api";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTripClock(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const GIO_CHAY_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  const v = `${h}:${m}`;
  return { value: v, label: v };
});

const TAI_TRONG_OPTIONS = [
  "1.5 tấn",
  "2.5 tấn",
  "5 tấn",
  "8 tấn",
  "10 tấn",
  "15 tấn",
];

function truckTypeFromTaiTrong(taiTrong: string): { vehicleType: string; capacity: number } {
  const n = Number.parseFloat(taiTrong.replace(",", "."));
  const tons = Number.isFinite(n) ? n : 5;
  return {
    vehicleType: `Xe tải ${taiTrong}`,
    capacity: Math.round(tons * 1000),
  };
}

function departAtFromGioChay(gioChay: string): string {
  const [hh, mm] = gioChay.split(":").map((x) => Number(x));
  const d = new Date();
  d.setHours(hh || 0, mm || 0, 0, 0);
  if (d.getTime() < Date.now() - 60_000) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

/** Overlay riêng — tránh Dialog lồng Dialog làm vỡ form. */
function NestedFormOverlay({
  open,
  title,
  onClose,
  children,
  onSave,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  onSave: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Đóng" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[101] flex max-h-[min(90vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-background p-6 shadow-xl"
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="rounded-sm opacity-70 hover:opacity-100" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className="mt-6 flex shrink-0 justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" onClick={onSave}>
            Lưu
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type VthkPick = {
  tab: "vthk";
  trip: AvailableTrip;
  branchName: string;
  itineraryName?: string;
};

export type VthhPick = {
  tab: "vthh";
  plate: string;
  vehicleId?: number;
  driver: string;
  route: string;
  departAt: string;
};

export type AssignVehiclePick = VthkPick | VthhPick | null;

export function tripItineraryLabel(pick: AssignVehiclePick): string {
  if (!pick) return "";
  if (pick.tab === "vthk") {
    const parts = [pick.branchName?.trim(), pick.itineraryName?.trim()].filter(Boolean) as string[];
    const uniq: string[] = [];
    for (const p of parts) {
      if (!uniq.includes(p)) uniq.push(p);
    }
    return uniq.join(" · ").slice(0, 160);
  }
  return (pick.route || "").trim().slice(0, 160);
}

export function vthkTripKey(t: AvailableTrip): string {
  return [String(t.externalTripId ?? ""), t.departAt ?? "", t.vehiclePlate || "", t.timeSlot || ""].join("|");
}

export function realVehiclePlate(raw?: string | null): string {
  const p = raw?.trim() ?? "";
  if (!p) return "";
  if (/^CH[0-9A-Z]+$/i.test(p)) return "";
  if (/^chưa gán/i.test(p)) return "";
  return p;
}

export function realDriverName(raw?: string | null): string {
  const d = raw?.trim() ?? "";
  if (!d) return "";
  if (/^chưa gán/i.test(d)) return "";
  return d;
}

const OPEN_TRIP = new Set(["CREATED", "LOADING", "DEPARTED", "UNLOADING"]);

export function findOpenTripByPlate<T extends { bks: string; status: string }>(
  trips: T[],
  plate: string,
): T | undefined {
  const p = realVehiclePlate(plate).toUpperCase();
  if (!p) return undefined;
  return trips.find((t) => OPEN_TRIP.has(t.status) && realVehiclePlate(t.bks).toUpperCase() === p);
}

function TripCard({
  active,
  headline,
  plate,
  driver,
  loadKg,
  loadCount,
  onClick,
}: {
  active: boolean;
  headline: string;
  plate: string;
  driver: string;
  loadKg: number;
  loadCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "box-border flex h-[96px] w-[168px] shrink-0 flex-col overflow-hidden rounded-lg border bg-background px-3 py-2.5 text-left transition",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug">{headline}</div>
        {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{plate}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{driver}</div>
      <div className="mt-auto truncate pt-1 text-xs text-muted-foreground">
        {loadKg.toFixed(0)}kg - {loadCount} đơn
      </div>
    </button>
  );
}

function AddManualCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="box-border flex h-[96px] w-[140px] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-muted-foreground/40 px-3 py-2.5 text-primary transition hover:border-primary/50 hover:bg-primary/5"
    >
      <Plus className="h-6 w-6 shrink-0" />
      <span className="text-center text-xs font-medium leading-tight">Thêm xe thủ công</span>
    </button>
  );
}

/** Hàng thẻ 1 dòng, cuộn ngang — không wrap xuống. */
function VehicleRow({ children }: { children: ReactNode }) {
  return (
    <div className="h-[104px] w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain">
      <div className="flex h-full w-max flex-nowrap items-stretch gap-2">{children}</div>
    </div>
  );
}

export function AssignVehiclePicker({
  open,
  onPick,
}: {
  open: boolean;
  onPick: (pick: AssignVehiclePick) => void;
}) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [tab, setTab] = useState<"vthk" | "vthh">("vthk");
  const [branch, setBranch] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [pickedVthkKey, setPickedVthkKey] = useState("");
  const [vthk, setVthk] = useState<AvailableTrip[]>([]);
  const [loadingVthk, setLoadingVthk] = useState(false);

  const [manualLimo, setManualLimo] = useState<{
    plate: string;
    driver: string;
    gioChay: string;
    departAt: string;
  } | null>(null);
  const [limoDlgOpen, setLimoDlgOpen] = useState(false);
  const [limoBks, setLimoBks] = useState("");
  const [limoDriver, setLimoDriver] = useState("");
  const [limoGioChay, setLimoGioChay] = useState("");

  const [truckDlgOpen, setTruckDlgOpen] = useState(false);
  const [truckEditId, setTruckEditId] = useState<number | null>(null);
  const [truckBks, setTruckBks] = useState("");
  const [truckDriver, setTruckDriver] = useState("");
  const [truckTaiTrong, setTruckTaiTrong] = useState("");
  const [truckList, setTruckList] = useState<
    {
      id: number;
      bks: string;
      capacity: number;
      vehicleType?: string;
      driverName?: string;
      active: boolean;
    }[]
  >([]);
  const [loadingTrucks, setLoadingTrucks] = useState(false);

  const drivers = useStore((s) => s.drivers);
  const routes = useStore((s) => s.routes);
  const trips = useStore((s) => s.trips);
  const orders = useStore((s) => s.orders);
  const [pickedPlate, setPickedPlate] = useState("");

  const { branchNames, itinerariesForBranchName } = useBranchItineraryMaster();

  const loadByPlate = useMemo(() => {
    const map = new Map<string, { kg: number; count: number }>();
    for (const t of trips) {
      if (["CLOSED", "CANCELLED"].includes(t.status)) continue;
      const assigned = orders.filter((o) => o.tripCode === t.code);
      const kg = assigned.reduce((s, o) => s + (o.weightKg ?? 0), 0);
      const cur = map.get(t.bks) ?? { kg: 0, count: 0 };
      map.set(t.bks, { kg: cur.kg + kg, count: cur.count + assigned.length });
    }
    return map;
  }, [trips, orders]);

  const truckVehicles = useMemo(
    () => truckList.filter((v) => v.active && !/limousine/i.test(v.vehicleType ?? "")),
    [truckList],
  );

  const reloadTrucks = async () => {
    if (!isApiEnabled()) {
      setTruckList([]);
      return;
    }
    setLoadingTrucks(true);
    try {
      const domain = await import("@/lib/api/domain-api");
      const list = await domain.listVehiclesMaster();
      setTruckList(list);
    } catch (e: any) {
      setTruckList([]);
      toast.error(e?.message || "Không tải được danh sách xe tải từ máy chủ");
    } finally {
      setLoadingTrucks(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab("vthk");
    setPickedVthkKey("");
    setPickedPlate("");
    setBranch("");
    setItinerary("");
    setVthk([]);
    setManualLimo(null);
    setLimoDlgOpen(false);
    setTruckDlgOpen(false);
    setTruckEditId(null);
    onPickRef.current(null);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "vthh") return;
    void reloadTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  useEffect(() => {
    if (!open || tab !== "vthk") return;
    if (!isApiEnabled() || !itinerary) {
      setVthk([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVthk(true);
      try {
        const domain = await import("@/lib/api/domain-api");
        const items = await domain.searchAvailableTrips({ itineraryCode: itinerary });
        if (!cancelled) setVthk(items);
      } catch (e: any) {
        if (!cancelled) {
          setVthk([]);
          toast.error(e?.message || "Không tải được xe Limousine");
        }
      } finally {
        if (!cancelled) setLoadingVthk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, branch, itinerary]);

  useEffect(() => {
    if (tab !== "vthk") return;
    if (manualLimo) {
      const routeVal = itinerary || branch;
      onPickRef.current(
        routeVal
          ? {
              tab: "vthh",
              plate: manualLimo.plate,
              driver: manualLimo.driver,
              route: routeVal,
              departAt: manualLimo.departAt,
            }
          : null,
      );
      return;
    }
    const trip = vthk.find((t) => vthkTripKey(t) === pickedVthkKey);
    onPickRef.current(trip ? { tab: "vthk", trip, branchName: branch, itineraryName: itinerary } : null);
  }, [tab, vthk, pickedVthkKey, branch, itinerary, manualLimo]);

  useEffect(() => {
    if (tab !== "vthh") return;
    const v = truckVehicles.find((x) => x.bks === pickedPlate);
    if (!v) {
      onPickRef.current(null);
      return;
    }
    onPickRef.current({
      tab: "vthh",
      plate: v.bks,
      vehicleId: v.id,
      driver: v.driverName?.trim() || "Chưa gán tài",
      route: routes[0] ?? v.vehicleType ?? "VTHH",
      departAt: new Date().toISOString(),
    });
  }, [tab, pickedPlate, truckVehicles, routes]);

  const emitTab = (next: "vthk" | "vthh") => {
    setTab(next);
    setPickedVthkKey("");
    setPickedPlate("");
    setManualLimo(null);
    onPickRef.current(null);
  };

  const openTruckCreate = () => {
    setTruckEditId(null);
    setTruckBks("");
    setTruckDriver("");
    setTruckTaiTrong("");
    setTruckDlgOpen(true);
  };

  const openTruckEdit = (v: { id: number; bks: string; capacity: number; vehicleType?: string; driverName?: string }) => {
    setTruckEditId(v.id);
    setTruckBks(v.bks);
    setTruckDriver(v.driverName ?? "");
    const tons = v.capacity > 0 ? v.capacity / 1000 : 0;
    const label =
      TAI_TRONG_OPTIONS.find((o) => Math.abs(Number.parseFloat(o) - tons) < 0.01) ??
      (tons > 0 ? `${tons} tấn` : "");
    setTruckTaiTrong(label);
    setTruckDlgOpen(true);
  };

  const saveLimoDlg = () => {
    const plate = limoBks.trim();
    const drv = limoDriver.trim();
    if (!plate) return toast.error("Nhập biển kiểm soát");
    if (!drv) return toast.error("Nhập tên tài xế");
    if (!limoGioChay) return toast.error("Chọn giờ chạy");
    const routeVal = itinerary || branch;
    if (!routeVal) return toast.error("Chọn tuyến / lộ trình trước");

    setManualLimo({
      plate,
      driver: drv,
      gioChay: limoGioChay,
      departAt: departAtFromGioChay(limoGioChay),
    });
    setPickedVthkKey("");
    setLimoDlgOpen(false);
    toast.success("Đã thêm xe limousine");
  };

  const saveTruckDlg = async () => {
    const plate = truckBks.trim();
    const drv = truckDriver.trim();
    if (!plate) return toast.error("Nhập biển kiểm soát");
    if (!drv) return toast.error("Nhập tên tài xế");
    if (!truckTaiTrong.trim()) return toast.error("Chọn tải trọng");
    if (!isApiEnabled()) return toast.error("API chưa cấu hình");

    const { vehicleType, capacity } = truckTypeFromTaiTrong(truckTaiTrong.trim());
    try {
      const domain = await import("@/lib/api/domain-api");
      if (truckEditId != null) {
        await domain.updateVehicleApi(truckEditId, {
          bks: plate,
          capacity,
          vehicleType,
          driverName: drv,
          active: true,
        });
        toast.success("Đã cập nhật xe tải");
      } else {
        await domain.createVehicleApi({
          bks: plate,
          capacity,
          vehicleType,
          driverName: drv,
          active: true,
        });
        toast.success("Đã thêm xe tải");
      }
      await reloadTrucks();
      // giữ store master đồng bộ màn hình khác
      const { syncMasterFromApi } = await import("@/lib/api/sync");
      await syncMasterFromApi().catch(() => undefined);
      setPickedPlate(plate);
      setTruckDlgOpen(false);
      setTruckEditId(null);
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được xe tải");
    }
  };

  const deleteTruck = async (v: { id: number; bks: string }) => {
    if (!window.confirm(`Xóa xe ${v.bks}?`)) return;
    if (!isApiEnabled()) return toast.error("API chưa cấu hình");
    try {
      const domain = await import("@/lib/api/domain-api");
      await domain.deleteVehicleApi(v.id);
      if (pickedPlate === v.bks) setPickedPlate("");
      await reloadTrucks();
      const { syncMasterFromApi } = await import("@/lib/api/sync");
      await syncMasterFromApi().catch(() => undefined);
      toast.success("Đã xóa xe tải");
    } catch (e: any) {
      toast.error(e?.message || "Không xóa được xe tải");
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
      <Tabs value={tab} onValueChange={(v) => emitTab(v as "vthk" | "vthh")}>
        <TabsList className="h-9">
          <TabsTrigger value="vthk">Xe Limousine</TabsTrigger>
          <TabsTrigger value="vthh">Xe tải</TabsTrigger>
        </TabsList>

        <TabsContent value="vthk" className="mt-3 min-w-0 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tuyến</Label>
              <SearchableSelect
                value={branch}
                onValueChange={(v) => {
                  setBranch(v);
                  setItinerary(itinerariesForBranchName(v)[0] ?? "");
                  setPickedVthkKey("");
                  setManualLimo(null);
                }}
                placeholder="Chọn"
                options={branchNames.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Lộ trình</Label>
              <SearchableSelect
                value={itinerary}
                onValueChange={(v) => {
                  setItinerary(v);
                  setPickedVthkKey("");
                  setManualLimo(null);
                }}
                placeholder="Chọn"
                options={itinerariesForBranchName(branch).map((it) => ({ value: it, label: it }))}
              />
            </div>
          </div>

          <VehicleRow>
            {!itinerary ? (
              <div className="w-[min(100%,420px)] rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Chọn tuyến và lộ trình để xem xe Limousine
              </div>
            ) : loadingVthk ? (
              <div className="w-[min(100%,420px)] py-6 text-center text-sm text-muted-foreground">Đang tải xe…</div>
            ) : (
              <>
                {vthk.map((t) => {
                  const key = vthkTripKey(t);
                  const plate = t.vehiclePlate?.trim() || "Chưa gán biển";
                  const drv = t.driverName?.trim() || "Chưa gán tài";
                  const load = plate !== "Chưa gán biển" ? loadByPlate.get(plate) : undefined;
                  return (
                    <TripCard
                      key={key}
                      active={!manualLimo && pickedVthkKey === key}
                      headline={formatTripClock(t.departAt)}
                      plate={plate}
                      driver={drv}
                      loadKg={Number(t.usedKg ?? load?.kg ?? 0)}
                      loadCount={Number(t.usedOrderCount ?? load?.count ?? 0)}
                      onClick={() => {
                        setPickedVthkKey(key);
                        setManualLimo(null);
                      }}
                    />
                  );
                })}
                {manualLimo && (
                  <TripCard
                    active
                    headline={manualLimo.gioChay}
                    plate={manualLimo.plate}
                    driver={manualLimo.driver}
                    loadKg={loadByPlate.get(manualLimo.plate)?.kg ?? 0}
                    loadCount={loadByPlate.get(manualLimo.plate)?.count ?? 0}
                    onClick={() => setPickedVthkKey("")}
                  />
                )}
                {vthk.length === 0 && !manualLimo && (
                  <div className="flex h-[96px] w-[180px] shrink-0 items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground">
                    Không có chuyến trong 1 giờ tới
                  </div>
                )}
                <AddManualCard
                  onClick={() => {
                    setLimoBks("");
                    setLimoDriver("");
                    setLimoGioChay("");
                    setLimoDlgOpen(true);
                  }}
                />
              </>
            )}
          </VehicleRow>
        </TabsContent>

        <TabsContent value="vthh" className="mt-3 min-w-0 space-y-3">
          {loadingTrucks ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Đang tải xe tải từ máy chủ…</div>
          ) : (
            <VehicleRow>
              {truckVehicles.map((v) => {
                const active = pickedPlate === v.bks;
                const load = loadByPlate.get(v.bks);
                return (
                  <div key={v.id} className="relative shrink-0">
                    <TripCard
                      active={active}
                      headline={v.vehicleType || "Xe tải"}
                      plate={v.bks}
                      driver={v.driverName || "Chưa gán tài"}
                      loadKg={load?.kg ?? 0}
                      loadCount={load?.count ?? 0}
                      onClick={() => setPickedPlate(v.bks)}
                    />
                    <div className="absolute right-1 top-1 flex gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-6 w-6 p-0"
                        title="Sửa"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTruckEdit(v);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-6 w-6 p-0 text-destructive"
                        title="Xóa"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteTruck(v);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {truckVehicles.length === 0 && (
                <div className="flex h-[96px] w-[180px] shrink-0 items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground">
                  Chưa có xe tải — thêm thủ công
                </div>
              )}
              <AddManualCard onClick={openTruckCreate} />
            </VehicleRow>
          )}
        </TabsContent>
      </Tabs>

      <NestedFormOverlay
        open={limoDlgOpen}
        title="Thêm xe limousine"
        onClose={() => setLimoDlgOpen(false)}
        onSave={saveLimoDlg}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Biển kiểm soát</Label>
            <Input
              placeholder="Nhập BKS..."
              value={limoBks}
              onChange={(e) => setLimoBks(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tên tài xế</Label>
            <Input
              placeholder="Nhập tên tài xế..."
              value={limoDriver}
              onChange={(e) => setLimoDriver(e.target.value)}
              list="limo-driver-suggestions"
            />
            <datalist id="limo-driver-suggestions">
              {drivers.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Giờ chạy</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={limoGioChay}
              onChange={(e) => setLimoGioChay(e.target.value)}
            >
              <option value="">Chọn</option>
              {GIO_CHAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </NestedFormOverlay>

      <NestedFormOverlay
        open={truckDlgOpen}
        title={truckEditId != null ? "Sửa xe tải" : "Thêm xe tải"}
        onClose={() => {
          setTruckDlgOpen(false);
          setTruckEditId(null);
        }}
        onSave={() => void saveTruckDlg()}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Biển kiểm soát</Label>
            <Input
              placeholder="Nhập BKS..."
              value={truckBks}
              onChange={(e) => setTruckBks(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tên tài xế</Label>
            <Input
              placeholder="Nhập tên tài xế..."
              value={truckDriver}
              onChange={(e) => setTruckDriver(e.target.value)}
              list="truck-driver-suggestions"
            />
            <datalist id="truck-driver-suggestions">
              {drivers.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tải trọng</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={truckTaiTrong}
              onChange={(e) => setTruckTaiTrong(e.target.value)}
            >
              <option value="">Chọn</option>
              {[
                ...TAI_TRONG_OPTIONS,
                ...(truckTaiTrong && !TAI_TRONG_OPTIONS.includes(truckTaiTrong) ? [truckTaiTrong] : []),
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </NestedFormOverlay>
    </div>
  );
}
