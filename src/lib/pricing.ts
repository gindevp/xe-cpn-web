// Helpers cước BR-025 & mã đơn.
import { OTHER_GOODS, isOtherGoodsGroup } from "./mock-data";
import { useStore, type PricingRule } from "./store";
import type { CodFeeTier } from "./store";

export function calcDimWeight(d: number, r: number, c: number, divisor = 6000) {
  if (!d || !r || !c) return 0;
  return (d * r * c) / divisor;
}

export function calcChargeWeight(realKg: number, dimKg: number) {
  const raw = Math.max(realKg || 0, dimKg || 0);
  return Math.ceil(raw * 10) / 10;
}

export function needsKT(d: number, r: number, c: number, goodsType?: string) {
  if (goodsType === "CONG_KENH") return true;
  return Math.max(d || 0, r || 0, c || 0) >= 50;
}

export type FareBreakdown = {
  base: number;
  surcharge: number;
  pickupFee: number;
  deliveryFee: number;
  total: number;
  chargeKg: number;
  ruleId?: string;
};

/** (min, max] — min=0 → [0, max]. min 3 KG means weight > 3 KG. */
export function inWeightBand(chargeKg: number, minKg: number, maxKg: number) {
  const lo = minKg ?? 0;
  const hi = maxKg ?? 0;
  if (lo <= 0) return chargeKg >= 0 && chargeKg <= hi + 1e-9;
  return chargeKg > lo && chargeKg <= hi + 1e-9;
}

/**
 * Chọn mức cân cho cân tính cước: ưu tiên khớp đúng khoảng (min, max].
 * Bảng giá nhập kiểu "mức sau = max mức trước + 1 KG" để hở một quãng (vd 3,1–4,0 KG khi có
 * (0,3] và (4,6]) — quãng đó phải rơi vào mức kế tiếp, không được trả về "không có mức" vì
 * như vậy cước = 0 (FE) hoặc nhảy sang giá fallback (BE).
 */
export function findWeightBand(rules: PricingRule[], chargeKg: number): PricingRule | undefined {
  const sorted = rules.slice().sort((a, b) => a.minKg - b.minKg);
  const exact = sorted.find((r) => inWeightBand(chargeKg, r.minKg, r.maxKg));
  if (exact) return exact;
  return sorted.find((r) => chargeKg <= (r.maxKg ?? 0) + 1e-9);
}

export function hasOverageConfig(r?: PricingRule | null) {
  if (!r) return false;
  return (r.addFee ?? 0) > 0 || (r.stepG ?? 0) > 0;
}

function bandFare(rule: PricingRule, chargeKg: number, overage: boolean) {
  const unit = rule.unit ?? 0;
  if (!overage) return Math.round(unit);
  const extraKg = Math.max(0, chargeKg - (rule.maxKg ?? 0));
  const addFee = rule.addFee ?? 0;
  const stepG = rule.stepG ?? 0;
  let extraMoney = 0;
  if (stepG > 0 && addFee > 0) {
    const extraG = extraKg * 1000;
    extraMoney = Math.ceil(extraG / stepG) * addFee;
  } else {
    extraMoney = extraKg * addFee;
  }
  return Math.round(unit + extraMoney);
}

export function calcFare(params: {
  route: string;
  realKg: number;
  d?: number;
  r?: number;
  c?: number;
  goodsType?: string;
  homePickup?: boolean;
  homeDelivery?: boolean;
  pickupKm?: number;
  deliveryKm?: number;
}): FareBreakdown {
  const rules = useStore
    .getState()
    .pricingRules.filter((x) => x.route === params.route)
    .slice()
    .sort((a, b) => a.minKg - b.minKg);
  const dim = calcDimWeight(params.d ?? 0, params.r ?? 0, params.c ?? 0, rules[0]?.dimDivisor ?? 6000);
  const chargeKg = calcChargeWeight(params.realKg, dim);
  const hit = findWeightBand(rules, chargeKg);
  const last = rules[rules.length - 1];
  const overage = !hit && !!last && chargeKg > last.maxKg;
  const rule = hit ?? (overage ? last : undefined);
  const base = rule ? bandFare(rule, chargeKg, overage) : 0;
  const surcharge = rule?.surcharge ?? 0;
  const kmRate = rule?.kmRate ?? 5000;
  const kmMin = rule?.kmMin ?? 2;
  const pickupFee = params.homePickup ? Math.max(params.pickupKm ?? kmMin, kmMin) * kmRate : 0;
  const deliveryFee = params.homeDelivery ? Math.max(params.deliveryKm ?? kmMin, kmMin) * kmRate : 0;
  return { base, surcharge, pickupFee, deliveryFee, total: base + surcharge + pickupFee + deliveryFee, chargeKg, ruleId: rule?.id };
}

