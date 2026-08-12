// Helpers cước BR-025 & mã đơn.
import { useStore, type PricingRule } from "./store";

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
  const rules = useStore.getState().pricingRules.filter((x) => x.route === params.route);
  const dim = calcDimWeight(params.d ?? 0, params.r ?? 0, params.c ?? 0, rules[0]?.dimDivisor ?? 6000);
  const chargeKg = calcChargeWeight(params.realKg, dim);
  const rule = rules.find((r) => chargeKg > r.minKg - 0.001 && chargeKg <= r.maxKg + 0.001) ??
    rules[rules.length - 1];
  const base = rule ? Math.round(rule.unit * Math.max(chargeKg, rule.minKg || 0.1)) : 0;
  const surcharge = rule?.surcharge ?? 0;
  const kmRate = rule?.kmRate ?? 5000;
  const kmMin = rule?.kmMin ?? 2;
  const pickupFee = params.homePickup ? Math.max(params.pickupKm ?? kmMin, kmMin) * kmRate : 0;
  const deliveryFee = params.homeDelivery ? Math.max(params.deliveryKm ?? kmMin, kmMin) * kmRate : 0;
  return { base, surcharge, pickupFee, deliveryFee, total: base + surcharge + pickupFee + deliveryFee, chargeKg, ruleId: rule?.id };
}

let seq = 0;
export function genOrderCode(office: string) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const orders = useStore.getState().orders;
  // find max sequence for this office+year
  const prefix = `XE${yy}${office}`;
  const nums = orders
    .map((o) => o.code)
    .filter((c) => c?.startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10) || 0);
  const next = Math.max(0, ...nums, ++seq) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
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
  const rules = useStore.getState().pricingRules.filter((r) => r.route === route);
  return rules.find((r) => chargeKg > r.minKg - 0.001 && chargeKg <= r.maxKg + 0.001);
}

/** Phí lấy/giao tận nơi theo bảng khoảng cân × khoảng cách */
export function calcDoorFee(kind: "PICKUP" | "DELIVERY", chargeKg: number, km: number) {
  const st = useStore.getState();
  const row = st.doorFees.find(
    (r) =>
      r.kind === kind &&
      chargeKg > r.minKg - 0.001 &&
      chargeKg <= r.maxKg + 0.001 &&
      km > r.minKm - 0.001 &&
      km <= r.maxKm + 0.001,
  );
  return row?.fee ?? st.surcharges.homeDelivery.amount;
}

/** Giá đặc thù theo sản phẩm (ưu tiên hơn bảng giá cân nặng) */
export function findProductPrice(name?: string) {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  return useStore.getState().productPricing.find((p) => p.name.toLowerCase() === key);
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
