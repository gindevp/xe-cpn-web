// Global store X.E — persist key `xe-vthh-v1` (chỉ session; master/đơn/chuyến lấy từ API).
// Mọi thao tác ghi phải đi qua store; state machine chặn transition sai.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Order,
  type OrderStatus,
  type Trip,
  type TripStatus,
  type Role,
  type OfficeRec,
} from "./mock-data";
import { assignedOfficeCode, resolveViewOffice, VIEW_ALL_OFFICES } from "./office-scope";

// ---------- Types ----------
export type Session = { username: string; role: Role; office: string };

export type VehicleRec = {
  id?: number;
  bks: string;
  capacity: number;
  vehicleType?: string;
  volumeM3?: number;
  note?: string;
  officeCode?: string;
  driverName?: string;
  active?: boolean;
};

export type OrderEvent = {
  at: string;
  by: string;
  action: string;
  detail?: string;
};

export type Payment = {
  at: string;
  by: string;
  amount: number; // âm = hoàn
  method: "TM" | "CK" | "THE";
  kind: "TRUOC" | "SAU" | "HOAN" | "COD";
  note?: string;
};

export type PodPhoto = { at: string; by: string; url: string };

export type FailRecord = { at: string; by: string; reason: string };

export type OrderX = Order & {
  events?: OrderEvent[];
  payments?: Payment[];
  podPhotos?: PodPhoto[];
  labelPrintedAt?: string;
  labelReprintCount?: number;
  failCount?: number;
  failHistory?: FailRecord[];
  receiverActualName?: string;
  receiverActualPhone?: string;
  cancelReason?: string;
  issue?: {
    type: "EXCEPTION" | "LOST" | "DAMAGED";
    reason?: string;
    at: string;
    by: string;
    resolvedAt?: string;
  };
  pendingFareApprove?: { newFare: number; reason: string; by: string; at: string };
  partnerCode?: string;
  partnerFee?: number;
  paymentPercent?: number; // % trước
  returnRequest?: {
    reason: string;
    requestedBy: string;
    requestedAt: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    decidedBy?: string;
    decidedAt?: string;
  };
};

export type TripX = Trip & {
  scannedCodes?: string[];
  loadedCodes?: string[]; // đơn gắn lúc xuất
  events?: OrderEvent[];
};

export type PricingRule = {
  id: string;
  /** Tuyến (Branch) display name */
  route: string;
  /** Lộ trình (Itinerary) display name — filter key with route */
  itinerary?: string;
  tier: string; // "0-2kg"
  minKg: number;
  maxKg: number;
  unit: number;
  surcharge: number;
  dimDivisor?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  kmMin?: number;
  kmRate?: number;
  /** Bước tăng thêm (gram) sau mức cân tối đa */
  stepG?: number;
  /** Phí cộng thêm cho mỗi bước tăng (VND) */
  addFee?: number;
};

export type PricingLog = {
  at: string;
  by: string;
  ruleId: string;
  before: Partial<PricingRule> | null;
  after: Partial<PricingRule>;
};

export type UserRec = {
  username: string;
  role: Role;
  office: string;
  active: boolean;
  passwordHash?: string;
  /** Permission group code (chức danh). Defaults to the built-in group of `role`. */
  roleGroup?: string;
};

export type AuditLog = {
  at: string;
  by: string;
  action: string;
  entityType: string;
  entityId: string;
  detail?: string;
};

export type DayClosure = {
  office: string;
  date: string; // yyyy-mm-dd
  confirmedBy: string;
  confirmedAt: string;
  reopenedBy?: string;
  reopenedAt?: string;
};

export type OfflineAction = {
  id: string;
  at: string;
  kind: "SCAN_OUT" | "SCAN_IN" | "POD_HOME" | "POD_COUNTER" | "FAIL";
  payload: any;
};

export type Integrations = {
  ahamoveToken?: string;
  grabToken?: string;
  xanhsmToken?: string;
  goongToken?: string; // Goong / Google Distance Matrix
  telegramToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
  webhookSecret?: string; // HMAC secret
  updatedAt?: string;
};

export type CodFeeTier = {
  /** Cận dưới: 0 = Từ 0 (gồm 0); >0 = Trên mức này (không gồm đúng bằng) */
  minAmount: number;
  /** Cận trên gồm biên; null = không giới hạn (bậc %) */
  maxAmount: number | null;
  /** Phí cố định VNĐ; null khi bậc % */
  feeAmount: number | null;
  /** % trên tiền thu hộ; null khi bậc cố định */
  feePercent: number | null;
};

export type SurchargeConfig = {
  homeDelivery: { enabled: boolean; amount: number };
  /** percent/minFee: fallback khi chưa có tiers */
  cod: { enabled: boolean; percent: number; minFee: number; tiers: CodFeeTier[] };
  storage: { enabled: boolean; freeDays: number; feePerDay: number };
  /** Phí khai báo giá trị 2 bậc: <= threshold thu percentUnder%, > threshold thu percentOver% */
  insurance: {
    enabled: boolean;
    threshold: number;
    percentUnder: number;
    percentOver: number;
  };
  refund: { enabled: boolean; percent: number };
  updatedAt?: string;
};

/** Bậc COD mặc định theo thẻ phí khách (mức 1–5 cố định, mức 6 = 1%). */
export const DEFAULT_COD_TIERS: CodFeeTier[] = [
  { minAmount: 0, maxAmount: 2_000_000, feeAmount: 30_000, feePercent: null },
  { minAmount: 2_000_000, maxAmount: 5_000_000, feeAmount: 40_000, feePercent: null },
  { minAmount: 5_000_000, maxAmount: 10_000_000, feeAmount: 60_000, feePercent: null },
  { minAmount: 10_000_000, maxAmount: 15_000_000, feeAmount: 80_000, feePercent: null },
  { minAmount: 15_000_000, maxAmount: 20_000_000, feeAmount: 100_000, feePercent: null },
  { minAmount: 20_000_000, maxAmount: null, feeAmount: null, feePercent: 1 },
];

export const DEFAULT_SURCHARGES: SurchargeConfig = {
  homeDelivery: { enabled: false, amount: 0 },
  cod: { enabled: false, percent: 0, minFee: 0, tiers: DEFAULT_COD_TIERS.map((t) => ({ ...t })) },
  storage: { enabled: false, freeDays: 0, feePerDay: 0 },
  insurance: { enabled: false, threshold: 0, percentUnder: 0, percentOver: 0 },
  refund: { enabled: false, percent: 0 },
};

/** Bảng phí lấy/giao hàng tận nơi: theo khoảng cân × khoảng cách */
export type DoorFeeRule = {
  id: string;
  kind: "PICKUP" | "DELIVERY";
  minKg: number;
  maxKg: number;
  minKm: number;
  maxKm: number;
  fee: number;
};

