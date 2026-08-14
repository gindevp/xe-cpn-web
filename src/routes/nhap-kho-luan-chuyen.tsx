import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatVND,
  formatDateTime,
  officeName,
  ORDER_STATUS_LABEL,
  type Order,
} from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { toast } from "sonner";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Search,
  Warehouse,
  Truck,
  CheckCircle2,
  XCircle,
  Printer,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { isApiEnabled } from "@/lib/api/client";
import type { AvailableTrip } from "@/lib/api/domain-api";

const ASSIGN_TIME_SLOTS = Array.from({ length: 12 }, (_, i) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(i * 2)}:00-${p(i * 2 + 2)}:00`;
});

const TUYEN_BY_CODE: Record<string, string> = {
  NB: "Ninh Bình",
  ND: "Nam Định",
  SHN: "Nam Định",
  TB: "Thái Bình",
  VT: "Việt Trì",
  PT: "Phú Thọ",
  YB1: "Yên Bái",
  YB3: "Yên Bái",
};

function tuyenOfRoute(route: string) {
  const parts = route.split("→").map((s) => s.trim());
  for (const p of [...parts].reverse()) {
    if (TUYEN_BY_CODE[p]) return TUYEN_BY_CODE[p];
  }
  return "Hà Nội";
}

function matchTuyen(tripRoute: string, tuyen: string) {
  const r = (tripRoute || "").toLowerCase();
  const t = (tuyen || "").toLowerCase();
  if (!t) return true;
  return r.includes(t) || tuyenOfRoute(tripRoute).toLowerCase() === t;
}

function matchLoTrinh(tripRoute: string, loTrinh: string) {
  const r = (tripRoute || "").toLowerCase();
  const l = (loTrinh || "").toLowerCase();
  if (!l) return true;
  return r === l || r.includes(l);
}

function slotOf(iso: string) {
  const h = new Date(iso).getHours();
  const i = Math.floor(h / 2);
  return ASSIGN_TIME_SLOTS[i];
}

export const Route = createFileRoute("/nhap-kho-luan-chuyen")({
  head: () => ({
    meta: [
      { title: "Nhập kho - Luân chuyển - Đang giao — X.E" },
      {
        name: "description",
        content:
          "Theo dõi đơn hàng từ lúc lấy hàng thành công, nhập kho gửi, luân chuyển, nhập kho giao đến khi giao hàng cho khách.",
      },
      { property: "og:title", content: "Nhập kho - Luân chuyển - Đang giao — X.E" },
      {
        property: "og:description",
        content:
          "7 trạng thái vận hành: lấy hàng, nhập kho gửi, luân chuyển, nhập kho giao, đang giao và giao không thành công.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Nhập kho - Luân chuyển - Đang giao" screen="nhap-kho-luan-chuyen">
      <Page />
    </ProtectedPage>
  ),
});

type Stage =
  | "PICKED"
  | "WH_IN"
  | "TRANSFER_PENDING"
  | "TRANSFERRING"
  | "DEST_WH_IN"
  | "DELIVERING"
  | "FAILED";

const TABS: { key: Stage; label: string; hint: string; action?: string; next?: Stage }[] = [
  {
    key: "PICKED",
    label: "Lấy hàng thành công",
    hint: "Shipper đã lấy hàng thành công từ người gửi nhưng chưa mang về nhập kho",
    action: "Nhập kho gửi",
    next: "WH_IN",
  },
  {
    key: "WH_IN",
    label: "Nhập kho gửi",
    hint: "Điều phối xác nhận nhập kho khi nhận hàng từ khách/shipper",
    action: "Gán lên xe",
    next: "TRANSFER_PENDING",
  },
  {
    key: "TRANSFER_PENDING",
    label: "Đợi trung chuyển giao",
    hint: "Điều phối quét và tạo phiên luân chuyển tạm, chưa xác nhận xuất lên xe",
    action: "Xác nhận xuất lên xe",
    next: "TRANSFERRING",
  },
  {
    key: "TRANSFERRING",
    label: "Đang trung chuyển giao",
    hint: "Đã xác nhận xuất lên xe, hàng đang trên đường luân chuyển",
    action: "Quét nhập kho giao",
    next: "DEST_WH_IN",
  },
  {
    key: "DEST_WH_IN",
    label: "Nhập kho giao",
    hint: "Đơn đã nhập kho tại bưu cục giao, chờ bàn giao shipper đi giao",
    action: "Bàn giao shipper",
    next: "DELIVERING",
  },
  {
    key: "DELIVERING",
    label: "Đang giao hàng",
    hint: "Đơn hàng đã bàn giao cho shipper đi giao tận nhà cho khách",
    action: "Giao thành công",
  },
  {
    key: "FAILED",
    label: "Giao hàng không thành công",
    hint: "Shipper giao không thành công trả về bưu cục, hoặc khách không đến bưu cục nhận",
    action: "Giao lại",
    next: "DELIVERING",
  },
];

const STAGE_STATUS: Record<Stage, Order["status"]> = {
  PICKED: "CONFIRMED",
  WH_IN: "CONFIRMED",
  TRANSFER_PENDING: "WAITING",
  TRANSFERRING: "IN_TRANSIT",
  DEST_WH_IN: "AT_DEST",
  DELIVERING: "OUT_FOR_DELIVERY",
  FAILED: "FAILED_DELIVERY",
};

function deriveStage(o: Order): Stage | null {
  if (["DELIVERED", "CANCELLED", "RETURNED", "RETURNING", "DRAFT"].includes(o.status)) return null;
  switch (o.status) {
    case "FAILED_DELIVERY":
      return "FAILED";
    case "OUT_FOR_DELIVERY":
      return "DELIVERING";
    case "AT_DEST":
      return "DEST_WH_IN";
    case "IN_TRANSIT":
      return "TRANSFERRING";
    case "WAITING":
      return "TRANSFER_PENDING";
    default:
      break;
  }
  if (o.pickedUpAt) return "WH_IN";
  if (o.homePickup && o.pickingAt) return "PICKED";
  // Đơn còn chờ bàn giao (lấy tận nơi / khách quét QR tại bưu cục) chưa vào kho
  if (o.homePickup || o.qrDropOff) return null;
  // Đơn tạo tại quầy → đã có hàng tại kho gửi
  if (o.status === "CONFIRMED") return "WH_IN";
  return null;

}

function stageOf(o: Order): Stage | null {
  const s = (o as Order & { stage?: Stage }).stage;
  return s ?? deriveStage(o);
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const [tab, setTab] = useState<Stage>("PICKED");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printCode, setPrintCode] = useState<string | null>(null);

  const scopeAll = session?.role === "DH" || session?.role === "BL" || session?.role === "AD";

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!stageOf(o)) return false;
      if (!scopeAll && session?.office && o.fromOffice !== session.office && o.toOffice !== session.office)
        return false;
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(to + "T23:59:59")) return false;
      if (office && o.fromOffice !== office && o.toOffice !== office) return false;
      if (kw) {
        const hay =
          `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [orders, q, from, to, office, scopeAll, session]);

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, t) => ({ ...acc, [t.key]: base.filter((o) => stageOf(o) === t.key).length }),
        {} as Record<Stage, number>,
      ),
    [base],
  );

  const rows = useMemo(() => base.filter((o) => stageOf(o) === tab), [base, tab]);

  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const unpaid = rows.reduce(
      (s, r) => s + Math.max(0, r.fare + (r.pickupFee ?? 0) - (r.paidAmount ?? 0)),
      0,
    );
    return { orders: rows.length, qty, weight, paid, unpaid };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) => setSelected(v ? new Set(rows.map((r) => r.code)) : new Set());
  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code);
      else next.delete(code);
      return next;
    });

  const move = (codes: string[], next: Stage, detail: string) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        stage: next,
        status: STAGE_STATUS[next],
        updatedAt: at,
        ...(next === "WH_IN" && !o.pickedUpAt ? { pickedUpAt: at } : {}),
        events: [...(o.events ?? []), { at, by, action: next, detail }],
      } as Partial<Order>);
      st.audit({ action: next, entityType: "order", entityId: code, detail });
    }
    setSelected(new Set());
    toast.success(`${detail} · ${codes.length} đơn`);
  };

  const deliver = (codes: string[]) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        stage: undefined,
        status: "DELIVERED",
        updatedAt: at,
        events: [
          ...(o.events ?? []),
          { at, by, action: "DELIVERED", detail: "Giao hàng thành công" },
        ],
      } as Partial<Order>);
      st.audit({
        action: "DELIVERED",
        entityType: "order",
        entityId: code,
        detail: "Giao hàng thành công",
      });
    }
    setSelected(new Set());
    toast.success(`Đã giao thành công ${codes.length} đơn`);
  };

  const fail = (codes: string[]) =>
    move(codes, "FAILED", "Giao không thành công, trả về bưu cục");

  const activeTab = TABS.find((t) => t.key === tab)!;

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCodes, setAssignCodes] = useState<string[]>([]);
  const [pickedTrip, setPickedTrip] = useState<string>("");
  const trips = useStore((s) => s.trips);
  const [assignDate, setAssignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vthkTrips, setVthkTrips] = useState<AvailableTrip[]>([]);
  const [loadingVthk, setLoadingVthk] = useState(false);
  const { branchNames, itinerariesForBranchName, itineraryCodeOf } = useBranchItineraryMaster();

  const availableTrips = useMemo(
    () =>
      trips
        .filter((t) => t.status === "CREATED" || t.status === "LOADING")
        .map((t) => {
          const assigned = orders.filter((o) => o.tripCode === t.code);
          return {
            ...t,
            kg: assigned.reduce((s, o) => s + (o.weightKg ?? 0), 0) + (t.loaded ?? 0) * 4.5,
            count: assigned.length + (t.loaded ?? 0),
          };
        })
        .sort((a, b) => new Date(a.departAt).getTime() - new Date(b.departAt).getTime()),
    [trips, orders],
  );

  const [fTuyen, setFTuyen] = useState("all");
  const [fRoute, setFRoute] = useState("all");
  const [fSlot, setFSlot] = useState("all");

  useEffect(() => {
    if (!assignOpen || !isApiEnabled()) {
      setVthkTrips([]);
      return;
    }
    if (fTuyen === "all" || fRoute === "all" || !assignDate) {
      setVthkTrips([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVthk(true);
      try {
        const domain = await import("@/lib/api/domain-api");
        const code = itineraryCodeOf(fTuyen, fRoute) ?? fRoute;
        const items = await domain.searchAvailableTrips({
          date: assignDate,
          itineraryCode: code,
          timeSlot: fSlot === "all" ? undefined : fSlot,
        });
        if (!cancelled) setVthkTrips(items);
      } catch (e: any) {
        if (!cancelled) {
          setVthkTrips([]);
          toast.error(e?.message || "Không tải được xe khả dụng từ VTHK");
        }
      } finally {
        if (!cancelled) setLoadingVthk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignOpen, assignDate, fTuyen, fRoute, fSlot, itineraryCodeOf]);

  const tuyenOptions = useMemo(() => {
    return Array.from(new Set([...branchNames])).sort((a, b) => a.localeCompare(b, "vi"));
  }, [branchNames]);

  const routeOptions = useMemo(() => {
    if (fTuyen !== "all") {
      const fromMaster = itinerariesForBranchName(fTuyen);
      if (fromMaster.length) return fromMaster;
    }
    return Array.from(
      new Set(
        availableTrips
          .filter((t) => fTuyen === "all" || matchTuyen(t.route, fTuyen))
          .map((t) => t.route),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [availableTrips, fTuyen, itinerariesForBranchName]);

  const filteredTrips = useMemo(() => {
    if (isApiEnabled() && fTuyen !== "all" && fRoute !== "all") {
      return vthkTrips.map((t) => ({
        code: t.externalTripId,
        bks: t.vehiclePlate?.trim() || "Chưa gán biển",
        driver: t.driverName?.trim() || "Chưa gán tài",
        route: t.routeLabel ?? fRoute,
        departAt: t.departAt,
        kg: Number(t.usedKg ?? 0),
        count: Number(t.usedOrderCount ?? 0),
        assignVehiclePlate: t.assignVehiclePlate || t.vehiclePlate || `CH${t.externalTripId}`,
        assignDriverName: t.assignDriverName || t.driverName || "Chưa gán tài",
        fromVthk: true as const,
      }));
    }
    return availableTrips.filter((t) => {
      if (fTuyen !== "all" && !matchTuyen(t.route, fTuyen)) return false;
      if (fRoute !== "all" && !matchLoTrinh(t.route, fRoute)) return false;
      if (fSlot !== "all" && slotOf(t.departAt) !== fSlot) return false;
      return true;
    });
  }, [availableTrips, fTuyen, fRoute, fSlot, vthkTrips]);

  const assignRows = useMemo(
    () => orders.filter((o) => assignCodes.includes(o.code)),
    [orders, assignCodes],
  );

  const tripRouteCodeForBranch = (branchName: string): string => {
    const MAP: Record<string, string> = {
      "Nam Định": "GP-ND",
      "Ninh Bình": "GP-NB",
      "Việt Trì": "GP-VT",
      "Thái Bình": "NB-TB",
      "Phú Thọ": "GP-VT",
      "Yên Bái": "GP-ND",
    };
    return MAP[branchName] ?? "GP-ND";
  };

  const confirmAssign = async () => {
    const trip = filteredTrips.find((t) => t.code === pickedTrip) as
      | (typeof filteredTrips)[number]
      | undefined;
    if (!trip) return;

    if (isApiEnabled() && "fromVthk" in trip && trip.fromVthk) {
      try {
        const domain = await import("@/lib/api/domain-api");
        const { syncOrdersFromApi, syncTripsFromApi } = await import("@/lib/api/sync");
        const office = useStore.getState().session?.office;
        const officeCode = office && office !== "ALL" ? office : "GP";
        const created = await domain.createTrip({
          officeCode,
          routeCode: tripRouteCodeForBranch(fTuyen === "all" ? "Ninh Bình" : fTuyen),
          vehiclePlate: (trip as any).assignVehiclePlate,
          driverName: (trip as any).assignDriverName,
          departAt: trip.departAt,
        });
        await domain.assignOrdersToTrip(created.code, assignCodes);
        const st = useStore.getState();
        const by = st.session?.username ?? "system";
        const at = new Date().toISOString();
        for (const code of assignCodes) {
          const o = st.orders.find((x) => x.code === code);
          if (!o) continue;
          st.updateOrder(code, {
            stage: "TRANSFER_PENDING",
            status: STAGE_STATUS.TRANSFER_PENDING,
            tripCode: created.code,
            updatedAt: at,
            events: [
              ...(o.events ?? []),
              {
                at,
                by,
                action: "ASSIGN_TRIP",
                detail: `Gán lên xe ${trip.bks} (${created.code}) - tài xế ${trip.driver}`,
              },
            ],
          } as Partial<Order>);
        }
        await Promise.all([syncOrdersFromApi(), syncTripsFromApi()]);
        setAssignOpen(false);
        setPickedTrip("");
        setSelected(new Set());
        toast.success(`Đã gán ${assignCodes.length} đơn lên xe ${trip.bks}`);
        return;
      } catch (e: any) {
        toast.error(e?.message || "Không gán được chuyến trên máy chủ");
        return;
      }
    }

    const local = availableTrips.find((t) => t.code === pickedTrip);
    if (!local) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of assignCodes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        stage: "TRANSFER_PENDING",
        status: STAGE_STATUS.TRANSFER_PENDING,
        tripCode: local.code,
        updatedAt: at,
        events: [
          ...(o.events ?? []),
          {
            at,
            by,
            action: "ASSIGN_TRIP",
            detail: `Gán lên xe ${local.bks} (${local.code}) - tài xế ${local.driver}`,
          },
        ],
      } as Partial<Order>);
      st.audit({
        action: "ASSIGN_TRIP",
        entityType: "order",
        entityId: code,
        detail: `Gán lên xe ${local.bks}`,
      });
    }
    setAssignOpen(false);
    setPickedTrip("");
    setSelected(new Set());
    toast.success(`Đã gán ${assignCodes.length} đơn lên xe ${local.bks}`);
  };

  const runAction = (codes: string[]) => {
    if (!codes.length) return;
    if (tab === "WH_IN") {
      setAssignCodes(codes);
      setPickedTrip("");
      setAssignOpen(true);
      return;
    }
    if (tab === "DELIVERING") return deliver(codes);
    if (activeTab.next) move(codes, activeTab.next, activeTab.label + " → " + activeTab.action);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={t.key === tab ? "default" : "outline"}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
          >
            {t.label} ({counts[t.key] ?? 0})
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={ClipboardList} label="Đơn hàng" value={String(metrics.orders)} />
        <Kpi icon={Package} label="Số kiện" value={String(metrics.qty)} />
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} kg`} />
        <Kpi icon={Banknote} label="Tiền đã thu" value={formatVND(metrics.paid)} />
        <Kpi icon={Banknote} label="Tiền chưa thu" value={formatVND(metrics.unpaid)} />
      </div>

      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-4">
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
              value={office || "all"}
              onValueChange={(v) => setOffice(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tìm kiếm</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Mã đơn, SĐT, tên khách"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={`${activeTab.label} (${rows.length})`}
        right={
          <div className="flex gap-2">
            {tab === "DELIVERING" && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={selected.size === 0}
                onClick={() => fail([...selected])}
              >
                <XCircle className="h-4 w-4" />
                Giao thất bại ({selected.size})
              </Button>
            )}
            {activeTab.action && (
              <Button
                className="gap-2"
                disabled={selected.size === 0}
                onClick={() => runAction([...selected])}
              >
                {tab === "DELIVERING" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : tab === "TRANSFER_PENDING" || tab === "TRANSFERRING" ? (
                  <Truck className="h-4 w-4" />
                ) : (
                  <Warehouse className="h-4 w-4" />
                )}
                {activeTab.action} ({selected.size})
              </Button>
            )}
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Không có đơn trong mục này</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Cập nhật</th>
                  <th className="px-2 py-2">Người gửi</th>
                  <th className="px-2 py-2">Người nhận</th>
                  <th className="px-2 py-2">VP gửi → VP nhận</th>
                  <th className="px-2 py-2">Chuyến</th>
                  {tab !== "WH_IN" && <th className="px-2 py-2">Trạng thái</th>}
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={selected.has(r.code)}
                        onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                        aria-label={`Chọn ${r.code}`}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium">
                      {r.code}
                      {r.homeDelivery && (
                        <Badge variant="secondary" className="ml-2">
                          Giao tận nơi
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(r.updatedAt ?? r.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <div>{r.senderName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{r.senderPhone}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div>{r.receiverName}</div>
                      <div className="text-xs text-muted-foreground">{r.receiverPhone}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {officeName(r.fromOffice)} → {officeName(r.toOffice)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.tripCode ?? "-"}</td>
                    {tab !== "WH_IN" && (
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Badge variant="outline">{ORDER_STATUS_LABEL[r.status]}</Badge>
                      </td>
                    )}
                    <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                    <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                    <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="In tem đơn hàng"
                          onClick={() => setPrintCode(r.code)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        {tab === "DELIVERING" && (
                          <Button size="sm" variant="ghost" onClick={() => fail([r.code])}>
                            Thất bại
                          </Button>
                        )}
                        {activeTab.action && (
                          <Button size="sm" variant="outline" onClick={() => runAction([r.code])}>
                            {activeTab.action}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <PrintLabelDialog
        code={printCode}
        open={!!printCode}
        onOpenChange={(v) => !v && setPrintCode(null)}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Gán lên xe</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Ngày đi</Label>
                <Input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tuyến</Label>
                <SearchableSelect
                  value={fTuyen}
                  onValueChange={(v) => {
                    setFTuyen(v);
                    setFRoute(v === "all" ? "all" : itinerariesForBranchName(v)[0] ?? "all");
                    setPickedTrip("");
                  }}
                  options={[
                    { value: "all", label: "Tất cả tuyến" },
                    ...tuyenOptions.map((t) => ({ value: t, label: t })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lộ trình</Label>
                <SearchableSelect
                  value={fRoute}
                  onValueChange={(v) => {
                    setFRoute(v);
                    setPickedTrip("");
                  }}
                  options={[
                    { value: "all", label: "Tất cả lộ trình" },
                    ...routeOptions.map((r) => ({ value: r, label: r })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Khung giờ</Label>
                <SearchableSelect
                  value={fSlot}
                  onValueChange={setFSlot}
                  options={[
                    { value: "all", label: "Tất cả khung giờ" },
                    ...ASSIGN_TIME_SLOTS.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Xe khả dụng ({filteredTrips.length})</Label>
              <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                {loadingVthk ? (
                  <EmptyState>Đang tải xe từ VTHK…</EmptyState>
                ) : filteredTrips.length === 0 ? (
                  <EmptyState>
                    {isApiEnabled() && (fTuyen === "all" || fRoute === "all")
                      ? "Chọn tuyến và lộ trình để xem xe VTHK"
                      : "Không có xe khả dụng"}
                  </EmptyState>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredTrips.map((t) => (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => setPickedTrip(t.code)}
                        className={`rounded-md border p-3 text-left transition ${
                          pickedTrip === t.code
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">{t.bks}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {t.driver} · {t.route}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Giờ đi {formatDateTime(t.departAt)}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="font-medium">{t.kg.toFixed(1)} kg</span>
                          <span className="text-muted-foreground">{t.count} đơn</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>


            <div>
              <Label className="text-xs">Đơn hàng đã chọn ({assignRows.length})</Label>
              <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-2 py-2">Mã đơn</th>
                      <th className="px-2 py-2">Người gửi</th>
                      <th className="px-2 py-2">Người nhận</th>
                      <th className="px-2 py-2">VP gửi → VP nhận</th>
                      <th className="px-2 py-2 text-right">Kiện</th>
                      <th className="px-2 py-2 text-right">KL</th>
                      <th className="px-2 py-2 text-right">Cước</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignRows.map((r) => (
                      <tr key={r.code} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium">{r.code}</td>
                        <td className="px-2 py-2">{r.senderName ?? r.senderPhone}</td>
                        <td className="px-2 py-2">{r.receiverName}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {officeName(r.fromOffice)} → {officeName(r.toOffice)}
                        </td>
                        <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                        <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                        <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-right text-xs text-muted-foreground">
                Tổng khối lượng:{" "}
                {assignRows.reduce((s, r) => s + (r.weightKg ?? 0), 0).toFixed(1)} kg
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={!pickedTrip} onClick={confirmAssign}>
              Xác nhận gán lên xe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-base font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
