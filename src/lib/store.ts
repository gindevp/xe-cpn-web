// Global store X.E — persist key `xe-vthh-v1`.
// Mọi thao tác ghi phải đi qua store; state machine chặn transition sai.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  MOCK_ORDERS,
  MOCK_TRIPS,
  MOCK_PRICING,
  MOCK_USERS,
  OFFICES,
  ROUTES_MASTER,
  VEHICLES,
  DRIVERS,
  type Order,
  type OrderStatus,
  type Trip,
  type TripStatus,
  type Role,
} from "./mock-data";

// ---------- Types ----------
export type Session = { username: string; role: Role; office: string };

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
  passwordHash?: string; // mock: base64
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

export type SurchargeConfig = {
  homeDelivery: { enabled: boolean; amount: number };
  cod: { enabled: boolean; percent: number; minFee: number };
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

export const DEFAULT_SURCHARGES: SurchargeConfig = {
  homeDelivery: { enabled: true, amount: 20000 },
  cod: { enabled: false, percent: 1, minFee: 10000 },
  storage: { enabled: true, freeDays: 3, feePerDay: 10000 },
  insurance: { enabled: true, threshold: 10000000, percentUnder: 1.5, percentOver: 1 },
  refund: { enabled: false, percent: 50 },
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

function seedDoorFees(): DoorFeeRule[] {
  const bands: Array<[number, number]> = [
    [0, 5],
    [5, 20],
    [20, 50],
    [50, 9999],
  ];
  const dist: Array<[number, number]> = [
    [0, 3],
    [3, 7],
    [7, 15],
    [15, 9999],
  ];
  const base = [20000, 30000, 45000, 70000];
  const out: DoorFeeRule[] = [];
  (["PICKUP", "DELIVERY"] as const).forEach((kind) => {
    bands.forEach(([minKg, maxKg], i) => {
      dist.forEach(([minKm, maxKm], j) => {
        out.push({
          id: `${kind}-${i}-${j}`,
          kind,
          minKg,
          maxKg,
          minKm,
          maxKm,
          fee: base[i] + j * 10000,
        });
      });
    });
  });
  return out;
}

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

function seedOrders(): OrderX[] {
  return MOCK_ORDERS.map((o) => ({
    ...o,
    events: [{ at: o.createdAt, by: "system", action: "CREATED" }],
    payments: o.paidAmount
      ? [{ at: o.createdAt, by: "system", amount: o.paidAmount, method: "TM", kind: "TRUOC" }]
      : [],
    podPhotos: [],
    failCount: 0,
    failHistory: [],
  }));
}

function seedTrips(): TripX[] {
  return MOCK_TRIPS.map((t) => ({ ...t, scannedCodes: [], loadedCodes: [], events: [] }));
}

function seedPricing(): PricingRule[] {
  return MOCK_PRICING.map((p, i) => {
    const [min, max] = p.tier.replace("kg", "").split("-").map(Number);
    return {
      id: `PR-${i + 1}`,
      route: p.route,
      tier: p.tier,
      minKg: min,
      maxKg: max,
      unit: p.unit,
      surcharge: p.surcharge,
      dimDivisor: 6000,
      effectiveFrom: new Date(Date.now() - 30 * 864e5).toISOString(),
      kmMin: 2,
      kmRate: 5000,
    };
  });
}

function seedUsers(): UserRec[] {
  return MOCK_USERS.map((u) => ({ ...u, passwordHash: btoa("123") }));
}

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

// ---------- Store ----------
type State = {
  session: Session | null;
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
  offices: typeof OFFICES;
  routes: string[];
  vehicles: typeof VEHICLES;
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
  // audit
  audit: (a: Omit<AuditLog, "at" | "by"> & { by?: string }) => void;
  addReceipt: (r: Omit<ReceiptRec, "code" | "createdAt" | "createdBy"> & { code?: string }) => ReceiptRec;
  // order
  addOrder: (o: OrderX) => void;
  updateOrder: (code: string, patch: Partial<OrderX>) => void;
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
  upsertPricing: (rule: PricingRule) => void;
  removePricing: (id: string) => void;
  // users
  upsertUser: (u: UserRec) => { ok: true } | { ok: false; error: string };
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
  removeOffice: (code: string) => void;
  addRoute: (r: string) => void;
  removeRoute: (r: string) => void;
  addVehicle: (bks: string, capacity: number) => void;
  removeVehicle: (bks: string) => void;
  addDriver: (n: string) => void;
  removeDriver: (n: string) => void;
};

export type Store = State & Actions;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      session: null,
      hydrated: false,
      orders: seedOrders(),
      trips: seedTrips(),
      pricingRules: seedPricing(),
      pricingLogs: [],
      users: seedUsers(),
      auditLogs: [],
      receipts: [],
      dayClosures: [],
      offlineQueue: [],
      customerProfiles: {},
      integrations: {},
      surcharges: DEFAULT_SURCHARGES,
      doorFees: seedDoorFees(),
      productPricing: [],
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      offices: OFFICES,
      routes: [...ROUTES_MASTER],
      vehicles: [...VEHICLES],
      drivers: [...DRIVERS],

      setHydrated: (v) => set({ hydrated: v }),
      setOnline: (v) => set({ online: v }),

      login: async (username, password) => {
        const { isApiEnabled } = await import("./api/client");
        if (isApiEnabled()) {
          const { loginWithApi } = await import("./api/auth-api");
          const { syncAllFromApi } = await import("./api/sync");
          const r = await loginWithApi(username, password);
          if (!r.ok) return r;
          set({ session: { username: r.username, role: r.role, office: r.office } });
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
        const u = get().users.find(
          (x) => x.username === username.trim().toLowerCase() && x.active,
        );
        if (!u) return { ok: false, error: "Sai thông tin đăng nhập" };
        if (u.passwordHash !== btoa(password))
          return { ok: false, error: "Sai thông tin đăng nhập" };
        set({ session: { username: u.username, role: u.role, office: u.office } });
        get().audit({ action: "LOGIN", entityType: "user", entityId: u.username });
        return { ok: true, role: u.role };
      },
      logout: () => {
        const s = get().session;
        if (s) get().audit({ action: "LOGOUT", entityType: "user", entityId: s.username });
        void import("./api/sync").then((m) => m.clearApiSession());
        set({ session: null });
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
        const seq = st.receipts.length + 1;
        const rec: ReceiptRec = {
          code: r.code ?? `PT${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(seq).padStart(4, "0")}`,
          createdBy: st.session?.username ?? "system",
          createdAt: nowIso(),
          payer: r.payer,
          payerCode: r.payerCode,
          total: r.total,
          orderCodes: r.orderCodes,
          office: r.office ?? st.session?.office,
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
                const o = get().orders.find((x) => x.code === orderCode);
                const due = Math.max(0, (o?.fare ?? 0) + (o?.deliveryFee ?? 0) - (o?.paidAmount ?? 0));
                return { orderCode, amountCollected: due || 1 };
              }),
            });
            set((s) => ({
              receipts: s.receipts.map((x) => (x.code === rec.code ? created : x)),
            }));
            const { syncOrdersFromApi } = await import("./api/sync");
            await syncOrdersFromApi();
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

      addOrder: (o) => {
        const withEvents: OrderX = {
          ...o,
          events: o.events ?? [{ at: nowIso(), by: get().session?.username ?? "system", action: "CREATED" }],
        };
        set((st) => ({ orders: [withEvents, ...st.orders] }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const domain = await import("./api/domain-api");
            const { resolveOfficeCode } = await import("./api/sync");
            const goods =
              ["THUONG", "DE_VO", "DIEN_TU", "THUC_PHAM_KHO", "GIAY_TO", "CONG_KENH"].includes(o.goodsType)
                ? o.goodsType
                : "THUONG";
            const paymentTerm =
              ["GUI_TRA", "NHAN_TRA", "P30_70", "P50_50", "P70_30", "COD"].includes(o.collectForm)
                ? o.collectForm
                : "GUI_TRA";
            const fromOfficeCode = resolveOfficeCode(o.fromOffice);
            const toOfficeCode = resolveOfficeCode(o.toOffice);
            const hubOfficeCode = o.hubOffice ? resolveOfficeCode(o.hubOffice) : undefined;
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
                toOfficeCode: o.homeDelivery ? undefined : toOfficeCode,
                hubOfficeCode,
                fromOfficeCode,
                note: o.note,
              });
              const mapped = await domain.getOrder(res.orderCode || res.draftCode);
              set((st) => ({
                orders: st.orders.map((x) =>
                  x.code === o.code
                    ? {
                        ...mapped,
                        events: withEvents.events,
                        // OrderSummaryDTO may omit addresses — keep what we just posted
                        address: o.address ?? mapped.address,
                        pickupAddress: o.pickupAddress ?? mapped.pickupAddress,
                      }
                    : x,
                ),
              }));
            } else {
              const created = await domain.createOrder({
                senderPhone: o.senderPhone,
                senderName: o.senderName,
                receiverName: o.receiverName,
                receiverPhone: o.receiverPhone,
                goodsType: goods,
                paymentTerm,
                fromOfficeCode,
                toOfficeCode,
                hubOfficeCode,
                finalToOfficeCode: o.finalToOffice ? resolveOfficeCode(o.finalToOffice) : undefined,
                weightKg: o.weightKg,
                quantity: o.quantity ?? 1,
                homeDelivery: o.homeDelivery,
                homePickup: o.homePickup,
                qrDropOff: o.qrDropOff,
                deliveryAddress: o.address,
                pickupAddress: o.pickupAddress,
                note: o.note,
                fareAmount: o.fare,
              });
              set((st) => ({
                orders: st.orders.map((x) =>
                  x.code === o.code
                    ? {
                        ...created,
                        events: withEvents.events,
                        address: o.address ?? created.address,
                        pickupAddress: o.pickupAddress ?? created.pickupAddress,
                      }
                    : x,
                ),
              }));
            }
          } catch (e: any) {
            get().audit({
              action: "API_SYNC_FAIL",
              entityType: "order",
              entityId: o.code,
              detail: e?.message ?? "createOrder",
            });
          }
        })();
      },

      updateOrder: (code, patch) => {
        const prev = get().orders.find((x) => x.code === code || x.draftCode === code);
        set((st) => ({
          orders: st.orders.map((o) =>
            o.code === code || o.draftCode === code
              ? { ...o, ...patch, updatedAt: nowIso() }
              : o,
          ),
        }));
        void import("./api/push").then((m) => m.pushOrderPatch(prev?.code ?? code, patch, prev));
      },
      transitionOrder: (code, to, action, detail) => {
        const st = get();
        const o = st.orders.find((x) => x.code === code || x.draftCode === code);
        if (!o) return { ok: false, error: "Không tìm thấy đơn (E-STATE-404)" };
        if (o.status === to) return { ok: true };
        if (!canTransitionOrder(o.status, to))
          return { ok: false, error: `Không thể chuyển ${o.status}→${to} (E-STATE-001)` };
        const by = st.session?.username ?? "system";
        set({
          orders: st.orders.map((x) =>
            x.code === o.code
              ? {
                  ...x,
                  status: to,
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

      removePricing: (id) => {
        set((st) => ({ pricingRules: st.pricingRules.filter((r) => r.id !== id) }));
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            await fin.deletePricingRule(id);
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "pricing", entityId: id, detail: e?.message });
          }
        })();
      },

      upsertPricing: (rule) => {
        const st = get();
        const existing = st.pricingRules.find((r) => r.id === rule.id);
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
        void (async () => {
          try {
            const { isApiEnabled } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const fin = await import("./api/finance-config-api");
            await fin.savePricingRule(rule);
            const rules = await fin.fetchPricingRules();
            if (rules.length) set({ pricingRules: rules });
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "pricing", entityId: rule.id, detail: e?.message });
          }
        })();
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
            });
          } catch (e) {
            console.warn("upsertStaffUser failed", e);
          }
        })();
        return { ok: true };
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
            const { resolveOfficeCode } = await import("./api/sync");
            // FE route string → code; bind from/to GP as safe default when unknown
            const code = r.includes("-") ? r.replace(/\s+/g, "") : `R-${Date.now().toString().slice(-6)}`;
            const gp = { id: null as number | null };
            const offices = await apiRequest<any[]>("/api/offices");
            const arr = Array.isArray(offices) ? offices : [];
            const from = arr.find((o) => o.code === "GP") || arr[0];
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
            void gp;
            void resolveOfficeCode;
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "route", entityId: r, detail: e?.message });
          }
        })();
      },
      removeRoute: (r) => {
        set((st) => ({ routes: st.routes.filter((x) => x !== r) }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            const list = await apiRequest<any[]>("/api/routes?size=200");
            const arr = Array.isArray(list) ? list : [];
            const row = arr.find((x: any) => x.name === r || x.code === r);
            if (row?.id != null) await apiRequest(`/api/routes/${row.id}`, { method: "DELETE" });
            const { syncMasterFromApi } = await import("./api/sync");
            await syncMasterFromApi();
          } catch (e: any) {
            get().audit({ action: "API_SYNC_FAIL", entityType: "route", entityId: r, detail: e?.message });
          }
        })();
      },
      addVehicle: (bks, capacity) => {
        set((st) => ({ vehicles: [...st.vehicles, { bks, capacity }] }));
        void (async () => {
          try {
            const { isApiEnabled, apiRequest } = await import("./api/client");
            if (!isApiEnabled() || !get().online) return;
            await apiRequest("/api/vehicles", {
              method: "POST",
              body: { plateNumber: bks, capacityKg: capacity, active: true },
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
        orders: st.orders,
        trips: st.trips,
        pricingRules: st.pricingRules,
        pricingLogs: st.pricingLogs,
        users: st.users,
        auditLogs: st.auditLogs,
        dayClosures: st.dayClosures,
        offlineQueue: st.offlineQueue,
        customerProfiles: st.customerProfiles,
        integrations: st.integrations,
        surcharges: st.surcharges,
        doorFees: st.doorFees,
        productPricing: st.productPricing,
        offices: st.offices,
        routes: st.routes,
        vehicles: st.vehicles,
        drivers: st.drivers,
      }),
      version: 5,
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted) return persisted;
        persisted.surcharges = { ...DEFAULT_SURCHARGES, ...(persisted.surcharges ?? {}) };
        delete persisted.surcharges.redeliver;
        // Phí khai báo giá trị: chuyển sang cấu hình 2 bậc
        const ins: any = persisted.surcharges.insurance ?? {};
        persisted.surcharges.insurance = {
          enabled: ins.enabled ?? DEFAULT_SURCHARGES.insurance.enabled,
          threshold: ins.threshold ?? DEFAULT_SURCHARGES.insurance.threshold,
          percentUnder: ins.percentUnder ?? DEFAULT_SURCHARGES.insurance.percentUnder,
          percentOver: ins.percentOver ?? DEFAULT_SURCHARGES.insurance.percentOver,
        };

        if (!persisted.doorFees?.length) persisted.doorFees = seedDoorFees();
        // v5: bỏ seed hardcode — Giá theo sản phẩm chỉ lấy từ API/DB
        if (fromVersion < 5) persisted.productPricing = [];
        const existing: string[] = (persisted.trips ?? []).map((t: any) => t.code);
        const missing = MOCK_TRIPS.filter((t) => !existing.includes(t.code)).map((t) => ({
          ...t,
          scannedCodes: [],
          loadedCodes: [],
          events: [],
        }));
        return { ...persisted, trips: [...(persisted.trips ?? []), ...missing] };
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