/** Bảng giá đặc thù theo sản phẩm (ngoài bảng giá theo cân nặng) */
export type ProductPriceRule = {
  id: string;
  group: string; // Nhóm hàng: Tivi, Tủ lạnh...
  name: string; // Tên hàng hóa / quy cách
  currentPrice: number; // Bảng giá hiện tại
  price: number; // Bảng giá đề xuất/áp dụng
  note?: string;
};

export type CustomerProfile = { phone: string; name: string; lastAt: string; count: number };

// ---------- State machine ----------
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_TRANSIT", "DELIVERED", "CANCELLED"],
  WAITING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["WAITING", "AT_DEST"],
  AT_DEST: ["OUT_FOR_DELIVERY", "DELIVERED", "RETURNING"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_DELIVERY"],
  FAILED_DELIVERY: ["OUT_FOR_DELIVERY", "AT_DEST"],
  DELIVERED: ["RETURNING"],
  CANCELLED: [],
  RETURNING: ["RETURNED"],
  RETURNED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  CREATED: ["LOADING", "CANCELLED"],
  LOADING: ["DEPARTED", "CANCELLED"],
  DEPARTED: ["UNLOADING"],
  UNLOADING: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionTrip(from: TripStatus, to: TripStatus) {
  return TRIP_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------- Helpers ----------
const nowIso = () => new Date().toISOString();
const rid = () => Math.random().toString(36).slice(2, 10);

export type ReceiptRec = {
  code: string;
  createdBy: string;
  payer: string; // người nộp tiền (điều phối viên)
  payerCode?: string; // mã nhân viên
  createdAt: string;
  total: number;
  orderCodes: string[];
  office?: string;
};

function vehicleToApiBody(v: VehicleRec, id?: number) {
  return {
    ...(id != null ? { id } : {}),
    plateNumber: v.bks,
    capacityKg: v.capacity,
    vehicleType: v.vehicleType || null,
    volumeM3: v.volumeM3 ?? null,
    note: v.note || null,
    active: v.active !== false,
    office: v.officeCode ? { code: v.officeCode } : null,
    defaultDriver: v.driverName ? { fullName: v.driverName } : null,
  };
}

// ---------- Store ----------
type State = {
  session: Session | null;
  /** Admin-selected viewing office; non-admin is always the assigned office. */
  viewOffice: string;
  hydrated: boolean;
  orders: OrderX[];
  trips: TripX[];
  pricingRules: PricingRule[];
  pricingLogs: PricingLog[];
  users: UserRec[];
  auditLogs: AuditLog[];
  receipts: ReceiptRec[];
  dayClosures: DayClosure[];
  offlineQueue: OfflineAction[];
  customerProfiles: Record<string, CustomerProfile>;
  integrations: Integrations;
  surcharges: SurchargeConfig;
  doorFees: DoorFeeRule[];
  productPricing: ProductPriceRule[];
  online: boolean;
  // masters
  offices: OfficeRec[];
  routes: string[];
  vehicles: VehicleRec[];
  drivers: string[];
};

type Actions = {
  setHydrated: (v: boolean) => void;
  setOnline: (v: boolean) => void;
  // auth
  login: (
    u: string,
    p: string,
  ) => Promise<{ ok: true; role: Role } | { ok: false; error: string }>;
  logout: () => void;
  setViewOffice: (code: string) => void;
  // audit
  audit: (a: Omit<AuditLog, "at" | "by"> & { by?: string }) => void;
  addReceipt: (
    r: Omit<ReceiptRec, "code" | "createdAt" | "createdBy"> & {
      code?: string;
      /** due theo candidates — tránh store đơn cũ sau POD */
      lineAmounts?: Record<string, number>;
    },
  ) => ReceiptRec;
  // order
  addOrder: (
    o: OrderX,
    opts?: { skipApi?: boolean },
  ) => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  updateOrder: (
    code: string,
    patch: Partial<OrderX>,
    opts?: { eventAction?: string; eventDetail?: string },
  ) => void;
  /** Ghi lịch sử thao tác (in tem, …) — không đổi field đơn. */
  logOrderEvent: (code: string, action: string, detail?: string) => void;
  transitionOrder: (
    code: string,
    to: OrderStatus,
    action: string,
    detail?: string,
  ) => { ok: true } | { ok: false; error: string };
  advanceOrderLeg: (code: string) => { ok: true; finished: boolean } | { ok: false; error: string };
  addPayment: (code: string, p: Payment) => void;
  addPodPhoto: (code: string, url: string) => void;
  // trip
  addTrip: (t: TripX) => void;
  updateTrip: (code: string, patch: Partial<TripX>) => void;
  transitionTrip: (
    code: string,
    to: TripStatus,
  ) => { ok: true } | { ok: false; error: string };
  // pricing
  upsertPricing: (rule: PricingRule) => Promise<void>;
  removePricing: (id: string) => Promise<void>;
  copyPricingToRoutes: (
    sourceRoute: string,
    targetRoutes: string[],
    opts?: { replaceExisting?: boolean },
  ) => Promise<{ copiedTo: string[]; skipped: string[] }>;
  // users
  upsertUser: (u: UserRec) => { ok: true } | { ok: false; error: string };
  removeUser: (username: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  // day closure
  closeDay: (office: string, date: string, by: string) => void;
  reopenDay: (office: string, date: string, by: string) => void;
  // offline
  enqueueOffline: (a: Omit<OfflineAction, "id" | "at">) => void;
  flushOffline: () => number;
  // integrations
  setIntegrations: (i: Partial<Integrations>) => void;
  setSurcharges: (s: SurchargeConfig) => void;
  setDoorFees: (r: DoorFeeRule[]) => void;
  upsertProductPrice: (r: ProductPriceRule) => void;
  removeProductPrice: (id: string) => void;
  // customer
  upsertCustomer: (phone: string, name: string) => void;
  // maintenance
  expireDrafts: () => number; // DRAFT >24h -> CANCELLED
  // masters CRUD
  addOffice: (code: string, name: string) => void;
  updateOffice: (code: string, patch: { code?: string; name: string }) => void;
  removeOffice: (code: string) => void;
  addRoute: (r: string) => void;
  updateRoute: (oldName: string, newName: string) => void;
  removeRoute: (r: string) => void;
  addVehicle: (v: VehicleRec) => void;
  updateVehicle: (bks: string, patch: VehicleRec) => void;
  removeVehicle: (bks: string) => void;
  addDriver: (n: string) => void;
  updateDriver: (oldName: string, newName: string) => void;
  removeDriver: (n: string) => void;
};

export type Store = State & Actions;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      session: null,
      viewOffice: "",
      hydrated: false,
      orders: [],
      trips: [],
      pricingRules: [],
      pricingLogs: [],
      users: [],
      auditLogs: [],
      receipts: [],
      dayClosures: [],
      offlineQueue: [],
      customerProfiles: {},
      integrations: {},
      surcharges: DEFAULT_SURCHARGES,
      doorFees: [],
      productPricing: [],
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      offices: [],
      routes: [],
      vehicles: [],
      drivers: [],

      setHydrated: (v) => set({ hydrated: v }),
      setOnline: (v) => set({ online: v }),

      login: async (username, password) => {
        const { isApiEnabled } = await import("./api/client");
        if (isApiEnabled()) {
          const { loginWithApi } = await import("./api/auth-api");
          const { syncAllFromApi } = await import("./api/sync");
          const r = await loginWithApi(username, password);
          if (!r.ok) return r;
          const assigned = r.office && r.office !== "ALL" ? r.office : "";
          set({
            session: { username: r.username, role: r.role, office: r.office },
            viewOffice: r.office === "ALL" ? assigned || get().viewOffice || "ALL" : assigned,
          });
          get().audit({ action: "LOGIN", entityType: "user", entityId: r.username, detail: "API" });
          try {
            await syncAllFromApi();
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "session",
              entityId: r.username,
              detail: e?.message ?? "sync",
            });
          }
          return { ok: true, role: r.role };
        }
        return { ok: false, error: "API chưa cấu hình" };
      },
      logout: () => {
        const s = get().session;
        if (s) get().audit({ action: "LOGOUT", entityType: "user", entityId: s.username });
        void import("./api/sync").then((m) => m.clearApiSession());
        set({ session: null, viewOffice: "" });
      },

      setViewOffice: (code) => {
        const next = code?.trim() || "";
        if (get().viewOffice === next) return;
        set({ viewOffice: next });
        if (!get().session || !get().hydrated) return;
        void import("./api/sync").then((m) => m.syncOrdersFromApi().catch(() => undefined));
      },

      audit: (a) => {
        const by = a.by ?? get().session?.username ?? "system";
        set((st) => ({
          auditLogs: [
            ...st.auditLogs,
            { at: nowIso(), by, action: a.action, entityType: a.entityType, entityId: a.entityId, detail: a.detail },
          ].slice(-2000),
        }));
      },

      addReceipt: (r) => {
        const st = get();
        const viewOffice = resolveViewOffice(st.session, st.viewOffice);
        const officeCode =
          r.office && r.office !== VIEW_ALL_OFFICES
            ? r.office
            : assignedOfficeCode(viewOffice) ||
              (st.session?.office !== VIEW_ALL_OFFICES ? st.session?.office : undefined);
        const seq = st.receipts.length + 1;
        const rec: ReceiptRec = {
          code: r.code ?? `PT${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(seq).padStart(4, "0")}`,
          createdBy: st.session?.username ?? "system",
          createdAt: nowIso(),
          payer: r.payer,
          payerCode: r.payerCode,
          total: r.total,
          orderCodes: r.orderCodes,
          office: officeCode,
        };
        set((s) => ({ receipts: [rec, ...s.receipts] }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            const created = await fin.createReceipt({
              payerName: rec.payer,
              payerCode: rec.payerCode,
              officeCode: rec.office && rec.office !== "ALL" ? rec.office : undefined,
              lines: rec.orderCodes.map((orderCode) => {
                const fromLine = r.lineAmounts?.[orderCode];
                if (fromLine != null && Number.isFinite(fromLine)) {
                  return { orderCode, amountCollected: Math.max(0, fromLine) };
                }
                const o = get().orders.find((x) => x.code === orderCode);
                const due = Math.max(0, (o?.fare ?? 0) - (o?.paidAmount ?? 0));
                return { orderCode, amountCollected: due };
              }),
            });
            set((s) => ({
              receipts: s.receipts.map((x) => (x.code === rec.code ? created : x)),
            }));
            const { syncOrdersFromApi, syncFinanceFromApi } = await import("./api/sync");
            await Promise.all([syncOrdersFromApi(), syncFinanceFromApi().catch(() => undefined)]);
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "receipt",
              entityId: rec.code,
              detail: e?.message ?? "createReceipt",
            });
          }
        })();
        return rec;
      },

      addOrder: async (o, opts) => {
        const withEvents: OrderX = {
          ...o,
          events: o.events ?? [{ at: nowIso(), by: get().session?.username ?? "system", action: "CREATED" }],
        };

        if (opts?.skipApi) {
          set((st) => ({ orders: [withEvents, ...st.orders] }));
          return { ok: true, code: o.code };
        }

        const { isApiEnabled } = await import("./api/client");
        if (!isApiEnabled()) {
          return { ok: false, error: "API chưa cấu hình — không thể lưu đơn lên máy chủ" };
        }
        if (!get().online) {
          return { ok: false, error: "Không có kết nối mạng — vui lòng thử lại" };
        }
        if (!get().offices.length) {
          return { ok: false, error: "Danh sách văn phòng chưa tải xong — vui lòng đợi vài giây rồi thử lại" };
        }

        const domain = await import("./api/domain-api");
        const { resolveOfficeCodeStrict } = await import("./api/sync");
        const { embedGoodsName } = await import("./package-label");
        const { goodsTypeFromName } = await import("./mock-data");
        const goods = ["THUONG", "DE_VO", "DIEN_TU", "THUC_PHAM_KHO", "GIAY_TO", "CONG_KENH"].includes(o.goodsType)
          ? o.goodsType
          : goodsTypeFromName(o.goodsType);
        const paymentTerm = ["GUI_TRA", "NHAN_TRA", "P30_70", "P50_50", "P70_30", "COD"].includes(o.collectForm)
          ? o.collectForm
          : "GUI_TRA";
        const note = embedGoodsName(o.note, goods === o.goodsType ? undefined : o.goodsType);

        const fromOfficeCode = resolveOfficeCodeStrict(o.fromOffice);
        if (!fromOfficeCode) {
          return { ok: false, error: `Không xác định được VP gửi (“${o.fromOffice}”). Chọn lại VP hoặc tải lại trang.` };
        }
        const toOfficeCode = o.homeDelivery ? null : resolveOfficeCodeStrict(o.toOffice);
        if (!o.homeDelivery && !toOfficeCode) {
          return { ok: false, error: `Không xác định được VP nhận (“${o.toOffice}”). Chọn lại VP hoặc tải lại trang.` };
        }
        const hubOfficeCode = o.hubOffice ? resolveOfficeCodeStrict(o.hubOffice) : undefined;
        if (o.hubOffice && !hubOfficeCode) {
          return { ok: false, error: `Không xác định được VP trung chuyển (“${o.hubOffice}”).` };
        }
        const finalToOfficeCode = o.finalToOffice ? resolveOfficeCodeStrict(o.finalToOffice) : undefined;
        if (o.finalToOffice && !finalToOfficeCode) {
          return { ok: false, error: `Không xác định được VP đích cuối (“${o.finalToOffice}”).` };
        }

        try {
          if (o.status === "DRAFT") {
            const res = await domain.createDraft({
              senderPhone: o.senderPhone,
              senderName: o.senderName,
              receiverName: o.receiverName,
              receiverPhone: o.receiverPhone,
              goodsType: goods,
              paymentTerm,
              estimatedWeightKg: o.weightKg,
              homeDelivery: o.homeDelivery,
              deliveryAddress: o.address,
              homePickup: o.homePickup,
              pickupAddress: o.pickupAddress,
              toOfficeCode: o.homeDelivery ? undefined : toOfficeCode ?? undefined,
              hubOfficeCode: o.homeDelivery ? hubOfficeCode ?? toOfficeCode ?? undefined : hubOfficeCode,
              fromOfficeCode,
              note,
              branchCode: o.branchCode,
            });
            const mapped = await domain.getOrder(res.orderCode || res.draftCode);
            const saved: OrderX = {
              ...mapped,
              events: withEvents.events,
              address: o.address ?? mapped.address,
              pickupAddress: o.pickupAddress ?? mapped.pickupAddress,
              route: o.route,
              itinerary: o.itinerary,
            };
            set((st) => ({ orders: [saved, ...st.orders.filter((x) => x.code !== o.code)] }));
            return { ok: true, code: saved.code };
          }

          const created = await domain.createOrder({
            senderPhone: o.senderPhone,
            senderName: o.senderName,
            receiverName: o.receiverName,
            receiverPhone: o.receiverPhone,
            goodsType: goods,
            paymentTerm,
            fromOfficeCode,
            toOfficeCode: toOfficeCode ?? fromOfficeCode,
            hubOfficeCode,
            finalToOfficeCode,
            weightKg: o.weightKg,
            quantity: o.quantity ?? 1,
            homeDelivery: o.homeDelivery,
            homePickup: o.homePickup,
            qrDropOff: o.qrDropOff,
            deliveryAddress: o.address,
            pickupAddress: o.pickupAddress,
            note,
            fareAmount: o.fare,
            branchCode: o.branchCode,
            codAmount: o.codAmount ?? 0,
            codFeeAmount: o.codFee ?? 0,
            bankName: o.bankName,
            bankAccountNo: o.bankAccountNo,
            bankAccountName: o.bankAccountName,
            routeLabel: o.route,
            itineraryLabel: o.itinerary,
          });
          const saved: OrderX = {
            ...created,
            events: withEvents.events,
            address: o.address ?? created.address,
            pickupAddress: o.pickupAddress ?? created.pickupAddress,
            route: o.route ?? created.route,
            itinerary: o.itinerary ?? created.itinerary,
            hubOffice: created.hubOffice ?? o.hubOffice,
            finalToOffice: created.finalToOffice ?? o.finalToOffice,
            legs: created.legs?.length ? created.legs : o.legs,
            codAmount: o.codAmount ?? created.codAmount,
            codFee: o.codFee ?? created.codFee,
            bankName: o.bankName ?? created.bankName,
            bankAccountNo: o.bankAccountNo ?? created.bankAccountNo,
            bankAccountName: o.bankAccountName ?? created.bankAccountName,
          };
          set((st) => ({ orders: [saved, ...st.orders.filter((x) => x.code !== o.code)] }));
          return { ok: true, code: saved.code };
        } catch (e: any) {
          get().audit({
            action: "API_SYNC_FAIL",
            entityType: "order",
            entityId: o.code,
            detail: e?.message ?? "createOrder",
          });
          return { ok: false, error: e?.message ?? "Không lưu được đơn lên máy chủ" };
        }
      },

      updateOrder: (code, patch, opts) => {
        const prev = get().orders.find((x) => x.code === code || x.draftCode === code);
        const by = get().session?.username ?? "system";
        const at = nowIso();
        const eventAction = opts?.eventAction?.trim();
        const eventDetail = opts?.eventDetail?.trim();
        set((st) => ({
          orders: st.orders.map((o) => {
            if (o.code !== code && o.draftCode !== code) return o;
            const next: OrderX = { ...o, ...patch, updatedAt: at };
            if (eventAction) {
              next.events = [
                ...(o.events ?? []),
                { at, by, action: eventAction, detail: eventDetail?.slice(0, 255) },
              ];
            }
            return next;
          }),
        }));
        void import("./api/push").then((m) =>
          m.pushOrderPatch(prev?.code ?? code, patch, prev, opts),
        );
      },
      logOrderEvent: (code, action, detail) => {
        const prev = get().orders.find((x) => x.code === code || x.draftCode === code);
        if (!prev) return;
        const by = get().session?.username ?? "system";
        const at = nowIso();
        const act = action.trim() || "EVENT";
        const det = detail?.trim()?.slice(0, 255);
        const isPrint = act.toUpperCase() === "PRINT";
        set((st) => ({
          orders: st.orders.map((o) => {
            if (o.code !== prev.code) return o;
            const reprint =
              isPrint && o.labelPrintedAt
                ? (o.labelReprintCount ?? 0) + 1
                : isPrint
                  ? 0
                  : o.labelReprintCount;
            return {
              ...o,
              ...(isPrint ? { labelPrintedAt: at, labelReprintCount: reprint } : {}),
              updatedAt: at,
              events: [...(o.events ?? []), { at, by, action: act, detail: det }],
            };
          }),
        }));
        get().audit({
          action: act,
          entityType: "order",
          entityId: prev.code,
          detail: det,
        });
        void import("./api/push").then((m) => m.pushOrderEvent(prev.code, act, det));
      },
      transitionOrder: (code, to, action, detail) => {
        const st = get();
        const o = st.orders.find((x) => x.code === code || x.draftCode === code);
        if (!o) return { ok: false, error: "Không tìm thấy đơn (E-STATE-404)" };
        if (o.status === to) return { ok: true };
        if (!canTransitionOrder(o.status, to))
          return { ok: false, error: `Không thể chuyển ${o.status}→${to} (E-STATE-001)` };
        const by = st.session?.username ?? "system";
        const clearStage =
          to === "DELIVERED" || to === "CANCELLED" || to === "RETURNED" || to === "RETURNING";
        set({
          orders: st.orders.map((x) =>
            x.code === o.code
              ? {
                  ...x,
                  status: to,
                  ...(clearStage ? { stage: undefined } : {}),
                  updatedAt: nowIso(),
                  events: [...(x.events ?? []), { at: nowIso(), by, action, detail }],
                }
              : x,
          ),
        });
        get().audit({ action, entityType: "order", entityId: o.code, detail: `${o.status}→${to}${detail ? " · " + detail : ""}` });
        void import("./api/push").then((m) => m.pushOrderTransition(o.code, to, action, detail, o));
        return { ok: true };
      },

      advanceOrderLeg: (code) => {
        const st = get();
        const o = st.orders.find((x) => x.code === code || x.draftCode === code);
        if (!o) return { ok: false, error: "Không tìm thấy đơn" };
        if (!o.legs || o.legs.length < 2) return { ok: false, error: "Đơn không có chặng tiếp theo" };
        const cur = o.currentLegIndex ?? 0;
        const by = st.session?.username ?? "system";
        const at = nowIso();
        // Đánh dấu chặng hiện tại đã đến (AT_HUB nếu còn chặng sau, AT_DEST nếu là chặng cuối).
        const isLast = cur >= o.legs.length - 1;
        const newLegs = o.legs.map((l, i) => {
          if (i !== cur) return l;
          return { ...l, status: isLast ? ("AT_DEST" as const) : ("AT_HUB" as const), arrivedAt: at };
        });
        if (isLast) {
          // Chặng cuối: chuyển đơn sang AT_DEST như bình thường.
          set({
            orders: st.orders.map((x) =>
              x.code === o.code
                ? {
                    ...x,
                    legs: newLegs,
                    status: "AT_DEST" as OrderStatus,
                    updatedAt: at,
                    events: [
                      ...(x.events ?? []),
                      { at, by, action: "LEG_ARRIVE_DEST", detail: `Chặng ${cur + 1}/${o.legs!.length} đến VP đích` },
                    ],
                  }
                : x,
            ),
          });
          get().audit({ action: "LEG_ARRIVE_DEST", entityType: "order", entityId: o.code });
          void import("./api/push").then((m) => m.pushAdvanceLeg(o.code, o));
          return { ok: true, finished: true };
        }
        // Còn chặng sau: reset để đơn quay lại "Đơn chờ gán xe" tại hub.
        const nextLeg = o.legs[cur + 1];
        set({
          orders: st.orders.map((x) =>
            x.code === o.code
              ? {
                  ...x,
                  legs: newLegs,
                  currentLegIndex: cur + 1,
                  fromOffice: nextLeg.fromOffice,
                  toOffice: nextLeg.toOffice,
                  tripCode: undefined,
                  status: "CONFIRMED" as OrderStatus,
                  updatedAt: at,
                  events: [
                    ...(x.events ?? []),
                    { at, by, action: "LEG_ARRIVE_HUB", detail: `Chặng ${cur + 1}/${o.legs!.length} đến hub ${o.legs![cur].toOffice}` },
                    { at, by, action: "LEG_START", detail: `Bắt đầu chặng ${cur + 2}/${o.legs!.length}: ${nextLeg.fromOffice} → ${nextLeg.toOffice}` },
                  ],
                }
              : x,
          ),
        });
        get().audit({ action: "LEG_ADVANCE", entityType: "order", entityId: o.code, detail: `→ chặng ${cur + 2}` });
        void import("./api/push").then((m) => m.pushAdvanceLeg(o.code, o));
        return { ok: true, finished: false };
      },

      addPayment: (code, p) =>
        set((st) => ({
          orders: st.orders.map((o) => {
            if (o.code !== code && o.draftCode !== code) return o;
            const payments = [...(o.payments ?? []), p];
            const paidAmount = payments.reduce((s, x) => s + x.amount, 0);
            return { ...o, payments, paidAmount, updatedAt: nowIso() };
          }),
        })),

      addPodPhoto: (code, url) =>
        set((st) => ({
          orders: st.orders.map((o) =>
            o.code === code
              ? {
                  ...o,
                  podPhotos: [
                    ...(o.podPhotos ?? []),
                    { at: nowIso(), by: st.session?.username ?? "system", url },
                  ].slice(0, 3),
                  updatedAt: nowIso(),
                }
              : o,
          ),
        })),

      addTrip: (t) => set((st) => ({ trips: [t, ...st.trips] })),
      updateTrip: (code, patch) =>
        set((st) => ({
          trips: st.trips.map((t) => (t.code === code ? { ...t, ...patch } : t)),
        })),
      transitionTrip: (code, to) => {
        const st = get();
        const t = st.trips.find((x) => x.code === code);
        if (!t) return { ok: false, error: "Không tìm thấy chuyến" };
        if (!canTransitionTrip(t.status, to))
          return { ok: false, error: `Không thể chuyển ${t.status}→${to} (E-TRIP-001)` };
        set({ trips: st.trips.map((x) => (x.code === code ? { ...x, status: to } : x)) });
        get().audit({ action: "TRIP_" + to, entityType: "trip", entityId: code, detail: `${t.status}→${to}` });
        void import("./api/push").then((m) => m.pushTripTransition(code, to, t));
        return { ok: true };
      },

      removePricing: async (id) => {
        const { isApiEnabled } = await import("./api/client");
        if (isApiEnabled() && get().online) {
          try {
            const fin = await import("./api/finance-config-api");
            await fin.deletePricingRule(id);
            const rules = await fin.fetchPricingRules();
            set({ pricingRules: rules });
            get().audit({ action: "PRICING_DELETE", entityType: "pricing", entityId: id });
            return;
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "pricing", entityId: id, detail: e?.message });
            throw e;
          }
        }
        set((st) => ({ pricingRules: st.pricingRules.filter((r) => r.id !== id) }));
        get().audit({ action: "PRICING_DELETE", entityType: "pricing", entityId: id });
      },

      upsertPricing: async (rule) => {
        const st = get();
        const existing = st.pricingRules.find((r) => r.id === rule.id);
        const { isApiEnabled } = await import("./api/client");
        if (isApiEnabled() && get().online) {
          try {
            const fin = await import("./api/finance-config-api");
            const saved = await fin.savePricingRule(rule);
            set({
              pricingRules: existing
                ? st.pricingRules.map((r) => (r.id === rule.id ? saved : r))
                : [...st.pricingRules.filter((r) => r.id !== rule.id), saved],
              pricingLogs: [
                ...st.pricingLogs,
                {
                  at: nowIso(),
                  by: st.session?.username ?? "system",
                  ruleId: saved.id,
                  before: existing ?? null,
                  after: saved,
                },
              ],
            });
            get().audit({
              action: existing ? "PRICING_UPDATE" : "PRICING_CREATE",
              entityType: "pricing",
              entityId: saved.id,
            });
            return;
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "pricing", entityId: rule.id, detail: e?.message });
            throw e;
          }
        }
        set({
          pricingRules: existing
            ? st.pricingRules.map((r) => (r.id === rule.id ? rule : r))
            : [...st.pricingRules, rule],
          pricingLogs: [
            ...st.pricingLogs,
            {
              at: nowIso(),
              by: st.session?.username ?? "system",
              ruleId: rule.id,
              before: existing ?? null,
              after: rule,
            },
          ],
        });
        get().audit({ action: existing ? "PRICING_UPDATE" : "PRICING_CREATE", entityType: "pricing", entityId: rule.id });
      },

      copyPricingToRoutes: async (sourceRoute, targetRoutes, opts) => {
        const replaceExisting = opts?.replaceExisting !== false;
        const { isApiEnabled } = await import("./api/client");
        if (isApiEnabled() && get().online) {
          const fin = await import("./api/finance-config-api");
          const result = await fin.copyPricingToRoutes({
            sourceRoute,
            targetRoutes,
            rules: get().pricingRules,
            replaceExisting,
          });
          const rules = await fin.fetchPricingRules();
          set({ pricingRules: rules });
          get().audit({
            action: "PRICING_COPY",
            entityType: "pricing",
            entityId: sourceRoute,
            detail: `→ ${result.copiedTo.join(", ") || "(none)"}; skip ${result.skipped.join(", ") || "-"}`,
          });
          return result;
        }
        // Offline: clone in local store only
        const sourceRules = get()
          .pricingRules.filter((r) => r.route === sourceRoute)
          .slice()
          .sort((a, b) => a.minKg - b.minKg);
        if (!sourceRules.length) throw new Error(`Tuyến «${sourceRoute}» chưa có mức cước để copy`);
        const copiedTo: string[] = [];
        const skipped: string[] = [];
        set((st) => {
          let next = [...st.pricingRules];
          for (const target of targetRoutes) {
            if (!target || target === sourceRoute) continue;
            const existing = next.filter((r) => r.route === target);
            if (existing.length && !replaceExisting) {
              skipped.push(target);
              continue;
            }
            if (existing.length && replaceExisting) {
              next = next.filter((r) => r.route !== target);
            }
            for (const src of sourceRules) {
              next.push({
                ...src,
                id: "PR-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
                route: target,
                effectiveFrom: nowIso(),
                effectiveTo: undefined,
              });
            }
            copiedTo.push(target);
          }
          return { pricingRules: next };
        });
        return { copiedTo, skipped };
      },

      upsertUser: (u) => {
        const st = get();
        const existing = st.users.find((x) => x.username === u.username);
        if (!existing && st.users.some((x) => x.username === u.username))
          return { ok: false, error: "Trùng username" };
        set({
          users: existing
            ? st.users.map((x) => (x.username === u.username ? { ...x, ...u } : x))
            : [...st.users, u],
        });
        get().audit({ action: existing ? "USER_UPDATE" : "USER_CREATE", entityType: "user", entityId: u.username });
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const { upsertStaffUser } = await import("./api/staff-admin-api");
            let password: string | undefined;
            if (u.passwordHash) {
              try {
                password = atob(u.passwordHash);
              } catch {
                password = undefined;
              }
            }
            await upsertStaffUser({
              username: u.username,
              roleCode: u.role,
              officeCode: u.office,
              active: u.active,
              password,
              roleGroupCode: u.roleGroup,
            });
          } catch (e) {
            console.warn("upsertStaffUser failed", e);
          }
        })();
        return { ok: true };
      },

      removeUser: async (username) => {
        const login = username.trim().toLowerCase();
        const self = get().session?.username?.toLowerCase() === login;
        if (self) return { ok: false, error: "Không thể xóa chính tài khoản đang đăng nhập" };
        const prev = get().users;
        set((st) => ({ users: st.users.filter((u) => u.username.toLowerCase() !== login) }));
        try {
          const { isApiEnabled } = await import("./api/client");
          if (isApiEnabled() && get().online) {
            const { deleteStaffUser } = await import("./api/staff-admin-api");
            await deleteStaffUser(login);
          }
          get().audit({ action: "USER_DELETE", entityType: "user", entityId: login });
          return { ok: true };
        } catch (e: any) {
          set({ users: prev });
          return { ok: false, error: e?.message || "Không xóa được tài khoản" };
        }
      },

      closeDay: (office, date, by) => {
        set((st) => ({
          dayClosures: [
            ...st.dayClosures.filter((c) => !(c.office === office && c.date === date)),
            { office, date, confirmedBy: by, confirmedAt: nowIso() },
          ],
        }));
        get().audit({ action: "DAY_CLOSE", entityType: "day", entityId: `${office}-${date}`, by });
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            const dto = await fin.closeDayApi(office, date);
            set((st) => ({
              dayClosures: [
                ...st.dayClosures.filter((c) => !(c.office === office && c.date === date)),
                dto,
              ],
            }));
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "day",
              entityId: `${office}-${date}`,
              detail: e?.message ?? "closeDay",
            });
          }
        })();
      },
      reopenDay: (office, date, by) => {
        set((st) => ({
          dayClosures: st.dayClosures.map((c) =>
            c.office === office && c.date === date
              ? { ...c, reopenedBy: by, reopenedAt: nowIso() }
              : c,
          ),
        }));
        get().audit({ action: "DAY_REOPEN", entityType: "day", entityId: `${office}-${date}`, by });
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            const dto = await fin.reopenDayApi(office, date);
            set((st) => ({
              dayClosures: [
                ...st.dayClosures.filter((c) => !(c.office === office && c.date === date)),
                dto,
              ],
            }));
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "day",
              entityId: `${office}-${date}`,
              detail: e?.message ?? "reopenDay",
            });
          }
        })();
      },

      enqueueOffline: (a) =>
        set((st) => ({
          offlineQueue: [...st.offlineQueue, { id: rid(), at: nowIso(), ...a }],
        })),
      flushOffline: () => {
        const q = get().offlineQueue;
        if (!q.length) return 0;
        let replayed = 0;
        for (const item of q) {
          const st = get();
          try {
            if (item.kind === "SCAN_OUT") {
              const { trip, code, mode } = item.payload;
              const tr = st.trips.find((t) => t.code === trip);
              const order = st.orders.find((o) => o.code === code);
              if (!tr || !order) continue;
              if (mode === "remove") {
                if (!(tr.scannedCodes ?? []).includes(code)) continue;
                get().updateTrip(trip, {
                  scannedCodes: (tr.scannedCodes ?? []).filter((c) => c !== code),
                });
                get().updateOrder(code, { tripCode: undefined });
                get().transitionOrder(code, "WAITING", "SCAN_REMOVE_REPLAY", `Trip ${trip}`);
              } else {
                if ((tr.scannedCodes ?? []).includes(code)) continue; // idempotent
                if (order.tripCode && order.tripCode !== trip) continue;
                if (!["CONFIRMED", "WAITING"].includes(order.status)) continue;
                get().updateTrip(trip, {
                  scannedCodes: [...(tr.scannedCodes ?? []), code],
                  loadedCodes: [...(tr.loadedCodes ?? []), code],
                });
                get().updateOrder(code, { tripCode: trip });
                get().transitionOrder(code, "IN_TRANSIT", "SCAN_OUT_REPLAY", `Trip ${trip}`);
              }
              replayed++;
            } else if (item.kind === "SCAN_IN") {
              const { code, office } = item.payload;
              const order = st.orders.find((o) => o.code === code);
              if (!order) continue;
              if (["AT_DEST", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNING", "RETURNED"].includes(order.status)) continue;
              const isHub = order.hubOffice && order.hubOffice === office && order.toOffice !== office;
              if (isHub) {
                get().audit({ action: "HUB_IN_REPLAY", entityType: "order", entityId: code, detail: `Hub ${office}` });
              } else {
                get().transitionOrder(code, "AT_DEST", "SCAN_IN_REPLAY", `VP ${office}`);
              }
              replayed++;
            } else if (item.kind === "POD_HOME" || item.kind === "POD_COUNTER") {
              const { code, actualName, actualPhone, photos, amount, method } = item.payload;
              const order = st.orders.find((o) => o.code === code);
              if (!order) continue;
              if (order.status === "DELIVERED") continue; // E-POD-057 idempotent
              (photos ?? []).slice(0, 3).forEach((p: string) => get().addPodPhoto(code, p));
              get().updateOrder(code, { receiverActualName: actualName, receiverActualPhone: actualPhone });
              // guard against duplicate payment at same timestamp
              const already = (order.payments ?? []).some(
                (p) => p.kind === "SAU" && p.amount === amount && p.note === "OFFLINE_REPLAY",
              );
              if (amount > 0 && !already) {
                get().addPayment(code, {
                  at: nowIso(), by: st.session?.username ?? "system",
                  amount, method, kind: "SAU", note: "OFFLINE_REPLAY",
                });
              }
              get().transitionOrder(code, "DELIVERED", item.kind === "POD_COUNTER" ? "POD_QUAY_REPLAY" : "POD_REPLAY", actualName);
              replayed++;
            } else if (item.kind === "FAIL") {
              const { code, reason } = item.payload;
              const order = st.orders.find((o) => o.code === code);
              if (!order) continue;
              // failCount đã tăng ở UI khi offline; chỉ transition
              if (order.status === "OUT_FOR_DELIVERY") {
                if ((order.failCount ?? 0) >= 3) {
                  const r = get().transitionOrder(code, "FAILED_DELIVERY", "FAIL_REPLAY", reason);
                  if (r.ok) get().transitionOrder(code, "AT_DEST", "FAIL_MAX_REPLAY", "3 lần/48h");
                } else {
                  get().transitionOrder(code, "FAILED_DELIVERY", "FAIL_REPLAY", reason);
                }
                replayed++;
              }
            }
          } catch {
            // skip; loại bỏ khỏi queue để không lặp mãi
          }
        }
        set({ offlineQueue: [] });
        get().audit({ action: "OFFLINE_FLUSH", entityType: "queue", entityId: "-", detail: `${replayed}/${q.length} replayed` });
        return replayed;
      },

      setSurcharges: (cfg) => {
        set(() => ({ surcharges: { ...cfg, updatedAt: nowIso() } }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            const saved = await fin.putSurchargePolicy(cfg);
            set({ surcharges: saved });
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "surcharge",
              entityId: "policy",
              detail: e?.message ?? "putSurcharge",
            });
          }
        })();
      },
      setDoorFees: (rows) => {
        const prev = get().doorFees;
        set(() => ({ doorFees: rows }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            const removed = prev.filter((p) => !rows.some((r) => r.id === p.id));
            for (const r of removed) await fin.deleteDoorFeeRule(r.id);
            for (const r of rows) await fin.saveDoorFeeRule(r);
            const saved = await fin.fetchDoorFeeRules();
            if (saved.length) set({ doorFees: saved });
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "door-fee", entityId: "set", detail: e?.message });
          }
        })();
      },
      upsertProductPrice: (r) => {
        set((st) => ({
          productPricing: st.productPricing.some((x) => x.id === r.id)
            ? st.productPricing.map((x) => (x.id === r.id ? r : x))
            : [...st.productPricing, r],
        }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            await fin.saveProductPriceRule(r);
            const saved = await fin.fetchProductPriceRules();
            set({ productPricing: saved });
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "product-price", entityId: r.id, detail: e?.message });
          }
        })();
      },
      removeProductPrice: (id) => {
        set((st) => ({ productPricing: st.productPricing.filter((x) => x.id !== id) }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            await fin.deleteProductPriceRule(id);
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "product-price", entityId: id, detail: e?.message });
          }
        })();
      },

      setIntegrations: (i) => {
        set((st) => ({ integrations: { ...st.integrations, ...i, updatedAt: nowIso() } }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            const merged = { ...get().integrations, ...i };
            const saved = await fin.putIntegrationConfig(merged);
            set({ integrations: saved });
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "integration",
              entityId: "config",
              detail: e?.message ?? "putIntegration",
            });
          }
        })();
      },
      upsertCustomer: (phone, name) => {
        if (!phone) return;
        set((st) => {
          const prev = st.customerProfiles[phone];
          return {
            customerProfiles: {
              ...st.customerProfiles,
              [phone]: {
                phone,
                name: name || prev?.name || "",
                lastAt: nowIso(),
                count: (prev?.count ?? 0) + 1,
              },
            },
          };
        });
      },

      expireDrafts: () => {
        const cutoff = Date.now() - 24 * 3600 * 1000;
        let n = 0;
        set((st) => ({
          orders: st.orders.map((o) => {
            if (o.status === "DRAFT" && new Date(o.createdAt).getTime() < cutoff) {
              n++;
              return {
                ...o,
                status: "CANCELLED" as OrderStatus,
                cancelReason: "Hết hạn 24h (hệ thống)",
                updatedAt: nowIso(),
                events: [
                  ...(o.events ?? []),
                  { at: nowIso(), by: "system", action: "AUTO_CANCEL", detail: "DRAFT >24h" },
                ],
              };
            }
            return o;
          }),
        }));
        if (n) get().audit({ action: "AUTO_CANCEL_DRAFTS", entityType: "system", entityId: "-", detail: `${n} đơn` });
        return n;
      },

      addOffice: (code, name) => {
        set((st) => ({ offices: [...st.offices, { code, name }] }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const { apiRequest } = await import("./api/client");
            await apiRequest("/api/offices", {
              method: "POST",
              body: { code, name, officeType: "BRANCH", isHub: false, active: true },
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "office", entityId: code, detail: e?.message });
          }
        })();
      },
      updateOffice: (code, patch) => {
        const nextCode = (patch.code ?? code).trim().toUpperCase();
        const nextName = patch.name.trim();
        set((st) => ({
          offices: st.offices.map((o) =>
            o.code === code ? { ...o, code: nextCode, name: nextName } : o,
          ),
        }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/offices?size=200");
            const row = (Array.isArray(list) ? list : []).find((o: any) => o.code === code);
            if (row?.id == null) throw new Error("Không tìm thấy VP trên máy chủ");
            await apiRequest(`/api/offices/${row.id}`, {
              method: "PUT",
              body: {
                id: row.id,
                code: nextCode,
                name: nextName,
                officeType: row.officeType ?? "BRANCH",
                isHub: row.isHub ?? false,
                active: row.active !== false,
              },
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "office", entityId: code, detail: e?.message });
            const { toast } = await import("sonner");
            toast.error(e?.message || "Không cập nhật được VP");
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi().catch(() => undefined);
          }
        })();
      },
      removeOffice: (code) => {
        set((st) => ({ offices: st.offices.filter((o) => o.code !== code) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/offices");
            const row = (Array.isArray(list) ? list : []).find((o: any) => o.code === code);
            if (row?.id != null) await apiRequest(`/api/offices/${row.id}`, { method: "DELETE" });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "office", entityId: code, detail: e?.message });
          }
        })();
      },
      addRoute: (r) => {
        set((st) => ({ routes: [...st.routes, r] }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const code = r.includes("-") ? r.replace(/\s+/g, "") : `R-${Date.now().toString().slice(-6)}`;
            const offices = await apiRequest<any[]>("/api/offices");
            const arr = Array.isArray(offices) ? offices : [];
            const from = arr[0];
            const to = arr.find((o) => o.code !== from?.code) || from;
            await apiRequest("/api/routes", {
              method: "POST",
              body: {
                code: code.slice(0, 30),
                name: r,
                active: true,
                fromOffice: from ? { id: from.id } : undefined,
                toOffice: to ? { id: to.id } : undefined,
              },
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "route", entityId: r, detail: e?.message });
          }
        })();
      },
      updateRoute: (oldName, newName) => {
        const next = newName.trim();
        if (!next || next === oldName) return;
        set((st) => ({ routes: st.routes.map((x) => (x === oldName ? next : x)) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/routes?size=200");
            const row = (Array.isArray(list) ? list : []).find((x: any) => x.name === oldName || x.code === oldName);
            if (row?.id == null) throw new Error("Không tìm thấy tuyến trên máy chủ");
            await apiRequest(`/api/routes/${row.id}`, {
              method: "PUT",
              body: {
                id: row.id,
                code: row.code,
                name: next,
                active: row.active !== false,
                fromOffice: row.fromOffice ?? null,
                toOffice: row.toOffice ?? null,
              },
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "route", entityId: oldName, detail: e?.message });
            const { toast } = await import("sonner");
            toast.error(e?.message || "Không cập nhật được tuyến");
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi().catch(() => undefined);
          }
        })();
      },
      removeRoute: (r) => {
        const prev = get().routes;
        set((st) => ({ routes: st.routes.filter((x) => x !== r) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/routes?size=200");
            const arr = Array.isArray(list) ? list : [];
            const row = arr.find((x: any) => x.name === r || x.code === r);
            if (row?.id == null) return;
            // Trip bắt buộc gắn Route → xóa cứng thường fail FK; ưu tiên ẩn (active=false).
            try {
              await apiRequest(`/api/routes/${row.id}`, { method: "DELETE" });
            } catch {
              await apiRequest(`/api/routes/${row.id}`, {
                method: "PUT",
                body: {
                  id: row.id,
                  code: row.code,
                  name: row.name,
                  active: false,
                  fromOffice: row.fromOffice ?? null,
                  toOffice: row.toOffice ?? null,
                },
              });
            }
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            set({ routes: prev });
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "route",
              entityId: r,
              detail: e?.message,
            });
            const { toast } = await import("sonner");
            toast.error(
              e?.message ||
                `Không xóa được tuyến "${r}" — có thể đang được dùng bởi chuyến hàng. Đã khôi phục danh sách.`,
            );
          }
        })();
      },
      addVehicle: (v) => {
        set((st) => ({ vehicles: [...st.vehicles, v] }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            await apiRequest("/api/vehicles", { method: "POST", body: vehicleToApiBody(v) });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "vehicle", entityId: v.bks, detail: e?.message });
          }
        })();
      },
      updateVehicle: (bks, patch) => {
        const prev = get().vehicles.find((x) => x.bks === bks);
        set((st) => ({
          vehicles: st.vehicles.map((x) => (x.bks === bks ? { ...x, ...patch } : x)),
        }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            let id = prev?.id;
            if (id == null) {
              const { fetchVehicles, asArray } = await import("./api/domain-api");
              id = asArray(await fetchVehicles()).find((row: any) => row.plateNumber === bks)?.id;
            }
            if (id == null) throw new Error("Không tìm thấy xe trên máy chủ");
            await apiRequest(`/api/vehicles/${id}`, {
              method: "PUT",
              body: vehicleToApiBody({ ...prev, ...patch, bks: patch.bks }, id),
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "vehicle", entityId: bks, detail: e?.message });
          }
        })();
      },
      removeVehicle: (bks) => {
        set((st) => ({ vehicles: st.vehicles.filter((v) => v.bks !== bks) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/vehicles");
            const row = (Array.isArray(list) ? list : []).find((v: any) => v.plateNumber === bks);
            if (row?.id != null) await apiRequest(`/api/vehicles/${row.id}`, { method: "DELETE" });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "vehicle", entityId: bks, detail: e?.message });
          }
        })();
      },
      addDriver: (n) => {
        set((st) => ({ drivers: [...st.drivers, n] }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const code = `DRV${Date.now().toString().slice(-6)}`;
            await apiRequest("/api/drivers", {
              method: "POST",
              body: { driverCode: code, fullName: n, active: true },
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "driver", entityId: n, detail: e?.message });
          }
        })();
      },
      updateDriver: (oldName, newName) => {
        const next = newName.trim();
        if (!next || next === oldName) return;
        set((st) => ({ drivers: st.drivers.map((x) => (x === oldName ? next : x)) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/drivers?size=200");
            const row = (Array.isArray(list) ? list : []).find((d: any) => d.fullName === oldName);
            if (row?.id == null) throw new Error("Không tìm thấy tài xế trên máy chủ");
            await apiRequest(`/api/drivers/${row.id}`, {
              method: "PUT",
              body: {
                id: row.id,
                driverCode: row.driverCode,
                fullName: next,
                phone: row.phone ?? null,
                active: row.active !== false,
              },
            });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "driver", entityId: oldName, detail: e?.message });
            const { toast } = await import("sonner");
            toast.error(e?.message || "Không cập nhật được tài xế");
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi().catch(() => undefined);
          }
        })();
      },
      removeDriver: (n) => {
        set((st) => ({ drivers: st.drivers.filter((x) => x !== n) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/drivers");
            const row = (Array.isArray(list) ? list : []).find((d: any) => d.fullName === n);
            if (row?.id != null) await apiRequest(`/api/drivers/${row.id}`, { method: "DELETE" });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "driver", entityId: n, detail: e?.message });
          }
        })();
      },
    }),
    {
      name: "xe-vthh-v1",
      partialize: (st) => ({
        session: st.session,
        viewOffice: st.viewOffice,
      }),
      version: 8,
      migrate: (persisted: unknown) => {
        const p = persisted as { session?: { office?: string } | null; viewOffice?: string } | undefined;
        if (!p?.session?.office?.trim()) return { session: null, viewOffice: "" };
        return { session: p.session, viewOffice: p.viewOffice ?? "" };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
        state?.expireDrafts();
      },
    },
  ),
);

// ---------- Selectors ----------
export const useSession = () => useStore((s) => s.session);
export const useHydrated = () => useStore((s) => s.hydrated);
