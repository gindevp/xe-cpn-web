import { Fragment, useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatVND,
  formatDateTime,
  officeName,
  canonicalOfficeCode,
  type Order,
} from "@/lib/mock-data";
import { estimateShipperFare } from "@/lib/pricing";
import { useStore, type TripX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useOrdersPolling } from "@/lib/use-orders-poll";
import { toast } from "sonner";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { EditOrderBriefDialog, EditPackageDialog } from "@/components/EditPackageDialog";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OrderPackageListRow } from "@/components/OrderPackageListRow";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Search,
  Warehouse,
  CheckCircle2,
  XCircle,
  Unlink,
  ChevronDown,
  Printer,
  Pencil,
  Trash2,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { AssignVehiclePicker, findOpenTripByPlate, realDriverName, realVehiclePlate, tripItineraryLabel, type AssignVehiclePick } from "@/components/AssignVehiclePicker";
import { applyPackageRemove, packageCode, packageCount, warehouseInSeqs } from "@/lib/package-label";
import {
  adminOfficeSelectOptions,
  assignedOfficeCode,
  hasAllOfficeScope,
  resolveViewOffice,
  VIEW_ALL_OFFICES,
} from "@/lib/office-scope";

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
    hint: "Đơn đã gán lên xe, chờ bốc xếp lên hàng. Click biển số để xem các đơn trong xe.",
  },
  {
    key: "TRANSFERRING",
    label: "Hàng trên xe",
    hint: "Đơn tài xế đã bốc lên xe. VP gửi xem hàng đi; VP nhận xem hàng đang tới (nút Xe đang tới).",
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

/** Tab phía VP nhận (kho giao / đang giao / fail). Còn lại = phía VP gửi. */
const DEST_PIPELINE_TABS = new Set<Stage>(["DEST_WH_IN", "DELIVERING", "FAILED"]);

function isDestPipelineTab(tab: Stage) {
  return DEST_PIPELINE_TABS.has(tab);
}

/** VP nhận thật: finalToOffice khi có (đơn qua hub), ngược lại toOffice. */
function orderReceiverOffice(o: Order): string {
  return (o.finalToOffice || o.toOffice || "").trim();
}

function officeCodeEq(a?: string | null, b?: string | null): boolean {
  const x = canonicalOfficeCode(a) || (a ?? "").trim();
  const y = canonicalOfficeCode(b) || (b ?? "").trim();
  if (!x || !y) return false;
  return x === y || x.toUpperCase() === y.toUpperCase();
}

/** Lọc đúng vai trò VP theo tab: nguồn → VP gửi; đích → VP nhận.
 *  Hàng trên xe: VP gửi thấy hàng đi; VP nhận thấy hàng đang tới mình. */
function orderMatchesTabOffice(o: Order, tab: Stage, scoped: string): boolean {
  if (!scoped || scoped === VIEW_ALL_OFFICES) return true;
  if (isDestPipelineTab(tab)) {
    return officeCodeEq(orderReceiverOffice(o), scoped);
  }
  if (tab === "TRANSFERRING") {
    return officeCodeEq(o.fromOffice, scoped) || officeCodeEq(orderReceiverOffice(o), scoped);
  }
  return officeCodeEq(o.fromOffice, scoped);
}

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
  // Terminal statuses leave the pipeline even if forwardStage was never cleared.
  if (["DELIVERED", "CANCELLED", "RETURNED", "RETURNING", "DRAFT"].includes(o.status)) return null;
  const s = (o as Order & { stage?: Stage }).stage;
  return s ?? deriveStage(o);
}

function matchesPipelineTab(o: Order, tab: Stage, stage: Stage | null): boolean {
  if (tab === "DEST_WH_IN") {
    return stage === "DEST_WH_IN" || (stage === "TRANSFERRING" && warehouseInSeqs(o).length > 0);
  }
  if (tab === "TRANSFERRING") {
    // Chỉ ẩn khỏi xe khi đã nhập kho giao đủ mọi kiện (không ẩn sớm khi nhập 1 phần).
    return stage === "TRANSFERRING" && warehouseInSeqs(o).length < packageCount(o);
  }
  return stage === tab;
}