let seq = 0;
/** Alphabet đồng bộ BE OrderCodeGenerator — A-Z + 0-9. */
const ORDER_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Bỏ tiền tố VP / VP_ khỏi mã VP cho mã vận đơn ngắn. */
function officeCodeForOrder(office: string): string {
  const raw = (office || "XX").replace(/\s+/g, "").toUpperCase() || "XX";
  const stripped = raw.replace(/^VP[_\s.-]*/i, "").trim();
  return stripped || "XX";
}

function randomOrderId(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += ORDER_ID_CHARS[Math.floor(Math.random() * ORDER_ID_CHARS.length)]!;
  }
  return s;
}

/**
 * Mã tạm phía client: {VP}{ddMM}{XXXX} (chữ hoa + số, không năm).
 * Mã thật do BE cấp cùng format; tạm bị thay khi BE trả về.
 */
export function genOrderCode(office: string) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const officeNorm = officeCodeForOrder(office);
  const prefix = `${officeNorm}${dd}${mm}`;
  const orders = useStore.getState().orders;
  const used = new Set(orders.map((o) => o.code).filter(Boolean));
  const usedTails = new Set(
    [...used].map((c) => c.slice(-4).toUpperCase()).filter((t) => t.length === 4),
  );
  for (let i = 0; i < 40; i++) {
    const tail = randomOrderId(4);
    const code = `${prefix}${tail}`;
    if (!used.has(code) && !usedTails.has(tail)) {
      seq++;
      return code;
    }
  }
  return `${prefix}${randomOrderId(3)}${ORDER_ID_CHARS[++seq % ORDER_ID_CHARS.length]!}`;
}

export function genDraftCode(office = "XX") {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `N-${office}-${n}`;
}

export function genTripCode(office: string) {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const trips = useStore.getState().trips;
  const prefix = `T${office}${stamp}`;
  const seq = trips.filter((t) => t.code?.startsWith(prefix)).length + 1;
  return `${prefix}-${String(seq).padStart(2, "0")}`;
}

export function isValidVNPhone(p: string) {
  return /^(0[35789]\d{8}|\+84[35789]\d{8})$/.test(p.trim());
}

export function suggestShelf(receiverPhone: string) {
  const last = receiverPhone?.trim().slice(-1);
  const n = parseInt(last, 10);
  return isNaN(n) ? 0 : n;
}

export function findPricingRule(route: string, chargeKg: number): PricingRule | undefined {
  const rules = useStore
    .getState()
    .pricingRules.filter((r) => r.route === route)
    .slice()
    .sort((a, b) => a.minKg - b.minKg);
  const hit = findWeightBand(rules, chargeKg);
  if (hit) return hit;
  const last = rules[rules.length - 1];
  if (last && chargeKg > last.maxKg) return last;
  return undefined;
}

/** Phí thu hộ COD theo bảng bậc (cố định / %). Fallback % × tiền, tối thiểu minFee. */
export function calcCodFee(
  collectedAmount: number,
  cod?: { enabled?: boolean; percent?: number; minFee?: number; tiers?: CodFeeTier[] } | null,
): number {
  if (!cod?.enabled) return 0;
  const amount = Math.max(0, Number(collectedAmount) || 0);
  if (amount <= 0) return 0;
  const tiers = cod.tiers?.length ? cod.tiers : [];
  if (tiers.length) {
    const hit = tiers.find((t) => {
      const min = Number(t.minAmount) || 0;
      const max = t.maxAmount == null ? null : Number(t.maxAmount);
      const overMin = min <= 0 ? amount >= 0 : amount > min;
      const underMax = max == null || !Number.isFinite(max) ? true : amount <= max;
      return overMin && underMax;
    });
    if (hit) {
      if (hit.feePercent != null && Number.isFinite(hit.feePercent)) {
        return Math.round((amount * Number(hit.feePercent)) / 100);
      }
      return Math.round(Number(hit.feeAmount) || 0);
    }
  }
  const pct = Math.round((amount * (cod.percent ?? 0)) / 100);
  return Math.max(Math.round(cod.minFee ?? 0), pct);
}

/**
 * Phí lấy/giao tận nơi theo bảng khoảng cân × khoảng cách (/phu-phi).
 * Không khớp bậc → fallback phụ phí giao tận nơi mặc định.
 */
export function calcDoorFee(kind: "PICKUP" | "DELIVERY", chargeKg: number, km: number) {
  const st = useStore.getState();
  const kg = Number(chargeKg) || 0;
  const useKm = Math.max(0, Number(km) || 0);
  const row = st.doorFees.find(
    (r) =>
      r.kind === kind &&
      kg > r.minKg - 0.001 &&
      kg <= r.maxKg + 0.001 &&
      useKm > r.minKm - 0.001 &&
      useKm <= r.maxKm + 0.001,
  );
  if (row?.fee != null && Number.isFinite(Number(row.fee))) {
    return Math.round(Number(row.fee));
  }
  return Math.round(Number(st.surcharges?.homeDelivery?.amount) || 0);
}

