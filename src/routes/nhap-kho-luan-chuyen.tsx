import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { resolveTripRouteCode } from "@/lib/api/trip-route";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
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
  formatMoney,
  officeName,
  canonicalOfficeCode,
  type Order,
} from "@/lib/mock-data";
import { estimateShipperFare } from "@/lib/pricing";
import { useStore, type OrderX, type TripX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useRefreshOrdersOnMount, refreshOrdersNow } from "@/lib/use-orders-poll";
import { useOrdersLoadState } from "@/lib/orders-load-state";
import { toast } from "sonner";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { EditOrderBriefDialog, EditPackageDialog } from "@/components/EditPackageDialog";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { CountButton, OrderListDialog, type OrderListRow } from "@/components/OrderListDialog";
import { OrderPackageListRow } from "@/components/OrderPackageListRow";
import {
  FEE_COL_COUNT,
  OrderFeeCell,
  OrderFeeHeader,
  OrderWeightCell,
} from "@/components/OrderFeeCells";
import { PodConfirmDialog } from "@/components/PodConfirmDialog";
import { ReturnStartDialog } from "@/components/ReturnStartDialog";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { isApiEnabled } from "@/lib/api/client";
import { StageTabButton, StageTabRow, useJumpToMatchingTab } from "@/components/StageTabs";
import { useActivityFilters } from "@/lib/activity-filters";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { useAdminIssueMenu } from "@/components/AdminIssueMenuItems";
import { canAdminMarkIssue } from "@/lib/order-edit-policy";
import {
  Warehouse,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Undo2,
  Ban,
  Unlink,
  ChevronDown,
  Printer,
  Pencil,
  Eye,
  MoreHorizontal,
  Truck,
  PhoneCall,
  Bike,
  Home,
} from "lucide-react";
import { canWrite } from "@/lib/rbac";
import { ahamoveAdvancePending, ahamoveRefundDue } from "@/lib/ahamove";
import {
  ahamoveAdvanceIn,
  ahamoveAdvanceRefund,
  ahamoveCancel,
  assignShipper,
  autoCallCatchUp,
  type AutoCallCatchUpResult,
} from "@/lib/api/domain-api";
import { AssignShipperDialog, type InternalAssign } from "@/components/AssignShipperDialog";
import { createFileRoute } from "@tanstack/react-router";
import { AssignVehiclePicker, findOpenTripByPlate, pickDepartMatch, realDriverName, realVehiclePlate, tripAuditFields, tripItineraryLabel, type AssignVehiclePick } from "@/components/AssignVehiclePicker";
import { packageCount, warehouseInSeqs } from "@/lib/package-label";
import {
  adminOfficeSelectOptions,
  assignedOfficeCode,
  hasAllOfficeScope,
  isAdminRole,
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
  | "FAILED"
  | "REDELIVER_WAIT";

const TH_MUTED = "px-2 py-2 font-semibold text-slate-500";

/** Chuyến xuất phát gần nhất lên trước; xe chưa có giờ xuất phát xếp cuối, cùng giờ thì theo BKS. */
function byDepartThenPlate(a: { plate: string; departAt?: string }, b: { plate: string; departAt?: string }) {
  const ta = a.departAt ? Date.parse(a.departAt) : NaN;
  const tb = b.departAt ? Date.parse(b.departAt) : NaN;
  const va = Number.isFinite(ta) ? ta : Number.NEGATIVE_INFINITY;
  const vb = Number.isFinite(tb) ? tb : Number.NEGATIVE_INFINITY;
  if (va !== vb) return va > vb ? -1 : 1;
  return a.plate.localeCompare(b.plate, "vi");
}

type StageTimeField = "warehouseInAt" | "tripAssignedAt" | "driverSignedAt" | "destWarehouseInAt" | "shipperAssignedAt";

/** Mốc hiện dưới mã đơn theo tab; {@code actions} = sự kiện cục bộ (vừa thao tác, chưa đồng bộ lại). */
const STAGE_TIME: Partial<Record<Stage, { label: string; field: StageTimeField; actions: string[] }>> = {
  WH_IN: { label: "Nhập kho", field: "warehouseInAt", actions: ["WAREHOUSE_RECEIVE", "WH_IN", "PICKUP_RECEIVED", "CONFIRM", "CREATE"] },
  TRANSFER_PENDING: { label: "Quét", field: "tripAssignedAt", actions: ["ASSIGN_TRIP", "TRANSFER_PENDING"] },
  TRANSFERRING: { label: "Ký nhận", field: "driverSignedAt", actions: ["KY_BAN_GIAO_TAI_XE", "SCAN_OUT", "HANDOVER"] },
  DEST_WH_IN: { label: "Nhập kho", field: "destWarehouseInAt", actions: ["SCAN_IN", "HUB_IN", "DEST_WH_IN"] },
  DELIVERING: { label: "Gán ship", field: "shipperAssignedAt", actions: ["DELIVERING"] },
};

const stageTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function stageTimeOf(o: OrderX, tab: Stage): { label: string; at: string } | null {
  const cfg = STAGE_TIME[tab];
  if (!cfg) return null;
  let at = o[cfg.field] ?? "";
  for (const e of o.events ?? []) {
    if (e.at && cfg.actions.includes(String(e.action ?? "").toUpperCase()) && e.at > at) at = e.at;
  }
  return at ? { label: cfg.label, at } : null;
}

function StageTime({ order, tab }: { order: OrderX; tab: Stage }) {
  const t = stageTimeOf(order, tab);
  if (!t) return null;
  const d = new Date(t.at);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <div className="mt-0.5 pl-[22px] text-[11px] font-normal tabular-nums text-muted-foreground">
      {t.label}: {stageTimeFmt.format(d)}
    </div>
  );
}

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
    action: "Chờ giao lại",
    next: "REDELIVER_WAIT",
  },
  {
    key: "REDELIVER_WAIT",
    label: "Chờ giao lại",
    hint: "Điều phối đã xếp đơn vào danh sách chờ giao lại. Ấn Giao lại để bàn giao shipper đi giao.",
    action: "Giao lại",
    next: "DELIVERING",
  },
];

/** Bàn giao shipper từng đơn qua popup Gán Shipper — không thao tác hàng loạt. */
const HANDOVER_TABS = new Set<Stage>(["DEST_WH_IN", "REDELIVER_WAIT"]);

/** Tab phía VP nhận (kho giao / đang giao / fail). Còn lại = phía VP gửi. */
const DEST_PIPELINE_TABS = new Set<Stage>([
  "DEST_WH_IN",
  "DELIVERING",
  "FAILED",
  "REDELIVER_WAIT",
]);

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
 *  Hàng trên xe chỉ là hàng VP mình gửi đi — hàng đang tới xem ở nút "Xe đang tới".
 *  Đơn RETURNING: chiều ngược — kho nguồn = VP nhận gốc; kho đích hoàn = VP gửi gốc. */
function orderMatchesTabOffice(o: Order, tab: Stage, scoped: string): boolean {
  if (!scoped || scoped === VIEW_ALL_OFFICES) return true;
  const returning = o.status === "RETURNING";
  if (isDestPipelineTab(tab)) {
    return officeCodeEq(returning ? o.fromOffice : orderReceiverOffice(o), scoped);
  }
  return officeCodeEq(returning ? orderReceiverOffice(o) : o.fromOffice, scoped);
}

/** Tab có thêm bộ lọc VP phía đối diện: Nhập kho gửi → lọc VP nhận; Nhập kho giao → lọc VP gửi. */
const COUNTER_OFFICE_TABS = new Set<Stage>(["WH_IN", "DEST_WH_IN"]);

function orderMatchesCounterOffice(o: Order, tab: Stage, office: string): boolean {
  if (!office || !COUNTER_OFFICE_TABS.has(tab)) return true;
  const returning = o.status === "RETURNING";
  if (isDestPipelineTab(tab)) {
    return officeCodeEq(returning ? orderReceiverOffice(o) : o.fromOffice, office);
  }
  return officeCodeEq(returning ? o.fromOffice : orderReceiverOffice(o), office);
}

const STAGE_STATUS: Record<Stage, Order["status"]> = {
  PICKED: "CONFIRMED",
  WH_IN: "CONFIRMED",
  TRANSFER_PENDING: "WAITING",
  TRANSFERRING: "IN_TRANSIT",
  DEST_WH_IN: "AT_DEST",
  DELIVERING: "OUT_FOR_DELIVERY",
  FAILED: "FAILED_DELIVERY",
  // Chờ giao lại vẫn là đơn giao thất bại — chỉ khác vị trí trong pipeline.
  REDELIVER_WAIT: "FAILED_DELIVERY",
};