const UNASSIGNED_PLATE = "Chưa gán biển";

function plateOf(order: Order, tripByCode: Map<string, TripX>): { key: string; plate: string } {
  const trip = order.tripCode ? tripByCode.get(order.tripCode) : undefined;
  // Ưu tiên biển trên đơn (API luôn trả) — store.trips của VP bị lọc theo VP nên hay thiếu chuyến → trước đây fallback ra mã chuyến.
  const plate =
    realVehiclePlate(order.vehiclePlate) ||
    realVehiclePlate(trip?.bks);
  if (plate) return { key: plate.toUpperCase(), plate };
  if (order.tripCode) return { key: `trip:${order.tripCode}`, plate: order.tripCode };
  return { key: UNASSIGNED_PLATE, plate: UNASSIGNED_PLATE };
}

type VehicleGroup = {
  key: string;
  plate: string;
  tripCodes: string[];
  driver?: string;
  route?: string;
  orders: Order[];
  qty: number;
  weight: number;
};

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const admin = hasAllOfficeScope(session);
  const viewOffice = resolveViewOffice(session, viewOfficeRaw);

  const [tab, setTab] = useState<Stage>("PICKED");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<{
    code: string;
    packageSeq?: number;
    batchPackages?: boolean;
  } | null>(null);
  const [editOrderCode, setEditOrderCode] = useState<string | null>(null);
  const [editPkg, setEditPkg] = useState<{ code: string; seq: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    null | { type: "order"; code: string } | { type: "package"; code: string; seq: number }
  >(null);
  const [expandedPlates, setExpandedPlates] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [inboundPlatesOpen, setInboundPlatesOpen] = useState(false);

  const updateOrder = useStore((s) => s.updateOrder);
  const transitionOrder = useStore((s) => s.transitionOrder);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "order") {
      const res = transitionOrder(deleteTarget.code, "CANCELLED", "CANCEL", "Xóa từ nhập kho luân chuyển");
      if (res.ok) toast.success(`Đã xóa (huỷ) đơn ${deleteTarget.code}`);
      else toast.error(res.error);
    } else {
      const order = useStore.getState().orders.find((o) => o.code === deleteTarget.code);
      if (!order) {
        toast.error("Không tìm thấy đơn");
      } else {
        const result = applyPackageRemove(order, deleteTarget.seq);
        if (!result.ok) toast.error(result.error);
        else {
          updateOrder(
            order.code,
            result.patch,
            {
              eventAction: "PACKAGE_REMOVE",
              eventDetail: `Xóa ${packageCode(order.code, deleteTarget.seq)}`,
            },
          );
          toast.success(`Đã xóa kiện ${packageCode(order.code, deleteTarget.seq)}`);
        }
      }
    }
    setDeleteTarget(null);
  };

  // VP nhận quét / nhập kho giao → tab Hàng trên xe của VP gửi tự cập nhật.
  useOrdersPolling(8000);

  const toggleOrderPkgs = (code: string) => {
    setExpandedOrders((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  };

  const tripByCode = useMemo(() => {
    const m = new Map<string, TripX>();
    for (const t of trips) m.set(t.code, t);
    return m;
  }, [trips]);

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!stageOf(o)) return false;
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(to + "T23:59:59")) return false;
      if (kw) {
        const trip = o.tripCode ? tripByCode.get(o.tripCode) : undefined;
        const hay =
          `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""} ${o.tripCode ?? ""} ${o.vehiclePlate ?? ""} ${trip?.bks ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [orders, q, from, to, tripByCode]);

  const scopedOffice = assignedOfficeCode(viewOffice);

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, t) => ({
          ...acc,
          [t.key]: base.filter(
            (o) => matchesPipelineTab(o, t.key, stageOf(o)) && orderMatchesTabOffice(o, t.key, scopedOffice),
          ).length,
        }),
        {} as Record<Stage, number>,
      ),
    [base, scopedOffice],
  );

  const rows = useMemo(
    () =>
      base.filter(
        (o) => matchesPipelineTab(o, tab, stageOf(o)) && orderMatchesTabOffice(o, tab, scopedOffice),
      ),
    [base, tab, scopedOffice],
  );

  const vehicleGroups = useMemo(() => {
    const map = new Map<string, VehicleGroup>();
    for (const o of rows) {
      const { key, plate } = plateOf(o, tripByCode);
      const trip = o.tripCode ? tripByCode.get(o.tripCode) : undefined;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          plate,
          tripCodes: [],
          orders: [],
          qty: 0,
          weight: 0,
          driver: trip?.driver,
          route: trip?.route,
        };
        map.set(key, g);
      }
      g.orders.push(o);
      // Hàng trên xe: kiện còn lại chưa nhập kho giao. Đợi trung chuyển: tổng kiện đã gán.
      const pkgs =
        tab === "TRANSFERRING"
          ? Math.max(0, packageCount(o) - warehouseInSeqs(o).length)
          : packageCount(o);
      g.qty += pkgs;
      g.weight += o.weightKg ?? 0;
      if (o.tripCode && !g.tripCodes.includes(o.tripCode)) g.tripCodes.push(o.tripCode);
      if (!g.driver && trip?.driver) g.driver = trip.driver;
      if (!g.route && trip?.route) g.route = trip.route;
    }
    return [...map.values()]
      .filter((g) => g.orders.length > 0 && g.qty > 0)
      .sort((a, b) => a.plate.localeCompare(b.plate, "vi"));
  }, [rows, tripByCode, tab]);

  /** Xe đang mang hàng tới VP đang xem — chỉ đếm đơn/kiện giao tới VP đó. */
  const inboundPlateSummary = useMemo(() => {
    if (!scopedOffice) return [];
    const map = new Map<
      string,
      { key: string; plate: string; driver?: string; orderCount: number; packageCount: number }
    >();
    for (const o of base) {
      if (!matchesPipelineTab(o, "TRANSFERRING", stageOf(o))) continue;
      if (!officeCodeEq(orderReceiverOffice(o), scopedOffice)) continue;
      const remaining = Math.max(0, packageCount(o) - warehouseInSeqs(o).length);
      if (remaining <= 0) continue;
      const { key, plate } = plateOf(o, tripByCode);
      const trip = o.tripCode ? tripByCode.get(o.tripCode) : undefined;
      let g = map.get(key);
      if (!g) {
        g = { key, plate, driver: trip?.driver, orderCount: 0, packageCount: 0 };
        map.set(key, g);
      }
      g.orderCount += 1;
      g.packageCount += remaining;
      if (!g.driver && trip?.driver) g.driver = trip.driver;
    }
    return [...map.values()].sort((a, b) => a.plate.localeCompare(b.plate, "vi"));
  }, [base, scopedOffice, tripByCode]);

  const inboundTotals = useMemo(
    () => ({
      vehicles: inboundPlateSummary.length,
      orders: inboundPlateSummary.reduce((s, x) => s + x.orderCount, 0),
      packages: inboundPlateSummary.reduce((s, x) => s + x.packageCount, 0),
    }),
    [inboundPlateSummary],
  );

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
    const targetStatus = STAGE_STATUS[next];
    let okCount = 0;
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;

      // Status-changing pipeline steps must hit BE transition (not only local + forwardStage).
      if (
        targetStatus &&
        o.status !== targetStatus &&
        (targetStatus === "OUT_FOR_DELIVERY" ||
          targetStatus === "FAILED_DELIVERY" ||
          targetStatus === "AT_DEST")
      ) {
        const tr = st.transitionOrder(code, targetStatus, next, detail);
        if (!tr.ok) {
          toast.error(`${code}: ${tr.error}`);
          continue;
        }
        // Keep pipeline tab key in sync (forwardStage); status already pushed via transitionOrder.
        useStore.setState((s) => ({
          orders: s.orders.map((x) => (x.code === code ? { ...x, stage: next, updatedAt: at } : x)),
        }));
        void import("@/lib/api/domain-api")
          .then((domain) => domain.forwardStage(code, next))
          .catch((e: any) => toast.error(e?.message || `Không cập nhật stage ${code}`));
        okCount++;
        continue;
      }

      st.updateOrder(code, {
        stage: next,
        status: targetStatus,
        updatedAt: at,
        ...(next === "WH_IN" && !o.pickedUpAt ? { pickedUpAt: at } : {}),
        events: [...(o.events ?? []), { at, by, action: next, detail }],
      } as Partial<Order>);
      st.audit({ action: next, entityType: "order", entityId: code, detail });
      okCount++;
    }
    setSelected(new Set());
    if (okCount) toast.success(`${detail} · ${okCount} đơn`);
  };

  const deliver = (codes: string[]) => {
    if (!codes.length) return;
    const st = useStore.getState();
    let okCount = 0;
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      // Must use transitionOrder → pushOrderTransition → POST /api/orders/{code}/transition
      // (updateOrder alone only patched local Zustand; F5 reloaded OUT_FOR_DELIVERY from BE).
      const tr = st.transitionOrder(code, "DELIVERED", "DELIVERED", "Giao hàng thành công");
      if (!tr.ok) {
        toast.error(`${code}: ${tr.error}`);
        continue;
      }
      okCount++;
    }
    setSelected(new Set());
    if (okCount) toast.success(`Đã giao thành công ${okCount} đơn`);
  };

  const fail = (codes: string[]) =>
    move(codes, "FAILED", "Giao không thành công, trả về bưu cục");

  const activeTab = TABS.find((t) => t.key === tab)!;

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCodes, setAssignCodes] = useState<string[]>([]);
  const [assignPick, setAssignPick] = useState<AssignVehiclePick>(null);
  const [unassigning, setUnassigning] = useState(false);

  const assignRows = useMemo(
    () => orders.filter((o) => assignCodes.includes(o.code)),
    [orders, assignCodes],
  );

  const confirmAssign = async () => {
    if (!assignPick) {
      toast.error("Vui lòng chọn xe");
      return;
    }
    try {
      const domain = await import("@/lib/api/domain-api");
      const { syncOrdersFromApi, syncTripsFromApi, resolveOfficeCodeStrict } = await import("@/lib/api/sync");
      const { resolveTripRouteCode } = await import("@/lib/api/trip-route");
      const sessionOffice = assignedOfficeCode(
        resolveViewOffice(useStore.getState().session, useStore.getState().viewOffice),
      );
      const officeCode =
        (sessionOffice && sessionOffice !== "ALL" ? resolveOfficeCodeStrict(sessionOffice) : null) ||
        useStore.getState().offices[0]?.code ||
        "";
      if (!officeCode) {
        toast.error("Chưa có văn phòng trên hệ thống");
        return;
      }
      const plate =
        assignPick.tab === "vthk"
          ? realVehiclePlate(assignPick.trip.vehiclePlate)
          : assignPick.plate;
      const driverName =
        assignPick.tab === "vthk"
          ? realDriverName(assignPick.trip.driverName)
          : assignPick.driver;
      const routeCode = await resolveTripRouteCode({
        branchName: assignPick.branchName,
        routeHint: assignPick.tab === "vthh" ? assignPick.route : undefined,
        orders: assignRows,
      });
      const itineraryLabel = tripItineraryLabel(assignPick);
      if (!routeCode) {
        toast.error("Không xác định được tuyến cho xe đã chọn");
        return;
      }
      if (assignPick.tab === "vthh" && !plate?.trim()) {
        toast.error("Xe đã chọn chưa có biển số");
        return;
      }

      const listed = plate
        ? await domain.listTrips({ keyword: plate, size: 50 }).catch(() => [])
        : [];
      const existing = plate
        ? findOpenTripByPlate(listed, plate) ?? findOpenTripByPlate(useStore.getState().trips, plate)
        : undefined;

      const trip =
        existing ??
        (await domain.createTrip({
          officeCode,
          routeCode,
          ...(itineraryLabel ? { itineraryLabel } : {}),
          ...(plate ? { vehiclePlate: plate } : {}),
          vehicleId: assignPick.tab === "vthh" ? assignPick.vehicleId : undefined,
          ...(driverName ? { driverName } : {}),
          departAt: assignPick.tab === "vthk" ? assignPick.trip.departAt : assignPick.departAt,
        }));
      await domain.assignOrdersToTrip(trip.code, assignCodes, itineraryLabel);
      const at = new Date().toISOString();
      const assigned = new Set(assignCodes);
      const tripForStore = {
        ...trip,
        bks: realVehiclePlate(trip.bks) || plate,
        driver: realDriverName(trip.driver) || driverName,
        route: itineraryLabel || trip.route,
      };
      useStore.setState((st) => ({
        trips: [tripForStore, ...st.trips.filter((t) => t.code !== trip.code)],
        orders: st.orders.map((o) =>
          assigned.has(o.code)
            ? {
                ...o,
                stage: "TRANSFER_PENDING",
                tripCode: trip.code,
                vehiclePlate: realVehiclePlate(tripForStore.bks) || o.vehiclePlate,
                updatedAt: at,
              }
            : o,
        ),
      }));
      await Promise.all([syncOrdersFromApi(), syncTripsFromApi()]);
      useStore.setState((st) => ({
        trips: st.trips.some((t) => t.code === tripForStore.code)
          ? st.trips.map((t) =>
              t.code === tripForStore.code
                ? { ...t, bks: realVehiclePlate(t.bks) || tripForStore.bks, driver: realDriverName(t.driver) || tripForStore.driver, route: tripForStore.route || t.route }
                : t,
            )
          : [tripForStore, ...st.trips],
      }));
      setAssignOpen(false);
      setSelected(new Set());
      setTab("TRANSFER_PENDING");
      toast.success(
        plate
          ? `Đã gán ${assignCodes.length} đơn lên xe ${plate}`
          : `Đã gán ${assignCodes.length} đơn lên chuyến (chưa có BKS/tài xế)`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Không gán được chuyến trên máy chủ");
    }
  };

  const unassignFromTrip = async (codes: string[]) => {
    if (!codes.length || unassigning) return;
    const candidates = orders.filter((o) => codes.includes(o.code) && o.tripCode);
    if (!candidates.length) {
      toast.error("Các đơn đã chọn chưa được gán chuyến");
      return;
    }

    setUnassigning(true);
    try {
      const domain = await import("@/lib/api/domain-api");
      const { syncOrdersFromApi, syncTripsFromApi } = await import("@/lib/api/sync");
      const results = await Promise.allSettled(
        candidates.map((o) => domain.removeOrderFromTrip(o.tripCode!, o.code)),
      );
      const removed = new Set(
        candidates.filter((_, index) => results[index].status === "fulfilled").map((o) => o.code),
      );
      const failed = candidates.length - removed.size;
      const at = new Date().toISOString();

      if (removed.size) {
        useStore.setState((st) => ({
          orders: st.orders.map((o) =>
            removed.has(o.code)
              ? { ...o, stage: "WH_IN", tripCode: undefined, updatedAt: at }
              : o,
          ),
        }));
      }

      await Promise.all([syncOrdersFromApi(), syncTripsFromApi()]);
      setSelected(new Set());
      if (removed.size) toast.success(`Đã gỡ ${removed.size} đơn khỏi xe`);
      if (failed) toast.error(`${failed} đơn không gỡ được khỏi xe`);
    } catch (e: any) {
      toast.error(e?.message || "Không gỡ được đơn khỏi xe");
    } finally {
      setUnassigning(false);
    }
  };

  const runAction = (codes: string[]) => {
    if (!codes.length) return;
    if (tab === "TRANSFERRING") return;
    if (tab === "WH_IN") {
      setAssignCodes(codes);
      setAssignPick(null);
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
              setExpandedPlates(new Set());
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
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} KG`} />
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
            <Label className="text-xs">
              {isDestPipelineTab(tab) ? "Văn phòng nhận" : "Văn phòng gửi"}
            </Label>
            <SearchableSelect
              value={viewOffice}
              onValueChange={setViewOffice}
              disabled={!admin}
              placeholder="Chọn văn phòng"
              options={
                admin
                  ? adminOfficeSelectOptions(offices)
                  : offices.map((o) => ({ value: o.code, label: o.name }))
              }
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
                placeholder={
                  tab === "TRANSFERRING" || tab === "TRANSFER_PENDING"
                    ? "BKS, mã chuyến, mã đơn, SĐT, tên khách"
                    : "Mã đơn, SĐT, tên khách"
                }
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={
          tab === "TRANSFERRING" || tab === "TRANSFER_PENDING"
            ? `${activeTab.label} (${vehicleGroups.length} xe · ${rows.length} đơn)`
            : `${activeTab.label} (${rows.length})`
        }
        right={
          tab === "TRANSFERRING" ? (
            scopedOffice ? (
              <Button variant="outline" className="gap-2" onClick={() => setInboundPlatesOpen(true)}>
                <Eye className="h-4 w-4" />
                Xe đang tới ({inboundTotals.vehicles} BKS · {inboundTotals.orders} đơn ·{" "}
                {inboundTotals.packages} kiện)
              </Button>
            ) : undefined
          ) : (
          <div className="flex gap-2">
            {tab === "TRANSFER_PENDING" && (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={selected.size === 0 || unassigning}
                onClick={() => void unassignFromTrip([...selected])}
              >
                <Unlink className="h-4 w-4" />
                {unassigning ? "Đang gỡ…" : `Gỡ khỏi xe (${selected.size})`}
              </Button>
            )}
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
                ) : (
                  <Warehouse className="h-4 w-4" />
                )}
                {activeTab.action} ({selected.size})
              </Button>
            )}
          </div>
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Không có đơn trong mục này</EmptyState>
        ) : tab === "TRANSFERRING" || tab === "TRANSFER_PENDING" ? (
          <div className="space-y-2">
            {vehicleGroups.map((g) => {
              const open = expandedPlates.has(g.key);
              const nestedColSpan = tab === "TRANSFER_PENDING" ? 11 : 10;
              return (
                <Collapsible
                  key={g.key}
                  open={open}
                  onOpenChange={(next) =>
                    setExpandedPlates((prev) => {
                      const n = new Set(prev);
                      if (next) n.add(g.key);
                      else n.delete(g.key);
                      return n;
                    })
                  }
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border bg-muted/30 px-3 py-3 text-left hover:bg-muted/50",
                        open && "rounded-b-none",
                      )}
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold tracking-wide">{g.plate}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[g.driver, g.route].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                        <div>
                          {g.orders.length} đơn · {g.qty} kiện
                          {tab === "TRANSFERRING" ? " còn trên xe" : ""}
                        </div>
                        <div>{g.weight.toFixed(1)} KG</div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="overflow-x-auto rounded-b-md border-x border-b">
                      <table className="w-full min-w-[960px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                            {tab === "TRANSFER_PENDING" ? (
                              <th className="w-10 px-2 py-2">
                                <Checkbox
                                  checked={g.orders.length > 0 && g.orders.every((r) => selected.has(r.code))}
                                  onCheckedChange={(v) => {
                                    const on = Boolean(v);
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      for (const r of g.orders) {
                                        if (on) next.add(r.code);
                                        else next.delete(r.code);
                                      }
                                      return next;
                                    });
                                  }}
                                  aria-label={`Chọn tất cả đơn xe ${g.plate}`}
                                />
                              </th>
                            ) : null}
                            <th className="px-2 py-2">Mã đơn</th>
                            <th className="px-2 py-2">Cập nhật</th>
                            <th className="px-2 py-2">Người gửi</th>
                            <th className="px-2 py-2">Người nhận</th>
                            <th className="px-2 py-2">VP gửi → VP nhận</th>
                            <th className="px-2 py-2">Chuyến</th>
                            <th className="px-2 py-2 text-right">Kiện</th>
                            <th className="px-2 py-2 text-right">KL</th>
                            <th className="px-2 py-2 text-right">Cước</th>
                            <th className="px-2 py-2 text-right">Tác vụ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.orders.map((r) => (
                            <Fragment key={r.code}>
                              <tr className="border-b hover:bg-muted/40">
                                {tab === "TRANSFER_PENDING" ? (
                                  <td className="px-2 py-2">
                                    <Checkbox
                                      checked={selected.has(r.code)}
                                      onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                                      aria-label={`Chọn ${r.code}`}
                                    />
                                  </td>
                                ) : null}
                                <td className="px-2 py-2 font-medium">
                                  <span className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      className="inline-flex items-center text-left"
                                      title={expandedOrders.has(r.code) ? "Ẩn kiện" : "Xem kiện"}
                                      onClick={() => toggleOrderPkgs(r.code)}
                                    >
                                      <ChevronDown
                                        className={cn(
                                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                          expandedOrders.has(r.code) && "rotate-180",
                                        )}
                                      />
                                    </button>
                                    <OrderCodeLink code={r.code} />
                                  </span>
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
                                <td className="px-2 py-2 text-right">
                                  {tab === "TRANSFERRING"
                                    ? `${warehouseInSeqs(r).length}/${packageCount(r)}`
                                    : packageCount(r)}
                                </td>
                                <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                                <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-wrap items-center justify-end gap-1">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Tác vụ đơn">
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem onClick={() => setEditOrderCode(r.code)}>
                                          <Pencil className="mr-2 h-4 w-4" /> Sửa đơn
                                        </DropdownMenuItem>
                                        {tab === "TRANSFER_PENDING" && r.tripCode ? (
                                          <DropdownMenuItem
                                            disabled={unassigning}
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => void unassignFromTrip([r.code])}
                                          >
                                            <Unlink className="mr-2 h-4 w-4" /> Gỡ khỏi xe
                                          </DropdownMenuItem>
                                        ) : null}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setDeleteTarget({ type: "order", code: r.code })}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" /> Xóa đơn
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </td>
                              </tr>
                              {expandedOrders.has(r.code) && (
                                <OrderPackageListRow
                                  order={r}
                                  colSpan={nestedColSpan}
                                  showInboundStatus={tab === "TRANSFERRING"}
                                  onPrintPackage={(code, seq) => setPrintTarget({ code, packageSeq: seq })}
                                  onEditPackage={(code, seq) => setEditPkg({ code, seq })}
                                  onDeletePackage={(code, seq) =>
                                    setDeleteTarget({ type: "package", code, seq })
                                  }
                                />
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
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
                  {tab !== "WH_IN" ? <th className="px-2 py-2">Chuyến</th> : null}
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  {tab === "DEST_WH_IN" ? (
                    <th className="px-2 py-2 text-right">Cước shipper tạm tính</th>
                  ) : null}
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.code}>
                    <tr className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(r.code)}
                          onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                          aria-label={`Chọn ${r.code}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center text-left"
                            title={expandedOrders.has(r.code) ? "Ẩn kiện" : "Xem kiện"}
                            onClick={() => toggleOrderPkgs(r.code)}
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                expandedOrders.has(r.code) && "rotate-180",
                              )}
                            />
                          </button>
                          <OrderCodeLink code={r.code} />
                        </span>
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
                      {tab !== "WH_IN" ? (
                        <td className="px-2 py-2 whitespace-nowrap">{r.tripCode ?? "-"}</td>
                      ) : null}
                      <td className="px-2 py-2 text-right">
                        {tab === "DEST_WH_IN"
                          ? `${warehouseInSeqs(r).length}/${packageCount(r)}`
                          : (r.quantity ?? 1)}
                      </td>
                      <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                      {tab === "DEST_WH_IN" ? (
                        <td className="px-2 py-2 text-right tabular-nums">
                          {(() => {
                            const fee = estimateShipperFare(r);
                            return fee == null ? "—" : formatVND(fee);
                          })()}
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Tác vụ đơn">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {tab === "WH_IN" ? (
                                <DropdownMenuItem
                                  onClick={() => setPrintTarget({ code: r.code, batchPackages: true })}
                                >
                                  <Printer className="mr-2 h-4 w-4" /> In các kiện
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onClick={() => setEditOrderCode(r.code)}>
                                <Pencil className="mr-2 h-4 w-4" /> Sửa đơn
                              </DropdownMenuItem>
                              {tab === "DELIVERING" ? (
                                <DropdownMenuItem onClick={() => fail([r.code])}>
                                  <XCircle className="mr-2 h-4 w-4" /> Thất bại
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget({ type: "order", code: r.code })}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Xóa đơn
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {activeTab.action && (
                            <Button size="sm" variant="outline" onClick={() => runAction([r.code])}>
                              {activeTab.action}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedOrders.has(r.code) && (
                      <OrderPackageListRow
                        order={r}
                        colSpan={tab === "WH_IN" ? 10 : tab === "DEST_WH_IN" ? 12 : 11}
                        showInboundStatus={tab === "DEST_WH_IN"}
                        onPrintPackage={(code, seq) => setPrintTarget({ code, packageSeq: seq })}
                        onEditPackage={(code, seq) => setEditPkg({ code, seq })}
                        onDeletePackage={(code, seq) => setDeleteTarget({ type: "package", code, seq })}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <EditOrderBriefDialog
        orderCode={editOrderCode}
        open={!!editOrderCode}
        onOpenChange={(v) => !v && setEditOrderCode(null)}
      />

      <EditPackageDialog
        orderCode={editPkg?.code ?? null}
        packageSeq={editPkg?.seq ?? null}
        open={!!editPkg}
        onOpenChange={(v) => !v && setEditPkg(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "package" ? "Xóa kiện?" : "Xóa đơn hàng?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "package"
                ? `Xác nhận xóa kiện ${packageCode(deleteTarget.code, deleteTarget.seq)}. Thao tác sẽ cập nhật lại số kiện / cước / KL của đơn.`
                : deleteTarget
                  ? `Xác nhận xóa (huỷ) đơn ${deleteTarget.code}. Đơn sẽ chuyển sang trạng thái đã huỷ.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={inboundPlatesOpen} onOpenChange={setInboundPlatesOpen}>
        <DialogContent className="max-h-[85vh] w-[min(92vw,560px)] max-w-[560px] overflow-hidden flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>
              Xe đang giao tới {officeName(scopedOffice) || scopedOffice}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Chỉ đếm đơn / kiện còn trên xe sẽ giao tới VP này (
              {inboundTotals.vehicles} BKS · {inboundTotals.orders} đơn · {inboundTotals.packages} kiện).
            </p>
          </DialogHeader>
          {inboundPlateSummary.length === 0 ? (
            <EmptyState>Không có xe đang mang hàng tới VP này</EmptyState>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">BKS</th>
                    <th className="px-3 py-2">Tài xế</th>
                    <th className="px-3 py-2 text-right">SL đơn</th>
                    <th className="px-3 py-2 text-right">SL kiện</th>
                  </tr>
                </thead>
                <tbody>
                  {inboundPlateSummary.map((g) => (
                    <tr key={g.key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-semibold tracking-wide">{g.plate}</td>
                      <td className="px-3 py-2 text-muted-foreground">{g.driver || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{g.orderCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{g.packageCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-3 py-2" colSpan={2}>
                      Tổng
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{inboundTotals.orders}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inboundTotals.packages}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInboundPlatesOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintLabelDialog
        code={printTarget?.code ?? null}
        packageSeq={printTarget?.packageSeq}
        batchPackages={printTarget?.batchPackages}
        open={!!printTarget}
        onOpenChange={(v) => !v && setPrintTarget(null)}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="!flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-4 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>Gán hàng lên xe</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
            <AssignVehiclePicker open={assignOpen} onPick={setAssignPick} />

            <div className="min-w-0">
              <Label className="text-xs">Đơn hàng đã chọn ({assignRows.length})</Label>
              <div className="mt-2 max-h-[200px] overflow-auto rounded-md border">
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
                        <td className="px-2 py-2 font-medium"><OrderCodeLink code={r.code} /></td>
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
                {assignRows.reduce((s, r) => s + (r.weightKg ?? 0), 0).toFixed(1)} KG
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={!assignPick} onClick={confirmAssign}>
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