/** Tính phí tận nơi khi đã có KM (Ahamove); chưa có KM → 0 (chờ map). */
export function calcHomeDoorFees(params: {
  chargeKg: number;
  homePickup?: boolean;
  homeDelivery?: boolean;
  pickupKm?: number | null;
  deliveryKm?: number | null;
}) {
  const kg = Math.max(0.001, Number(params.chargeKg) || 0);
  const pickupFee =
    params.homePickup && params.pickupKm != null && params.pickupKm > 0
      ? calcDoorFee("PICKUP", kg, params.pickupKm)
      : 0;
  const deliveryFee =
    params.homeDelivery && params.deliveryKm != null && params.deliveryKm > 0
      ? calcDoorFee("DELIVERY", kg, params.deliveryKm)
      : 0;
  return { pickupFee, deliveryFee };
}

/**
 * Cước shipper tạm tính (chưa Ahamove): km × đơn giá (kmRate bảng giá).
 * Ưu tiên partnerFee đã lưu; không có thì dùng phí giao tại nhà đã tính; fallback kmMin × kmRate.
 */
export function estimateShipperFare(order: {
  partnerFee?: number;
  deliveryFee?: number;
  homeDelivery?: boolean;
  route?: string;
  weightKg?: number;
  deliveryKm?: number;
}): number | null {
  if (order.partnerFee != null && Number(order.partnerFee) > 0) {
    return Math.round(Number(order.partnerFee));
  }
  if (!order.homeDelivery) return null;
  if (order.deliveryFee != null && Number(order.deliveryFee) > 0) {
    return Math.round(Number(order.deliveryFee));
  }
  const rule = findPricingRule(order.route ?? "", Number(order.weightKg) || 0);
  const kmRate = rule?.kmRate ?? 5000;
  const kmMin = rule?.kmMin ?? 2;
  const km = Math.max(Number(order.deliveryKm) || 0, kmMin);
  return Math.round(km * kmRate);
}

/** Giá đặc thù theo sản phẩm — chưa áp khi tạo đơn (tab riêng). */
export function findProductPrice(name?: string) {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  return useStore.getState().productPricing.find((p) => p.name.toLowerCase() === key);
}

/**
 * Cước 1 kiện lúc tạo/sửa đơn.
 * Nhóm cấu hình: chỉ tính khi đã chọn tên SP (không lấy mức cân tối thiểu khi mới chọn nhóm).
 * Nhóm Khác: cước theo cân/kích thước, 0 nếu chưa nhập cân và kích thước.
 */
export function computeGoodsLineFare(opts: {
  group?: string;
  kind: string;
  name?: string;
  sl?: number;
  weight?: number;
  route?: string;
  d?: number;
  r?: number;
  c?: number;
}): number {
  const isOther = isOtherGoodsGroup(opts.group) || opts.kind.trim() === OTHER_GOODS;
  if (!isOther) {
    const nameKey = opts.kind.trim();
    if (!nameKey) return 0;
    const pp = findProductPrice(nameKey);
    const unit = pp ? (pp.price > 0 ? pp.price : pp.currentPrice) : 0;
    if (unit <= 0) return 0;
    return Math.round(unit * Math.max(1, Number(opts.sl) || 1));
  }
  const kg = Number(opts.weight) || 0;
  const dimKg = calcDimWeight(opts.d ?? 0, opts.r ?? 0, opts.c ?? 0);
  if (kg <= 0 && dimKg <= 0) return 0;
  const fare = calcFare({
    route: opts.route ?? "",
    realKg: kg,
    d: opts.d,
    r: opts.r,
    c: opts.c,
  });
  return Math.round((fare.base || 0) + (fare.surcharge || 0));
}

/** Phí tồn kho tại kho giao */
export function calcStorageFee(daysAtDestWarehouse: number) {
  const c = useStore.getState().surcharges.storage;
  if (!c?.enabled) return 0;
  return Math.max(0, Math.ceil(daysAtDestWarehouse) - c.freeDays) * c.feePerDay;
}

/** Phí khai báo giá trị hàng hoá theo 2 bậc (dưới/trên ngưỡng) */
export function calcDeclaredValueFee(declaredValue: number) {
  const c = useStore.getState().surcharges.insurance;
  if (!c?.enabled || !declaredValue) return 0;
  const pct = declaredValue > c.threshold ? c.percentOver : c.percentUnder;
  return Math.round((declaredValue * pct) / 100);
}