function deriveStage(o: Order): Stage | null {
  // RETURNING vẫn chạy pipeline kho qua forwardStage (không derive theo status).
  if (["DELIVERED", "CANCELLED", "RETURNED", "DRAFT"].includes(o.status)) return null;
  if (o.status === "RETURNING") return null;
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
  // Terminal xong / draft: rời pipeline. RETURNING vẫn giữ stage (hoàn trên pipeline chung).
  if (["DELIVERED", "CANCELLED", "RETURNED", "DRAFT"].includes(o.status)) return null;
  const s = (o as Order & { stage?: Stage }).stage;
  if (o.status === "RETURNING") return s ?? null;
  // Stage lệch trạng thái (đơn cũ bị ghi đè) → theo trạng thái, tránh đơn thất bại vẫn nằm ở "Đang giao".
  if (o.status === "FAILED_DELIVERY" && s !== "FAILED" && s !== "REDELIVER_WAIT") return "FAILED";
  if (o.status === "OUT_FOR_DELIVERY" && s !== "DELIVERING") return "DELIVERING";
  return s ?? deriveStage(o);
}

function isReturnFlow(o: Pick<Order, "status">): boolean {
  return o.status === "RETURNING" || o.status === "RETURNED";
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

/** Cột "Kiện": tổng số kiện + tiến độ quét nhập kho giao khi đơn đang dở. */
const AHAMOVE_STATUS_LABEL: Record<string, string> = {
  IDLE: "chờ xác nhận",
  ASSIGNING: "đang tìm tài xế",
  ACCEPTED: "tài xế đã nhận",
  CONFIRMING: "đang xác nhận",
  "IN PROCESS": "đang giao",
  COMPLETED: "đã giao",
  FAILED: "giao thất bại",
  CANCELLED: "đã hủy",
};

const AHAMOVE_CANCELLABLE = new Set(["IDLE", "ASSIGNING", "ACCEPTED", "CONFIRMING", "PAYING"]);

function AhamoveCancelLink({ order }: { order: OrderX }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const writable = isApiEnabled() && canWrite(session?.role, "nhap-kho-luan-chuyen");
  const st = (order.partnerStatus ?? "").toUpperCase();
  if (!writable || !order.partnerOrderId || !AHAMOVE_CANCELLABLE.has(st)) return null;
  if (order.status !== "OUT_FOR_DELIVERY" && order.status !== "FAILED_DELIVERY") return null;
  const cancel = async () => {
    if (!window.confirm(`Hủy đơn Ahamove của ${order.code}? Chỉ hủy được khi tài xế chưa lấy hàng.`)) return;
    setBusy(true);
    try {
      await ahamoveCancel(order.code, "CPN hủy giao Ahamove");
      toast.success(`Đã hủy Ahamove — ${order.code} chuyển Giao thất bại`);
      void refreshOrdersNow();
    } catch (e: any) {
      toast.error(e?.message ?? "Hủy Ahamove thất bại");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className="text-destructive underline disabled:opacity-50"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void cancel();
      }}
    >
      {busy ? "Đang hủy…" : "Hủy Ahamove"}
    </button>
  );
}

function AhamoveInfo({ order }: { order: OrderX }) {
  const st = order.partnerStatus ?? "";
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="border-orange-500 text-orange-700">
          Ahamove · {AHAMOVE_STATUS_LABEL[st] ?? (st || "—")}
        </Badge>
        {order.partnerTrackingUrl ? (
          <a href={order.partnerTrackingUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            Theo dõi
          </a>
        ) : null}
        {order.partnerPodUrl ? (
          <a href={order.partnerPodUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            Ảnh POD
          </a>
        ) : null}
        <AhamoveCancelLink order={order} />
      </div>
      {order.partnerDriverName || order.partnerDriverPhone ? (
        <div className="text-muted-foreground">
          Tài xế: {order.partnerDriverName ?? ""} {order.partnerDriverPhone ?? ""}
        </div>
      ) : null}
      {order.partnerFee != null ? (
        <div className="text-muted-foreground">Phí đối tác: {order.partnerFee.toLocaleString("vi-VN")}đ</div>
      ) : null}
      {order.partnerFailReason && (st === "FAILED" || st === "CANCELLED") ? (
        <div className="text-destructive">{order.partnerFailReason}</div>
      ) : null}
      <AhamoveAdvanceRow order={order} />
    </div>
  );
}

/** Tài xế Ahamove ứng cước: NV xác nhận đã nhận tiền / hoàn lại khi giao không được. */
function AhamoveAdvanceRow({ order }: { order: OrderX }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const amount = order.partnerCodAmount ?? 0;
  if (amount <= 0) return null;
  const money = `${amount.toLocaleString("vi-VN")}đ`;
  const writable = isApiEnabled() && canWrite(session?.role, "nhap-kho-luan-chuyen");
  const pending = ahamoveAdvancePending(order);
  const refundDue = ahamoveRefundDue(order);
  const driverHasGoods = ["IN PROCESS", "COMPLETED", "FAILED"].includes(order.partnerStatus ?? "");
  const pickupConfirmable = !order.partnerCodCollectedAt && order.status === "FAILED_DELIVERY";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      void refreshOrdersNow();
    } catch (e: any) {
      toast.error(e?.message ?? "Thao tác thất bại");
    } finally {
      setBusy(false);
    }
  };
  const confirmIn = () => {
    if (!window.confirm(`Xác nhận đã nhận ${money} tiền mặt tài xế Ahamove ứng cho đơn ${order.code}?`)) return;
    void run(() => ahamoveAdvanceIn(order.code), `Đã ghi nhận ${money} tài xế ứng`);
  };
  const refund = () => {
    if (!window.confirm(`Đã trả lại ${money} cho tài xế Ahamove (hàng đã về VP)? Đơn ${order.code} sẽ quay lại còn nợ.`))
      return;
    void run(() => ahamoveAdvanceRefund(order.code), `Đã hoàn ${money} tiền ứng cho tài xế`);
  };

  if (order.partnerCodCollectedAt && !refundDue) {
    return (
      <div className="text-emerald-700">
        Đã nhận {money} tài xế ứng{order.partnerCodCollectedBy ? ` · ${order.partnerCodCollectedBy}` : ""}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {refundDue ? (
        <span className="font-medium text-destructive">Chưa hoàn {money} tiền ứng cho tài xế</span>
      ) : (
        <span className={driverHasGoods ? "font-medium text-destructive" : "text-amber-700"}>
          Tài xế ứng {money} — chưa nhận{driverHasGoods ? " (tài xế đã lấy hàng!)" : ""}
        </span>
      )}
      {writable && (pending || pickupConfirmable) ? (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy} onClick={confirmIn}>
          Đã nhận tiền ứng
        </Button>
      ) : null}
      {writable && refundDue ? (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" disabled={busy} onClick={refund}>
          Hoàn ứng cho tài xế
        </Button>
      ) : null}
    </div>
  );
}

function InboundCountCell({ order, context }: { order: Order; context: "ON_TRUCK" | "DEST_WH_IN" }) {
  const total = packageCount(order);
  const inCount = warehouseInSeqs(order).length;
  if (inCount === 0 && context === "ON_TRUCK") return <>{total}</>;
  // AT_DEST chỉ đạt được sau khi quét đủ kiện; note thiếu [WHIN] là do client ghi note lỗi.
  if (inCount >= total || (context === "DEST_WH_IN" && order.status === "AT_DEST")) {
    return (
      <div className="leading-tight">
        <div>{total}</div>
        <div className="text-[11px] text-emerald-700">đủ kiện</div>
      </div>
    );
  }
  return (
    <div className="leading-tight" title={`Đã quét nhập kho giao ${inCount}/${total} kiện`}>
      <div>{total}</div>
      <div className={cn("whitespace-nowrap text-[11px]", context === "ON_TRUCK" ? "text-sky-700" : "text-amber-700")}>
        {context === "ON_TRUCK" ? `đã xuống ${inCount}/${total}` : `thiếu kiện ${inCount}/${total}`}
      </div>
    </div>
  );
}

const UNASSIGNED_PLATE = "Chưa gán biển";
const GROUP_ORDER_STEP = 50;

/** Tài xế: ưu tiên tên trên đơn (API luôn trả) vì store.trips lọc theo VP nên VP nhận hay thiếu chuyến. */
function driverOf(order: Order, trip?: TripX): string {
  return realDriverName(order.driverName) || realDriverName(trip?.driver);
}

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
  /** Giờ xuất phát chuyến (trip.departAt) — gần nhất nếu cùng biển có nhiều chuyến. */
  departAt?: string;
  orders: Order[];
  qty: number;
  weight: number;
};

