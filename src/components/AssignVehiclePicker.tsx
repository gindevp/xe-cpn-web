import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/PageBits";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { isApiEnabled } from "@/lib/api/client";
import type { AvailableTrip } from "@/lib/api/domain-api";
import { toast } from "sonner";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import type { VehicleRec } from "@/lib/store";
import { Check, Pencil, Plus, Trash2, Truck } from "lucide-react";

const TIME_SLOTS = Array.from({ length: 12 }, (_, i) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(i * 2)}:00-${p(i * 2 + 2)}:00`;
});

function formatTripClock(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function vthkTripTimeLabel(t: AvailableTrip): string {
  const start = formatTripClock(t.departAt);
  const end = formatTripClock(t.endAt);
  if (start === "—" && end === "—") return "—";
  if (end === "—") return start;
  return `${start} → ${end}`;
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

/** Tuyến hiển thị: chi nhánh VTHK + lộ trình đã chọn (không dùng GP → ND). */
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
  return [
    String(t.externalTripId ?? ""),
    t.departAt ?? "",
    t.vehiclePlate || "",
    t.timeSlot || "",
  ].join("|");
}

/** Real BKS only — ignore VTHK placeholders like CH12345 / Chưa gán biển. */
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branch, setBranch] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [pickedVthkKey, setPickedVthkKey] = useState("");
  const [vthk, setVthk] = useState<AvailableTrip[]>([]);
  const [loadingVthk, setLoadingVthk] = useState(false);

  const vehicles = useStore((s) => s.vehicles);
  const drivers = useStore((s) => s.drivers);
  const routes = useStore((s) => s.routes);
  const trips = useStore((s) => s.trips);
  const orders = useStore((s) => s.orders);
  const [pickedPlate, setPickedPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [cargoRoute, setCargoRoute] = useState("");
  const [departLocal, setDepartLocal] = useState(() => new Date().toISOString().slice(0, 16));
  const [vehDlg, setVehDlg] = useState<{ mode: "create" | "edit"; initial?: VehicleRec } | null>(null);

  const { session } = useAuth();
  const canEditFleet = canWrite(session?.role, "master");
  const { branchNames, itinerariesForBranchName, itineraryCodeOf } = useBranchItineraryMaster();

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

  useEffect(() => {
    if (!open) return;
    setTab("vthk");
    setPickedVthkKey("");
    setPickedPlate("");
    setBranch("");
    setItinerary("");
    setTimeFilter("all");
    setVthk([]);
    onPickRef.current(null);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "vthk") return;
    if (!isApiEnabled() || !itinerary || !date) {
      setVthk([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVthk(true);
      try {
        const domain = await import("@/lib/api/domain-api");
        const code = itineraryCodeOf(branch, itinerary) ?? itinerary;
        const items = await domain.searchAvailableTrips({
          date,
          itineraryCode: code,
          timeSlot: timeFilter === "all" ? undefined : timeFilter,
        });
        if (!cancelled) setVthk(items);
      } catch (e: any) {
        if (!cancelled) {
          setVthk([]);
          toast.error(e?.message || "Không tải được xe khách từ VTHK");
        }
      } finally {
        if (!cancelled) setLoadingVthk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, date, branch, itinerary, timeFilter, itineraryCodeOf]);

  useEffect(() => {
    if (tab !== "vthk") return;
    const trip = vthk.find((t) => vthkTripKey(t) === pickedVthkKey);
    onPickRef.current(trip ? { tab: "vthk", trip, branchName: branch, itineraryName: itinerary } : null);
  }, [tab, vthk, pickedVthkKey, branch, itinerary]);

  useEffect(() => {
    if (tab !== "vthh") return;
    const v = vehicles.find((x) => x.bks === pickedPlate);
    const departAt = departLocal ? new Date(departLocal).toISOString() : "";
    onPickRef.current(
      v && driver && cargoRoute && departAt
        ? {
            tab: "vthh",
            plate: v.bks,
            vehicleId: v.id,
            driver,
            route: cargoRoute,
            departAt,
          }
        : null,
    );
  }, [tab, pickedPlate, driver, cargoRoute, departLocal, vehicles]);

  const emitTab = (next: "vthk" | "vthh") => {
    setTab(next);
    setPickedVthkKey("");
    setPickedPlate("");
    onPickRef.current(null);
  };

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => emitTab(v as "vthk" | "vthh")}>
        <TabsList>
          <TabsTrigger value="vthk">Xe khách (VTHK)</TabsTrigger>
          <TabsTrigger value="vthh">Xe tải (VTHH)</TabsTrigger>
        </TabsList>

        <TabsContent value="vthk" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Ngày đi</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tuyến</Label>
              <SearchableSelect
                value={branch}
                onValueChange={(v) => {
                  setBranch(v);
                  setItinerary(itinerariesForBranchName(v)[0] ?? "");
                  setPickedVthkKey("");
                }}
                placeholder="Chọn tuyến"
                options={branchNames.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lộ trình</Label>
              <SearchableSelect
                value={itinerary}
                onValueChange={(v) => {
                  setItinerary(v);
                  setPickedVthkKey("");
                }}
                placeholder="Chọn lộ trình"
                options={itinerariesForBranchName(branch).map((it) => ({ value: it, label: it }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Khung giờ</Label>
              <SearchableSelect
                value={timeFilter}
                onValueChange={setTimeFilter}
                placeholder="Tất cả"
                options={[
                  { value: "all", label: "Tất cả" },
                  ...TIME_SLOTS.map((s) => ({ value: s, label: s.replace("-", " - ") })),
                ]}
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Xe khả dụng VTHK ({vthk.length})</Label>
            <div className="mt-2">
              {!itinerary ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Chọn tuyến và lộ trình để xem xe khách
                </div>
              ) : loadingVthk ? (
                <EmptyState>Đang tải xe từ VTHK…</EmptyState>
              ) : vthk.length === 0 ? (
                <EmptyState>Không có chuyến khách khả dụng</EmptyState>
              ) : (
                <div className="max-h-[220px] overflow-y-auto rounded-md border">
                  <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-3">
                    {vthk.map((t) => {
                      const active = pickedVthkKey === vthkTripKey(t);
                      const bks = t.vehiclePlate?.trim() || "Chưa gán biển";
                      const drv = t.driverName?.trim() || "Chưa gán tài";
                      return (
                        <button
                          key={vthkTripKey(t)}
                          type="button"
                          onClick={() => setPickedVthkKey(vthkTripKey(t))}
                          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                            active ? "border-primary bg-primary/10" : "hover:bg-accent"
                          }`}
                        >
                          <div>
                            <div className="font-medium">
                              {vthkTripTimeLabel(t)} · {bks}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {drv}
                              {t.vehicleType ? ` · ${t.vehicleType}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {Number(t.usedKg ?? 0).toFixed(1)} kg · {Number(t.usedOrderCount ?? 0)} đơn
                            </div>
                          </div>
                          {active && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vthh" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-medium">Xe tải VTHH ({vehicles.length})</Label>
            {canEditFleet && (
              <Button size="sm" className="gap-1" onClick={() => setVehDlg({ mode: "create" })}>
                <Plus className="h-4 w-4" /> Tạo xe
              </Button>
            )}
          </div>
          {vehicles.length === 0 ? (
            <EmptyState>Chưa có xe tải trong danh mục</EmptyState>
          ) : (
            <div className="max-h-[220px] overflow-y-auto rounded-md border">
              <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-3">
                {vehicles.map((v) => {
                  const active = pickedPlate === v.bks;
                  const load = loadByPlate.get(v.bks);
                  return (
                    <div
                      key={v.bks}
                      className={`rounded-md border p-3 text-left text-sm transition ${
                        active ? "border-primary bg-primary/10" : "hover:bg-accent"
                      }`}
                    >
                      <button type="button" className="w-full text-left" onClick={() => {
                        setPickedPlate(v.bks);
                        if (v.driverName) setDriver(v.driverName);
                      }}>
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{v.bks}</span>
                          {active && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {v.vehicleType ? `${v.vehicleType} · ` : ""}Định mức {v.capacity} kg
                          {v.volumeM3 != null ? ` · ${v.volumeM3} m³` : ""}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {(load?.kg ?? 0).toFixed(1)} kg · {load?.count ?? 0} đơn đang gán
                        </div>
                      </button>
                      {canEditFleet && (
                        <div className="mt-2 flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => setVehDlg({ mode: "edit", initial: v })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            onClick={() => {
                              useStore.getState().removeVehicle(v.bks);
                              if (pickedPlate === v.bks) setPickedPlate("");
                              toast.success("Đã xóa xe");
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tài xế *</Label>
              <SearchableSelect
                value={driver}
                onValueChange={setDriver}
                placeholder="Chọn tài xế"
                options={drivers.map((d) => ({ value: d, label: d }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tuyến *</Label>
              <SearchableSelect
                value={cargoRoute}
                onValueChange={setCargoRoute}
                placeholder="Chọn tuyến"
                options={routes.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Giờ khởi hành *</Label>
              <Input type="datetime-local" value={departLocal} onChange={(e) => setDepartLocal(e.target.value)} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {vehDlg && (
        <VehicleFormDialog mode={vehDlg.mode} initial={vehDlg.initial} onClose={() => setVehDlg(null)} />
      )}
    </>
  );
}