/** Giờ xuất phát ngắn HH:mm (vi-VN, 24h). */
function formatDepartClock(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "HH:mm dd/MM" — xe đang tới có thể xuất phát từ hôm trước. */
function formatDepartFull(iso?: string | null): string {
  const clock = formatDepartClock(iso);
  if (!clock) return "";
  const d = new Date(iso!);
  return `${clock} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const admin = hasAllOfficeScope(session);
  const canAssignOnWeb = isAdminRole(session?.role) || session?.role === "DH";
  const viewOffice = resolveViewOffice(session, viewOfficeRaw);

  const [tab, setTab] = useState<Stage>("WH_IN");
  const { from, to, q } = useActivityFilters();
  const [counterOffice, setCounterOffice] = useState<Partial<Record<Stage, string>>>({});
  const counterOfficeOf = (t: Stage) => counterOffice[t] ?? "";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [homeOnly, setHomeOnly] = useState(false);
  const [printTarget, setPrintTarget] = useState<{
    code: string;
    packageSeq?: number;
    batchPackages?: boolean;
  } | null>(null);
  const [editOrderCode, setEditOrderCode] = useState<string | null>(null);
  const [editPkg, setEditPkg] = useState<{ code: string; seq: number } | null>(null);
  const [expandedPlates, setExpandedPlates] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [inboundPlatesOpen, setInboundPlatesOpen] = useState(false);
  const [shipperCode, setShipperCode] = useState<string | null>(null);
  const [ahamoveCancelling, setAhamoveCancelling] = useState(false);
  const [inboundOrderList, setInboundOrderList] = useState<{ title: string; rows: OrderListRow[] } | null>(null);
  const openInboundOrders = (title: string, list: OrderX[]) =>
    setInboundOrderList({
      title,
      rows: list.map((order) => ({ order, at: stageTimeOf(order, "TRANSFERRING")?.at })),
    });

  const updateOrder = useStore((s) => s.updateOrder);
  const transitionOrder = useStore((s) => s.transitionOrder);

  // VP nhận quét / nhập kho giao → tab Hàng trên xe của VP gửi tự cập nhật.
  useRefreshOrdersOnMount();
  const ordersLoad = useOrdersLoadState();
  const loadingMore = ordersLoad.firstPageReady && !ordersLoad.fullyLoaded ? " · đang tải thêm…" : "";

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
      if ((o as OrderX).issue && !(o as OrderX).issue?.resolvedAt) return false;
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
            (o) =>
              matchesPipelineTab(o, t.key, stageOf(o)) &&
              orderMatchesTabOffice(o, t.key, scopedOffice) &&
              orderMatchesCounterOffice(o, t.key, counterOffice[t.key] ?? ""),
          ).length,
        }),
        {} as Record<Stage, number>,
      ),
    [base, scopedOffice, counterOffice],
  );
  useJumpToMatchingTab(q, tab, counts, TABS.map((t) => t.key), (k) => {
    setTab(k);
    setSelected(new Set());
    setExpandedPlates(new Set());
  });

  const tabRows = useMemo(
    () =>
      base.filter(
        (o) =>
          matchesPipelineTab(o, tab, stageOf(o)) &&
          orderMatchesTabOffice(o, tab, scopedOffice) &&
          orderMatchesCounterOffice(o, tab, counterOffice[tab] ?? ""),
      ),
    [base, tab, scopedOffice, counterOffice],
  );
  const homeCount = useMemo(() => tabRows.filter((o) => o.homeDelivery).length, [tabRows]);
  const rows = useMemo(() => {
    const list = homeOnly ? tabRows.filter((o) => o.homeDelivery) : tabRows;
    if (!STAGE_TIME[tab]) return list;
    const ts = (o: OrderX) => {
      const t = Date.parse(stageTimeOf(o, tab)?.at ?? "") || Date.parse(o.createdAt ?? "");
      return Number.isNaN(t) ? 0 : t;
    };
    return list
      .map((o) => ({ o, t: ts(o as OrderX) }))
      .sort((a, b) => b.t - a.t)
      .map((x) => x.o);
  }, [tabRows, homeOnly, tab]);
  const { pageRows, pager } = usePagedRows(rows, "nhap-kho-luan-chuyen");

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
          driver: driverOf(o, trip),
          route: trip?.route,
          departAt: trip?.departAt || o.departAt,
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
      if (!g.driver) g.driver = driverOf(o, trip);
      if (!g.route && trip?.route) g.route = trip.route;
      // Cùng BKS có thể gộp nhiều chuyến — lấy giờ xuất phát gần nhất để hiển thị.
      const depart = trip?.departAt || o.departAt;
      if (depart && (!g.departAt || depart > g.departAt)) g.departAt = depart;
    }
    return [...map.values()]
      .filter((g) => g.orders.length > 0 && g.qty > 0)
      .sort(byDepartThenPlate);
  }, [rows, tripByCode, tab]);
  const { pageRows: pageGroups, pager: groupPager } = usePagedRows(vehicleGroups, "nhap-kho-luan-chuyen-xe");
  const [groupLimit, setGroupLimit] = useState<Record<string, number>>({});

  /** Xe đang mang hàng tới VP đang xem — chỉ đếm đơn/kiện giao tới VP đó. */
  const inboundPlateSummary = useMemo(() => {
    if (!scopedOffice) return [];
    const map = new Map<
      string,
      {
        key: string;
        plate: string;
        driver?: string;
        departAt?: string;
        orderCount: number;
        packageCount: number;
        orders: OrderX[];
      }
    >();
    for (const o of base) {
      if (!matchesPipelineTab(o, "TRANSFERRING", stageOf(o))) continue;
      const inboundOffice =
        o.status === "RETURNING" ? (o.fromOffice ?? "") : orderReceiverOffice(o);
      if (!officeCodeEq(inboundOffice, scopedOffice)) continue;
      const remaining = Math.max(0, packageCount(o) - warehouseInSeqs(o).length);
      if (remaining <= 0) continue;
      const { key, plate } = plateOf(o, tripByCode);
      const trip = o.tripCode ? tripByCode.get(o.tripCode) : undefined;
      let g = map.get(key);
      if (!g) {
        g = { key, plate, driver: driverOf(o, trip), orderCount: 0, packageCount: 0, orders: [] };
        map.set(key, g);
      }
      g.orders.push(o as OrderX);
      g.orderCount += 1;
      g.packageCount += remaining;
      if (!g.driver) g.driver = driverOf(o, trip);
      const depart = trip?.departAt || o.departAt;
      if (depart && (!g.departAt || depart > g.departAt)) g.departAt = depart;
    }
    return [...map.values()].sort(byDepartThenPlate);
  }, [base, scopedOffice, tripByCode]);

  const inboundTotals = useMemo(
    () => ({
      vehicles: inboundPlateSummary.length,
      orders: inboundPlateSummary.reduce((s, x) => s + x.orderCount, 0),
      packages: inboundPlateSummary.reduce((s, x) => s + x.packageCount, 0),
    }),
    [inboundPlateSummary],
  );

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

      // Đơn đang hoàn: chỉ đổi forwardStage, giữ status RETURNING tới khi POD → RETURNED.
      if (o.status === "RETURNING") {
        st.updateOrder(code, {
          stage: next,
          updatedAt: at,
          events: [...(o.events ?? []), { at, by, action: next, detail }],
        } as Partial<Order>);
        st.audit({ action: next, entityType: "order", entityId: code, detail: `HOÀN · ${detail}` });
        okCount++;
        continue;
      }

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
        // BE transition tự đặt forwardStage theo trạng thái; gọi forward-stage song song sẽ bị lần lưu đó ghi đè.
        useStore.setState((s) => ({
          orders: s.orders.map((x) => (x.code === code ? { ...x, stage: next, updatedAt: at } : x)),
        }));
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
    if (okCount) {
      if (TABS.some((t) => t.key === next)) setTab(next);
      toast.success(`${detail} · ${okCount} đơn`);
      void refreshOrdersNow();
    }
  };

  // Giao thành công phải qua bước ảnh POD (dialog) → transitionOrder action "POD"
  // → pushOrderTransition gọi POST /api/orders/{code}/pod (DELIVERED hoặc RETURNED nếu đang hoàn).
  const deliver = (codes: string[]) => {
    const st = useStore.getState();
    const pending = codes.filter((code) => {
      const o = st.orders.find((x) => x.code === code);
      return o && o.status !== "DELIVERED" && o.status !== "RETURNED";
    });
    if (!pending.length) {
      toast.error("Không có đơn cần giao (đã giao/hoàn hoặc không tìm thấy)");
      return;
    }
    setPodCodes(pending);
    setPodOpen(true);
  };

  const fail = (codes: string[]) => {
    const st = useStore.getState();
    const running = codes.filter((code) => {
      const o = st.orders.find((x) => x.code === code);
      return (
        o?.partnerCode === "AHAMOVE" &&
        !!o.partnerOrderId &&
        !!o.partnerStatus &&
        !["CANCELLED", "COMPLETED", "FAILED"].includes(o.partnerStatus.toUpperCase())
      );
    });
    if (running.length) {
      toast.error(
        `${running.join(", ")} đang giao Ahamove — bấm Hủy Ahamove trước khi báo giao không thành công`,
      );
    }
    const rest = codes.filter((c) => !running.includes(c));
    if (rest.length) move(rest, "FAILED", "Giao không thành công, trả về bưu cục");
  };

  /** Chuyển hoàn về người gửi — POST /return-start; giữ forwardStage trên pipeline chung. */
  const canStartReturn =
    tab === "WH_IN" || tab === "DEST_WH_IN" || tab === "FAILED" || tab === "REDELIVER_WAIT";
  const canPressReturn =
    canStartReturn && (session?.role === "AD" || session?.role === "DH");

  const startReturn = (codes: string[], reason: string) => {
    if (!codes.length || !canPressReturn) return;
    const why = reason.trim();
    if (!why) {
      toast.error("Nhập lý do hoàn về người gửi");
      return;
    }
    const st = useStore.getState();
    const context =
      tab === "FAILED" || tab === "REDELIVER_WAIT"
        ? "Giao thất bại, chuyển hoàn về người gửi"
        : tab === "DEST_WH_IN"
          ? "Huỷ giao từ nhập kho giao, chuyển hoàn về người gửi"
          : "Huỷ giao từ nhập kho gửi, chuyển hoàn về người gửi";
    const detail = `${context} · ${why}`.slice(0, 255);
    let okCount = 0;
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o || o.status === "RETURNING" || o.status === "RETURNED") continue;
      // Case A: WH_IN → DEST_WH_IN; Case B: → WH_IN (chiều hoàn).
      const nextStage: Stage = tab === "WH_IN" ? "DEST_WH_IN" : "WH_IN";
      st.updateOrder(
        code,
        {
          status: "RETURNING",
          returnStage: "RETURN_PENDING",
          stage: nextStage,
          codAmount: 0,
          codFee: 0,
          ...(tab === "WH_IN" ? { tripCode: undefined } : {}),
        } as Partial<Order>,
        { eventAction: "RETURN_START", eventDetail: detail },
      );
      st.audit({ action: "RETURN_START", entityType: "order", entityId: code, detail });
      okCount++;
    }
    setSelected(new Set());
    if (okCount) {
      toast.success(`Đã chuyển hoàn ${okCount} đơn · theo dõi trên nhập kho (tag HOÀN)`);
      if (tab === "WH_IN") setTab("DEST_WH_IN");
      else setTab("WH_IN");
      void refreshOrdersNow();
    }
  };

  const askStartReturn = (codes: string[]) => {
    const pending = codes.filter((code) => {
      const o = useStore.getState().orders.find((x) => x.code === code);
      return o && o.status !== "RETURNING" && o.status !== "RETURNED";
    });
    if (!pending.length) {
      toast.error("Không có đơn cần chuyển hoàn");
      return;
    }
    setReturnStartCodes(pending);
    setReturnStartOpen(true);
  };

  /** Admin: huỷ hoàn tại nhập kho gửi (RETURNING + stage WH_IN) → về tab trước khi bấm hoàn. */
  const canCancelReturn = tab === "WH_IN" && session?.role === "AD";
  /** Admin: gỡ đơn đã lên xe (tab Hàng trên xe) về nhập kho gửi. */
  const canUnassignTransferring = tab === "TRANSFERRING" && session?.role === "AD";
  const canUnassignTrip = tab === "TRANSFER_PENDING" || canUnassignTransferring;
  const cancelReturn = async (codes: string[]) => {
    if (!canCancelReturn || !codes.length) return;
    const pending = codes.filter((code) => {
      const o = useStore.getState().orders.find((x) => x.code === code);
      return o && o.status === "RETURNING" && stageOf(o) === "WH_IN";
    });
    if (!pending.length) {
      toast.error("Chỉ huỷ được đơn đang hoàn tại nhập kho gửi");
      return;
    }
    if (!confirm(`Huỷ hoàn ${pending.length} đơn? Đơn sẽ về tab trước khi bấm hoàn.`)) return;

    const domain = await import("@/lib/api/domain-api");
    let ok = 0;
    let lastStage: Stage | null = null;
    for (const code of pending) {
      try {
        const dto = await domain.returnCancel(code, "Huỷ hoàn (admin)");
        const mapped = domain.mapOrder(dto as any);
        const restored = (mapped.stage as Stage | undefined) ?? null;
        const at = new Date().toISOString();
        const by = useStore.getState().session?.username ?? "system";
        useStore.setState((st) => ({
          orders: st.orders.map((o) =>
            o.code === code
              ? {
                  ...o,
                  ...mapped,
                  returnStage: undefined,
                  updatedAt: at,
                  events: [
                    ...(o.events ?? []),
                    { at, by, action: "RETURN_CANCEL", detail: "Huỷ hoàn (admin)" },
                  ],
                }
              : o,
          ),
        }));
        useStore.getState().audit({
          action: "RETURN_CANCEL",
          entityType: "order",
          entityId: code,
          detail: restored ? `→ ${restored}` : "Huỷ hoàn",
        });
        if (restored) lastStage = restored;
        ok++;
      } catch (e: any) {
        toast.error(e?.message || `Không huỷ hoàn được ${code}`);
      }
    }
    setSelected(new Set());
    if (ok) {
      toast.success(`Đã huỷ hoàn ${ok} đơn`);
      if (lastStage && TABS.some((t) => t.key === lastStage)) setTab(lastStage);
      void refreshOrdersNow();
    }
  };

  /** Admin: huỷ đơn tại nhập kho gửi (chưa lên xe, không phải đơn hoàn). */
  const canCancelOrder = tab === "WH_IN" && session?.role === "AD";
  const isCancellable = (o: Order | undefined) =>
    Boolean(o) && (o!.status === "CONFIRMED" || o!.status === "WAITING");
  const [cancelCodes, setCancelCodes] = useState<string[]>([]);
  const askCancelOrders = (codes: string[]) => {
    const pending = codes.filter((c) => isCancellable(useStore.getState().orders.find((x) => x.code === c)));
    if (!pending.length) {
      toast.error("Không có đơn huỷ được (đơn hoàn / đã lên xe không huỷ ở đây)");
      return;
    }
    setCancelCodes(pending);
  };
  const canRequestCancel = tab === "WH_IN" && session?.role === "DH";
  const isCancelRequestable = (o: Order | undefined) =>
    Boolean(o) && o!.status === "CONFIRMED" && !o!.tripCode;
  const [cancelRequestCodes, setCancelRequestCodes] = useState<string[]>([]);
  const askCancelRequest = (codes: string[]) => {
    const pending = codes.filter((c) => isCancelRequestable(useStore.getState().orders.find((x) => x.code === c)));
    if (!pending.length) {
      toast.error("Không có đơn gửi yêu cầu huỷ được (đơn hoàn / đã gán xe không huỷ ở đây)");
      return;
    }
    setCancelRequestCodes(pending);
  };
  const sendCancelRequests = async (codes: string[], reason: string) => {
    if (!canRequestCancel) return;
    const domain = await import("@/lib/api/domain-api");
    const sent = new Set<string>();
    for (const code of codes) {
      try {
        await domain.openIssue(code, "CANCEL_REQUEST", reason);
        sent.add(code);
      } catch (e: any) {
        toast.error(e?.message || `Không gửi được yêu cầu huỷ ${code}`);
      }
    }
    setSelected(new Set());
    if (sent.size) {
      useStore.setState((st) => ({ orders: st.orders.filter((o) => !sent.has(o.code)) }));
      toast.success(`Đã gửi yêu cầu huỷ ${sent.size} đơn · đơn tạm ẩn tới khi admin duyệt`);
    }
  };

  const cancelOrders = async (codes: string[], reason: string) => {
    if (!canCancelOrder) return;
    const detail = `Huỷ từ nhập kho gửi · ${reason}`.slice(0, 255);
    const domain = await import("@/lib/api/domain-api");
    let ok = 0;
    for (const code of codes) {
      try {
        if (isApiEnabled()) await domain.transitionOrderApi(code, "CANCELLED", "CANCEL", detail);
        const at = new Date().toISOString();
        const by = useStore.getState().session?.username ?? "system";
        useStore.setState((st) => ({
          orders: st.orders.map((o) =>
            o.code === code
              ? {
                  ...o,
                  status: "CANCELLED",
                  stage: undefined,
                  updatedAt: at,
                  events: [...(o.events ?? []), { at, by, action: "CANCEL", detail }],
                }
              : o,
          ),
        }));
        useStore.getState().audit({ action: "CANCEL", entityType: "order", entityId: code, detail });
        ok++;
      } catch (e: any) {
        toast.error(e?.message || `Không huỷ được ${code}`);
      }
    }
    setSelected(new Set());
    if (ok) {
      toast.success(`Đã huỷ ${ok} đơn · xem ở màn Đơn huỷ`);
      void refreshOrdersNow();
    }
  };

  const activeTab = TABS.find((t) => t.key === tab)!;

  const [podOpen, setPodOpen] = useState(false);
  const [podCodes, setPodCodes] = useState<string[]>([]);
  const [returnStartOpen, setReturnStartOpen] = useState(false);
  const [returnStartCodes, setReturnStartCodes] = useState<string[]>([]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCodes, setAssignCodes] = useState<string[]>([]);
  const [assignPick, setAssignPick] = useState<AssignVehiclePick>(null);
  const [reassignFrom, setReassignFrom] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const assigningRef = useRef(false);

  const assignRows = useMemo(
    () => orders.filter((o) => assignCodes.includes(o.code)),
    [orders, assignCodes],
  );

  const assignPresetBranch = useMemo(() => {
    const vals = [...new Set(assignRows.map((o) => (o.route || "").trim()).filter(Boolean))];
    return vals[0] ?? "";
  }, [assignRows]);
  const assignPresetItinerary = useMemo(() => {
    const vals = [...new Set(assignRows.map((o) => (o.itinerary || "").trim()).filter(Boolean))];
    return vals[0] ?? "";
  }, [assignRows]);

  const confirmAssign = async () => {
    if (assigningRef.current) return;
    if (!assignPick) {
      toast.error("Vui lòng chọn xe");
      return;
    }
    assigningRef.current = true;
    setAssigning(true);
    try {
      const domain = await import("@/lib/api/domain-api");
      const { syncOrdersFromApi, syncTripsFromApi, resolveOfficeCodeStrict } = await import("@/lib/api/sync");
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
          ? realDriverName(assignPick.trip.assignDriverName) ||
            realDriverName(assignPick.trip.driverName)
          : realDriverName(assignPick.driver);
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
      const match = pickDepartMatch(assignPick);
      const existing = plate
        ? findOpenTripByPlate(listed, plate, match) ?? findOpenTripByPlate(useStore.getState().trips, plate, match)
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
          ...tripAuditFields(assignPick),
          departAt: assignPick.tab === "vthk" ? assignPick.trip.departAt : assignPick.departAt,
        }));
      await domain.assignOrdersToTrip(trip.code, assignCodes, itineraryLabel, driverName);
      const at = new Date().toISOString();
      const assigned = new Set(assignCodes);
      const tripForStore = {
        ...trip,
        bks: realVehiclePlate(trip.bks) || plate,
        driver: driverName || realDriverName(trip.driver),
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
                driverName: realDriverName(tripForStore.driver) || o.driverName,
                departAt: tripForStore.departAt || o.departAt,
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
                ? {
                    ...t,
                    bks: realVehiclePlate(t.bks) || tripForStore.bks,
                    driver: realDriverName(t.driver) || tripForStore.driver,
                    route: tripForStore.route || t.route,
                  }
                : t,
            )
          : [tripForStore, ...st.trips],
      }));
      setAssignOpen(false);
      setSelected(new Set());
      setTab("TRANSFER_PENDING");
      const verb = reassignFrom ? "chuyển" : "gán";
      toast.success(
        plate
          ? `Đã ${verb} ${assignCodes.length} đơn sang xe ${plate}`
          : `Đã ${verb} ${assignCodes.length} đơn lên chuyến (chưa có BKS/tài xế)`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Không gán được chuyến trên máy chủ");
    } finally {
      assigningRef.current = false;
      setAssigning(false);
    }
  };

  const unassignFromTrip = async (codes: string[]) => {
    if (!codes.length || unassigning) return;
    if (tab === "TRANSFERRING" && session?.role !== "AD") {
      toast.error("Chỉ admin được gỡ đơn đang trên xe");
      return;
    }
    const candidates = orders.filter((o) => codes.includes(o.code) && o.tripCode);
    if (!candidates.length) {
      toast.error("Các đơn đã chọn chưa được gán chuyến");
      return;
    }
    if (
      tab === "TRANSFERRING" &&
      !confirm(
        `Gỡ ${candidates.length} đơn khỏi xe?\nĐơn sẽ về tab Nhập kho gửi (có thể gán lại lên xe khác).`,
      )
    ) {
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
      if (removed.size) {
        toast.success(`Đã gỡ ${removed.size} đơn khỏi xe`);
        if (tab === "TRANSFERRING") setTab("WH_IN");
      }
      if (failed) toast.error(`${failed} đơn không gỡ được khỏi xe`);
    } catch (e: any) {
      toast.error(e?.message || "Không gỡ được đơn khỏi xe");
    } finally {
      setUnassigning(false);
    }
  };

  const canReassign = tab === "TRANSFER_PENDING" && canAssignOnWeb;
  const openReassign = (codes: string[], fromPlate?: string) => {
    const pending = orders
      .filter((o) => codes.includes(o.code) && o.tripCode && stageOf(o) === "TRANSFER_PENDING")
      .map((o) => o.code);
    if (!pending.length) {
      toast.error("Chỉ chuyển xe được đơn đang Đợi trung chuyển giao");
      return;
    }
    setAssignCodes(pending);
    setAssignPick(null);
    setReassignFrom(fromPlate ?? "");
    setAssignOpen(true);
  };

  const runAction = (codes: string[]) => {
    if (!codes.length) return;
    if (tab === "TRANSFERRING") return;
    if (tab === "WH_IN") {
      if (!canAssignOnWeb) {
        toast.info("Gán lên xe trên app Lên hàng. Admin / điều phối vẫn gán được tại đây.");
        return;
      }
      setAssignCodes(codes);
      setAssignPick(null);
      setReassignFrom(null);
      setAssignOpen(true);
      return;
    }

    if (tab === "DELIVERING") return deliver(codes);
    if (HANDOVER_TABS.has(tab)) {
      if (codes.length === 1) setShipperCode(codes[0]);
      return;
    }
    if (activeTab.next) move(codes, activeTab.next, activeTab.label + " → " + activeTab.action);
  };

  const assignInternal = async (o: OrderX, { shipper, note }: InternalAssign) => {
    const who = `${shipper.fullName}${shipper.phone ? ` · ${shipper.phone}` : ""}`;
    if (isApiEnabled() && (o.status === "AT_DEST" || o.status === "FAILED_DELIVERY")) {
      await assignShipper(o.code, { mode: "INTERNAL", shipperId: shipper.id, note: note || undefined });
      toast.success(`Đã bàn giao ${o.code} cho ${who}`);
      setSelected(new Set());
      setTab("DELIVERING");
      void refreshOrdersNow();
      return true;
    }
    // Đơn đang hoàn chỉ đổi bước (giữ RETURNING) — đi luồng cũ, ghi tên shipper vào lịch sử.
    move([o.code], "DELIVERING", `${activeTab.label} → Bàn giao shipper ${who}${note ? ` — ${note}` : ""}`);
    return true;
  };

  const canAhamove = isApiEnabled() && canWrite(session?.role, "nhap-kho-luan-chuyen");
  const selectedOne = selected.size === 1 ? orders.find((o) => selected.has(o.code)) : undefined;
  const ahamoveRunning =
    !!selectedOne?.partnerStatus &&
    !["CANCELLED", "COMPLETED", "FAILED"].includes(selectedOne.partnerStatus.toUpperCase());
  const ahamoveCancellable =
    selectedOne?.partnerCode === "AHAMOVE" &&
    !!selectedOne.partnerOrderId &&
    (selectedOne.status === "OUT_FOR_DELIVERY" ||
      (selectedOne.status === "FAILED_DELIVERY" && ahamoveRunning));
  const cancelAhamove = async (o: OrderX) => {
    if (!window.confirm(`Hủy đơn Ahamove của ${o.code}? Chỉ hủy được khi tài xế chưa lấy hàng.`)) return;
    setAhamoveCancelling(true);
    try {
      await ahamoveCancel(o.code, "CPN hủy giao Ahamove");
      toast.success(`Đã hủy Ahamove — ${o.code} chuyển Giao thất bại`);
      setSelected(new Set());
      void refreshOrdersNow();
    } catch (e: any) {
      toast.error(e?.message ?? "Hủy Ahamove thất bại");
    } finally {
      setAhamoveCancelling(false);
    }
  };

  const canCatchUpCall =
    tab === "DEST_WH_IN" && isApiEnabled() && canWrite(session?.role, "nhap-kho-luan-chuyen");
  const [catchUp, setCatchUp] = useState<AutoCallCatchUpResult | null>(null);
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const [catchUpBusy, setCatchUpBusy] = useState(false);
  const previewCatchUp = async () => {
    const codes = selected.size > 0 ? [...selected] : rows.map((r) => r.code);
    if (!codes.length) return;
    setCatchUpBusy(true);
    try {
      const r = await autoCallCatchUp(codes, true);
      if (!r.eligible.length) {
        toast.info("Không có đơn nào cần gọi bù — các đơn đã được gọi hoặc đang hẹn gọi");
        return;
      }
      setCatchUp(r);
      setCatchUpOpen(true);
    } catch (e) {
      toast.error((e as Error)?.message || "Không kiểm tra được đơn cần gọi bù");
    } finally {
      setCatchUpBusy(false);
    }
  };
  const confirmCatchUp = async () => {
    if (!catchUp || !catchUp.eligible.length) return;
    setCatchUpBusy(true);
    try {
      const r = await autoCallCatchUp(catchUp.eligible, false);
      const parts = [
        r.sent ? `đã gửi ${r.sent} cuộc gọi` : "",
        r.scheduled ? `hẹn ${r.scheduled} cuộc vào khung giờ gọi` : "",
        r.skipped.length ? `bỏ qua ${r.skipped.length} đơn` : "",
      ].filter(Boolean);
      toast.success(`Gọi bù: ${parts.join(", ") || "không có đơn nào"}`);
      setCatchUpOpen(false);
      setSelected(new Set());
      void refreshOrdersNow();
    } catch (e) {
      toast.error((e as Error)?.message || "Gọi bù thất bại");
    } finally {
      setCatchUpBusy(false);
    }
  };
  const catchUpSkipSummary = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of catchUp?.skipped ?? []) m.set(s.reason, (m.get(s.reason) ?? 0) + 1);
    return [...m.entries()];
  }, [catchUp]);

  const showCounterOffice = COUNTER_OFFICE_TABS.has(tab);
  const counterLabel = isDestPipelineTab(tab) ? "VP gửi" : "VP nhận";
  const counterOfficeSelect = (
    <div className="w-56" title={`Lọc theo ${counterLabel}`}>
      <SearchableSelect
        value={counterOfficeOf(tab)}
        onValueChange={(v) => {
          setCounterOffice((prev) => ({ ...prev, [tab]: v }));
          setSelected(new Set());
        }}
        allowClear
        clearLabel={`Tất cả ${counterLabel}`}
        placeholder={`Tất cả ${counterLabel}`}
        options={offices.map((o) => ({ value: o.code, label: o.name }))}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <StageTabRow>
        {TABS.map((t) => (
          <StageTabButton
            key={t.key}
            active={t.key === tab}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
              setExpandedPlates(new Set());
            }}
          >
            {t.label} ({counts[t.key] ?? 0})
          </StageTabButton>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {showCounterOffice && isDestPipelineTab(tab) ? counterOfficeSelect : null}
          {showCounterOffice && session?.role === "DH" ? null : (
            <div className="w-56" title={isDestPipelineTab(tab) ? "Văn phòng nhận" : "Văn phòng gửi"}>
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
          )}
          {showCounterOffice && !isDestPipelineTab(tab) ? counterOfficeSelect : null}
        </div>
      </StageTabRow>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      <Section
        title={
          tab === "TRANSFERRING" || tab === "TRANSFER_PENDING"
            ? `${activeTab.label} (${vehicleGroups.length} xe · ${rows.length} đơn)${loadingMore}`
            : `${activeTab.label} (${rows.length})${loadingMore}`
        }
        right={
          <div className="flex flex-wrap gap-2">
            {tab === "TRANSFERRING" && scopedOffice ? (
              <Button variant="outline" className="gap-2" onClick={() => setInboundPlatesOpen(true)}>
                <Eye className="h-4 w-4" />
                Xe đang tới ({inboundTotals.vehicles} BKS · {inboundTotals.orders} đơn ·{" "}
                {inboundTotals.packages} kiện)
              </Button>
            ) : null}
            {canReassign && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={selected.size === 0}
                onClick={() => openReassign([...selected])}
              >
                <Truck className="h-4 w-4" />
                Chuyển xe ({selected.size})
              </Button>
            )}
            {canUnassignTrip && (
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
            {tab !== "TRANSFERRING" && tab === "DELIVERING" && (
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
            {tab !== "TRANSFERRING" && tab !== "TRANSFER_PENDING" && (
              <Button
                variant={homeOnly ? "default" : "outline"}
                className="gap-2"
                onClick={() => {
                  setHomeOnly((v) => !v);
                  setSelected(new Set());
                }}
              >
                <Home className="h-4 w-4" />
                Giao tận nơi ({homeCount})
              </Button>
            )}
            {tab !== "TRANSFERRING" && canPressReturn && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={
                  selected.size === 0 ||
                  ![...selected].some((c) => {
                    const o = orders.find((x) => x.code === c);
                    return o && o.status !== "RETURNING" && o.status !== "RETURNED";
                  })
                }
                onClick={() => askStartReturn([...selected])}
              >
                <Undo2 className="h-4 w-4" />
                Hoàn người gửi ({selected.size})
              </Button>
            )}
            {tab !== "TRANSFERRING" && canCancelReturn && (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={
                  selected.size === 0 ||
                  ![...selected].some((c) => {
                    const o = orders.find((x) => x.code === c);
                    return o && o.status === "RETURNING" && stageOf(o) === "WH_IN";
                  })
                }
                onClick={() => void cancelReturn([...selected])}
              >
                <Ban className="h-4 w-4" />
                Huỷ hoàn ({selected.size})
              </Button>
            )}
            {canCancelOrder && (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={
                  selected.size === 0 ||
                  ![...selected].some((c) => isCancellable(orders.find((x) => x.code === c)))
                }
                onClick={() => askCancelOrders([...selected])}
              >
                <Ban className="h-4 w-4" />
                Huỷ đơn ({selected.size})
              </Button>
            )}
            {canRequestCancel && (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={
                  selected.size === 0 ||
                  ![...selected].some((c) => isCancelRequestable(orders.find((x) => x.code === c)))
                }
                onClick={() => askCancelRequest([...selected])}
              >
                <Ban className="h-4 w-4" />
                Yêu cầu huỷ ({selected.size})
              </Button>
            )}
            {canCatchUpCall && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={catchUpBusy || rows.length === 0}
                title="Gọi Auto Call cho đơn chưa được gọi (vd. nhập kho lúc Auto Call tắt / lỗi). Không chọn đơn = kiểm tra cả danh sách đang lọc."
                onClick={() => void previewCatchUp()}
              >
                <PhoneCall className="h-4 w-4" />
                {catchUpBusy && !catchUpOpen
                  ? "Đang kiểm tra…"
                  : selected.size > 0
                    ? `Gọi Auto Call bù (${selected.size})`
                    : "Gọi Auto Call bù"}
              </Button>
            )}
            {canAhamove &&
              (tab === "DELIVERING" || tab === "FAILED" || tab === "REDELIVER_WAIT") &&
              ahamoveCancellable && (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={ahamoveCancelling}
                onClick={() => selectedOne && void cancelAhamove(selectedOne)}
              >
                <Bike className="h-4 w-4" />
                {ahamoveCancelling ? "Đang hủy…" : "Hủy Ahamove"}
              </Button>
            )}
            {tab !== "TRANSFERRING" &&
              !HANDOVER_TABS.has(tab) &&
              activeTab.action &&
              !(tab === "WH_IN" && !canAssignOnWeb) && (
              <Button
                className="gap-2"
                disabled={selected.size === 0}
                onClick={() => runAction([...selected])}
              >
                {tab === "DELIVERING" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : tab === "FAILED" || tab === "REDELIVER_WAIT" ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Warehouse className="h-4 w-4" />
                )}
                {activeTab.action} ({selected.size})
              </Button>
            )}
            {tab === "WH_IN" && !canAssignOnWeb ? (
              <p className="text-xs text-muted-foreground self-center">
                Gán lên xe: dùng app <span className="font-medium">Lên hàng</span>
              </p>
            ) : null}
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>{ordersLoad.fullyLoaded ? "Không có đơn trong mục này" : "Đang tải đơn…"}</EmptyState>
        ) : tab === "TRANSFERRING" || tab === "TRANSFER_PENDING" ? (
          <div className="space-y-2">
            {pageGroups.map((g) => {
              const open = expandedPlates.has(g.key);
              const limit = groupLimit[g.key] ?? GROUP_ORDER_STEP;
              const hasCheckbox = canUnassignTrip;
              const departClock = formatDepartFull(g.departAt);
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
                  <div
                    className={cn("flex items-center rounded-md", open && "rounded-b-none")}
                    style={{ backgroundColor: "#45556C" }}
                  >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-4 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                        "text-white hover:brightness-110",
                        open && "rounded-b-none",
                      )}
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-slate-300 transition-transform",
                          open && "rotate-180",
                        )}
                      />
                      <span className="shrink-0 font-semibold tracking-wide">{g.plate}</span>
                      {g.driver ? (
                        <span className="hidden shrink-0 text-slate-200 sm:inline">{g.driver}</span>
                      ) : null}
                      {g.route ? (
                        <span className="min-w-0 flex-1 truncate text-slate-300">{g.route}</span>
                      ) : (
                        <span className="min-w-0 flex-1" />
                      )}
                      {departClock ? (
                        <span className="shrink-0 font-medium text-white">Xuất phát {departClock}</span>
                      ) : null}
                      <span className="shrink-0 whitespace-nowrap text-slate-200">
                        {g.orders.length} đơn · {g.qty} kiện
                        {tab === "TRANSFERRING" ? " còn trên xe" : ""} · {g.weight.toFixed(1)} kg
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  {canReassign && g.key !== UNASSIGNED_PLATE ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mr-2 shrink-0 gap-1.5"
                      title={`Chuyển toàn bộ ${g.orders.length} đơn của xe ${g.plate} sang xe khác`}
                      onClick={() => openReassign(g.orders.map((o) => o.code), g.plate)}
                    >
                      <Truck className="h-4 w-4" />
                      Chuyển xe
                    </Button>
                  ) : null}
                  </div>
                  <CollapsibleContent>
                    <div className="overflow-x-auto rounded-b-md border border-t-0 border-slate-200">
                      <table className="w-full min-w-[1180px] text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide">
                            {hasCheckbox ? (
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
                            <th className={`${TH_MUTED} pl-6`}>Mã đơn</th>
                            <th className={TH_MUTED}>Người gửi</th>
                            <th className={TH_MUTED}>Người nhận</th>
                            <th className={TH_MUTED}>VP gửi → VP nhận</th>
                            <th className={`${TH_MUTED} text-right`}>Kiện</th>
                            <th className={`${TH_MUTED} text-right`}>KL (kg)</th>
                            <OrderFeeHeader />
                            <th className={`${TH_MUTED} text-right`}>Tác vụ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.orders.slice(0, limit).map((r) => (
                            <Fragment key={r.code}>
                              <tr className="border-b hover:bg-muted/40">
                                {hasCheckbox ? (
                                  <td className="px-2 py-2">
                                    <Checkbox
                                      checked={selected.has(r.code)}
                                      onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                                      aria-label={`Chọn ${r.code}`}
                                    />
                                  </td>
                                ) : null}
                                <td className="px-2 py-2 pl-6 font-medium">
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
                                  <StageTime order={r} tab={tab} />
                                  {isReturnFlow(r) && (
                                    <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700">
                                      HOÀN
                                    </Badge>
                                  )}
                                  {r.homeDelivery && (
                                    <Badge variant="secondary" className="ml-2">
                                      Giao tận nơi
                                    </Badge>
                                  )}
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
                                  <OfficeRouteCell order={r} />
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {tab === "TRANSFERRING" ? (
                                    <InboundCountCell order={r} context="ON_TRUCK" />
                                  ) : (
                                    packageCount(r)
                                  )}
                                </td>
                                <OrderWeightCell order={r} />
                                <OrderFeeCell order={r} />
                                <td className="px-2 py-2 text-right">
                                  <div className="flex flex-wrap items-center justify-end gap-1">
                                    {canUnassignTrip && r.tripCode ? (
                                      <NhapKhoRowActions code={r.code}>
                                          {canReassign ? (
                                            <DropdownMenuItem onClick={() => openReassign([r.code], g.plate)}>
                                              <Truck className="mr-2 h-4 w-4" /> Chuyển xe
                                            </DropdownMenuItem>
                                          ) : null}
                                          <DropdownMenuItem
                                            disabled={unassigning}
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => void unassignFromTrip([r.code])}
                                          >
                                            <Unlink className="mr-2 h-4 w-4" /> Gỡ khỏi xe
                                          </DropdownMenuItem>
                                      </NhapKhoRowActions>
                                    ) : (
                                      <NhapKhoRowActions code={r.code} />
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {expandedOrders.has(r.code) && (
                                <OrderPackageListRow
                                  order={r}
                                  layout="rows"
                                  leadingCols={hasCheckbox ? 1 : 0}
                                  feeCols={FEE_COL_COUNT}
                                  inboundContext={tab === "TRANSFERRING" ? "ON_TRUCK" : undefined}
                                  onPrintPackage={(code, seq) => setPrintTarget({ code, packageSeq: seq })}
                                />
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                      {g.orders.length > limit ? (
                        <div className="flex items-center justify-center gap-2 border-t py-2 text-sm text-muted-foreground">
                          Đang hiện {limit}/{g.orders.length} đơn
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setGroupLimit((prev) => ({ ...prev, [g.key]: limit + GROUP_ORDER_STEP }))
                            }
                          >
                            Xem thêm {Math.min(GROUP_ORDER_STEP, g.orders.length - limit)} đơn
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
            <TablePagination pager={groupPager} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className={`${TH_MUTED} pl-6`}>Mã đơn</th>
                  <th className={TH_MUTED}>Người gửi</th>
                  <th className={TH_MUTED}>Người nhận</th>
                  <th className={TH_MUTED}>VP gửi → VP nhận</th>
                  <th className={`${TH_MUTED} text-right`}>Kiện</th>
                  <th className={`${TH_MUTED} text-right`}>KL (kg)</th>
                  <OrderFeeHeader />
                  {tab === "DEST_WH_IN" ? (
                    <th className={`${TH_MUTED} text-right whitespace-nowrap`}>Cước shipper tạm tính</th>
                  ) : null}
                  <th className={`${TH_MUTED} text-right`}>Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <Fragment key={r.code}>
                    <tr className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(r.code)}
                          onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                          aria-label={`Chọn ${r.code}`}
                        />
                      </td>
                      <td className="px-2 py-2 pl-6 font-medium">
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
                        <StageTime order={r} tab={tab} />
                        {isReturnFlow(r) && (
                          <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700">
                            HOÀN
                          </Badge>
                        )}
                        {r.homeDelivery && (
                          <Badge variant="secondary" className="ml-2">
                            Giao tận nơi
                          </Badge>
                        )}
                        {r.partnerCode === "AHAMOVE" && r.partnerOrderId ? <AhamoveInfo order={r} /> : null}
                        {r.shipperName && r.status === "OUT_FOR_DELIVERY" ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Shipper: <span className="font-medium text-foreground">{r.shipperName}</span>
                            {r.shipperPhone ? ` · ${r.shipperPhone}` : ""}
                          </div>
                        ) : null}
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
                        <OfficeRouteCell order={r} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {tab === "DEST_WH_IN" ? (
                          <InboundCountCell order={r} context="DEST_WH_IN" />
                        ) : (
                          (r.quantity ?? 1)
                        )}
                      </td>
                      <OrderWeightCell order={r} />
                      <OrderFeeCell order={r} />
                      {tab === "DEST_WH_IN" ? (
                        <td className="px-2 py-2 text-right tabular-nums">
                          {(() => {
                            const fee = estimateShipperFare(r);
                            return fee == null ? "—" : formatMoney(fee);
                          })()}
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <NhapKhoRowActions code={r.code}>
                                {tab === "WH_IN" || tab === "DEST_WH_IN" ? (
                                  <DropdownMenuItem
                                    onClick={() => setPrintTarget({ code: r.code, batchPackages: true })}
                                  >
                                    <Printer className="mr-2 h-4 w-4" /> In các kiện
                                  </DropdownMenuItem>
                                ) : null}
                                {tab === "DELIVERING" ? (
                                  <DropdownMenuItem onClick={() => fail([r.code])}>
                                    <XCircle className="mr-2 h-4 w-4" /> Thất bại
                                  </DropdownMenuItem>
                                ) : null}
                                {canPressReturn && r.status !== "RETURNING" && r.status !== "RETURNED" ? (
                                  <DropdownMenuItem onClick={() => askStartReturn([r.code])}>
                                    <Undo2 className="mr-2 h-4 w-4" /> Hoàn người gửi
                                  </DropdownMenuItem>
                                ) : null}
                                {canCancelReturn &&
                                r.status === "RETURNING" &&
                                stageOf(r) === "WH_IN" ? (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => void cancelReturn([r.code])}
                                  >
                                    <Ban className="mr-2 h-4 w-4" /> Huỷ hoàn
                                  </DropdownMenuItem>
                                ) : null}
                                {canCancelOrder && isCancellable(r) ? (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => askCancelOrders([r.code])}
                                  >
                                    <Ban className="mr-2 h-4 w-4" /> Huỷ đơn
                                  </DropdownMenuItem>
                                ) : null}
                                {canRequestCancel && isCancelRequestable(r) ? (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => askCancelRequest([r.code])}
                                  >
                                    <Ban className="mr-2 h-4 w-4" /> Yêu cầu huỷ
                                  </DropdownMenuItem>
                                ) : null}
                          </NhapKhoRowActions>
                          {activeTab.action && !(tab === "WH_IN" && !canAssignOnWeb) && (
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
                        layout="rows"
                        leadingCols={1}
                        feeCols={FEE_COL_COUNT}
                        extraTailCols={tab === "DEST_WH_IN" ? 1 : 0}
                        inboundContext={tab === "DEST_WH_IN" ? "DEST_WH_IN" : undefined}
                        onPrintPackage={
                          tab === "WH_IN" || tab === "DEST_WH_IN"
                            ? undefined
                            : (code, seq) => setPrintTarget({ code, packageSeq: seq })
                        }
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <TablePagination pager={pager} />
          </div>
        )}
      </Section>

      <AssignShipperDialog
        order={shipperCode ? (orders.find((o) => o.code === shipperCode) ?? null) : null}
        onOpenChange={(v) => !v && setShipperCode(null)}
        onInternal={assignInternal}
        onDone={() => {
          setSelected(new Set());
          void refreshOrdersNow();
        }}
      />
      <PodConfirmDialog
        codes={podCodes}
        open={podOpen}
        onOpenChange={setPodOpen}
        onFinished={() => {
          setSelected(new Set());
          void refreshOrdersNow();
        }}
      />

      <ReturnStartDialog
        open={returnStartOpen}
        codes={returnStartCodes}
        onOpenChange={setReturnStartOpen}
        onConfirm={startReturn}
      />

      <CancelOrderDialog
        open={cancelCodes.length > 0}
        codes={cancelCodes}
        onOpenChange={(v) => !v && setCancelCodes([])}
        onConfirm={(codes, reason) => void cancelOrders(codes, reason)}
      />

      <CancelOrderDialog
        open={cancelRequestCodes.length > 0}
        codes={cancelRequestCodes}
        onOpenChange={(v) => !v && setCancelRequestCodes([])}
        onConfirm={(codes, reason) => void sendCancelRequests(codes, reason)}
        title="Gửi yêu cầu huỷ đơn"
        description="sẽ tạm ẩn khỏi danh sách và chờ admin duyệt. Admin duyệt thì đơn mới huỷ; từ chối thì đơn hiện lại ở Nhập kho gửi."
        confirmLabel="Gửi yêu cầu huỷ"
      />

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

      <Dialog open={inboundPlatesOpen} onOpenChange={setInboundPlatesOpen}>
        <DialogContent className="max-h-[85vh] w-[min(92vw,680px)] max-w-[680px] overflow-hidden flex flex-col gap-3">
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
                    <th className="px-3 py-2 whitespace-nowrap">Xuất phát</th>
                    <th className="px-3 py-2 text-right">SL đơn</th>
                    <th className="px-3 py-2 text-right">SL kiện</th>
                  </tr>
                </thead>
                <tbody>
                  {inboundPlateSummary.map((g) => (
                    <tr key={g.key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-semibold tracking-wide">{g.plate}</td>
                      <td className="px-3 py-2 text-muted-foreground">{g.driver || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDepartFull(g.departAt) || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <CountButton
                          value={g.orderCount}
                          onClick={() => openInboundOrders(`Đơn trên xe ${g.plate}`, g.orders)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{g.packageCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-3 py-2" colSpan={3}>
                      Tổng
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <CountButton
                        value={inboundTotals.orders}
                        onClick={() =>
                          openInboundOrders(
                            `Đơn đang giao tới ${officeName(scopedOffice) || scopedOffice}`,
                            inboundPlateSummary.flatMap((g) => g.orders),
                          )
                        }
                      />
                    </td>
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

      <OrderListDialog
        title={inboundOrderList?.title ?? ""}
        description="Đơn còn kiện trên xe sẽ giao tới VP này"
        timeLabel="Ký nhận"
        rows={inboundOrderList?.rows ?? null}
        onClose={() => setInboundOrderList(null)}
      />

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
            <DialogTitle>
              {reassignFrom === null
                ? "Gán hàng lên xe"
                : `Chuyển sang xe khác${reassignFrom ? ` (đang ở xe ${reassignFrom})` : ""}`}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
            <AssignVehiclePicker
              open={assignOpen}
              onPick={setAssignPick}
              presetBranch={assignPresetBranch}
              presetItinerary={assignPresetItinerary}
            />

            <div className="min-w-0">
              <Label className="text-xs">Đơn hàng đã chọn ({assignRows.length})</Label>
              <div className="mt-2 max-h-[200px] overflow-auto rounded-md border">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 text-left text-xs uppercase tracking-wide">
                      <th className={`${TH_MUTED} pl-4`}>Mã đơn</th>
                      <th className={TH_MUTED}>Người gửi</th>
                      <th className={TH_MUTED}>Người nhận</th>
                      <th className={TH_MUTED}>VP gửi → VP nhận</th>
                      <th className={`${TH_MUTED} text-right`}>Kiện</th>
                      <th className={`${TH_MUTED} text-right`}>KL (kg)</th>
                      <OrderFeeHeader />
                    </tr>
                  </thead>
                  <tbody>
                    {assignRows.map((r) => (
                      <tr key={r.code} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium"><OrderCodeLink code={r.code} /></td>
                        <td className="px-2 py-2">{r.senderName ?? r.senderPhone}</td>
                        <td className="px-2 py-2">{r.receiverName}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <OfficeRouteCell order={r} />
                        </td>
                        <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                        <OrderWeightCell order={r} />
                        <OrderFeeCell order={r} />
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
            <Button disabled={!assignPick || assigning} onClick={confirmAssign}>
              {assigning
                ? reassignFrom === null ? "Đang gán…" : "Đang chuyển…"
                : reassignFrom === null ? "Xác nhận gán lên xe" : "Xác nhận chuyển xe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catchUpOpen} onOpenChange={(o) => !o && !catchUpBusy && setCatchUpOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gọi Auto Call bù</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Gọi giao cho người nhận của{" "}
              <span className="font-semibold">{catchUp?.eligible.length ?? 0} đơn</span> chưa được
              gọi. Ngoài khung giờ gọi sẽ tự hẹn gọi vào đầu khung giờ kế tiếp.
            </p>
            <div className="max-h-32 overflow-y-auto rounded border p-2 font-mono text-xs">
              {catchUp?.eligible.join(", ")}
            </div>
            {catchUpSkipSummary.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium">Không gọi bù:</p>
                <ul className="list-disc pl-4">
                  {catchUpSkipSummary.map(([reason, n]) => (
                    <li key={reason}>
                      {reason}: {n} đơn
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={catchUpBusy} onClick={() => setCatchUpOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={catchUpBusy} onClick={() => void confirmCatchUp()}>
              {catchUpBusy ? "Đang gọi…" : `Gọi ${catchUp?.eligible.length ?? 0} đơn`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NhapKhoRowActions({ code, children }: { code: string; children?: ReactNode }) {
  const { session } = useAuth();
  const order = useStore((s) => s.orders.find((o) => o.code === code));
  const { menuItems: issueMenuItems, dialog: issueDialog } = useAdminIssueMenu(code);
  const canIssues = !!order && canAdminMarkIssue(order, session?.role);
  const hasExtra = !!children;
  if (!canIssues && !hasExtra) return null;

  return (
    <>
      <RowActionsMenu title="Tác vụ đơn">
        {children}
        {issueMenuItems}
      </RowActionsMenu>
      {issueDialog}
    </>
  );
}

