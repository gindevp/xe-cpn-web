import type { Order } from "./mock-data";
import { GOODS_TYPES, OTHER_GOODS } from "./mock-data";

const GOODS_ENUM = new Set(GOODS_TYPES.map((g) => g.value));
/** Đơn cũ: 1 chuỗi tên hàng, các kiện ngăn bằng dấu phẩy. Chỉ đọc, không ghi mới. */
const KIEN_RE = /\[KIEN\]([\s\S]*?)\[\/KIEN\]/;
const LOAI_RE = /\[LOAI\]([\s\S]*?)\[\/LOAI\]/;
const TENHANG_RE = /\[TENHANG\]([\s\S]*?)\[\/TENHANG\]/;
const WHIN_RE = /\[WHIN\]([\d,]*)\[\/WHIN\]/;
const CUOC_RE = /\[CUOC\]([\d,\s]*)\[\/CUOC\]/;
const SLQTY_RE = /\[SLQTY\]([\d,]*)\[\/SLQTY\]/;
const PKGKG_RE = /\[PKGKG\]([\d.,\s]*)\[\/PKGKG\]/;

/** Số kiện trên đơn (tối thiểu 1). */
export function packageCount(order: Pick<Order, "quantity">): number {
  const q = order.quantity ?? 1;
  return Math.max(1, q);
}

/** Mã kiện: mã đơn + STT (1-based), ví dụ TNGH260818-06_2 */
export function packageCode(orderCode: string, seq: number): string {
  return `${orderCode}_${seq}`;
}

/** Tách mã quét: `TDN05092600001_2` → đơn + STT; mã đơn thuần thì không có seq. */
export function parsePackageScan(raw: string): { orderCode: string; seq?: number } {
  const c = raw.trim().toUpperCase();
  const m = c.match(/^(.*)_([1-9]\d*)$/);
  if (m) return { orderCode: m[1], seq: Number(m[2]) };
  return { orderCode: c };
}

export function packageSeqList(order: Pick<Order, "quantity">): number[] {
  return Array.from({ length: packageCount(order) }, (_, i) => i + 1);
}

export function isGoodsTypeEnum(value?: string): boolean {
  return !!value && GOODS_ENUM.has(value);
}

/** `|` và `[` là ký tự cấu trúc của note nên không cho lọt vào giá trị. */
function sanitizeListValue(v: string): string {
  return (v ?? "").replace(/[|[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** Danh sách theo kiện: ngăn bằng `|` để tên hàng chứa dấu phẩy không bị tách nhầm. */
function splitPipe(raw: string): string[] {
  const s = (raw ?? "").trim();
  return s ? s.split("|").map((x) => x.trim()) : [];
}

export type OrderNoteMeta = {
  /** Loại hàng từng kiện. */
  goodsKinds: string[];
  /** Loại hàng đơn cũ (tag [KIEN]) — giữ nguyên khi ghi lại note. */
  goodsName: string;
  /** Tên hàng tự nhập từng kiện (chỉ có khi loại hàng là "Khác"). */
  goodsNames: string[];
  warehouseInSeqs: number[];
  packageFares: number[];
  /** Số lượng sản phẩm trong từng kiện (khai báo) — 1 phần tử / kiện. */
  packageItemQtys: number[];
  /** Khối lượng (kg) từng kiện — 1 phần tử / kiện. */
  packageWeightsKg: number[];
  body: string;
};

/** Chia VND nguyên, kiện cuối nhận phần dư để tổng đúng. */
export function splitMoney(total: number, n: number): number[] {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const count = Math.max(1, n);
  if (count === 1) return [t];
  const base = Math.floor(t / count);
  const rem = t - base * count;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + rem : base));
}

export function parseOrderNoteMeta(note?: string): OrderNoteMeta {
  const raw = note ?? "";
  const goodsName = raw.match(KIEN_RE)?.[1]?.trim() ?? "";
  const goodsKinds = splitPipe(raw.match(LOAI_RE)?.[1] ?? "");
  const goodsNames = splitPipe(raw.match(TENHANG_RE)?.[1] ?? "");
  const warehouseInSeqs = [
    ...new Set(
      (raw.match(WHIN_RE)?.[1] ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b);
  const cuocRaw = raw.match(CUOC_RE)?.[1] ?? "";
  const packageFares = cuocRaw
    ? cuocRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n >= 0)
    : [];
  const packageItemQtys = (raw.match(SLQTY_RE)?.[1] ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const packageWeightsKg = (raw.match(PKGKG_RE)?.[1] ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const body = raw
    .replace(KIEN_RE, "")
    .replace(LOAI_RE, "")
    .replace(TENHANG_RE, "")
    .replace(WHIN_RE, "")
    .replace(CUOC_RE, "")
    .replace(SLQTY_RE, "")
    .replace(PKGKG_RE, "")
    .trim();
  return { goodsKinds, goodsName, goodsNames, warehouseInSeqs, packageFares, packageItemQtys, packageWeightsKg, body };
}

export function buildOrderNote(meta: {
  goodsKinds?: string[];
  goodsName?: string;
  goodsNames?: string[];
  warehouseInSeqs?: number[];
  packageFares?: number[];
  packageItemQtys?: number[];
  packageWeightsKg?: number[];
  body?: string;
}): string | undefined {
  const parts: string[] = [];
  const kinds = (meta.goodsKinds ?? []).map(sanitizeListValue);
  const goods = meta.goodsName?.trim();
  if (kinds.some(Boolean)) parts.push(`[LOAI]${kinds.join("|")}[/LOAI]`);
  else if (goods) parts.push(`[KIEN]${goods}[/KIEN]`);
  const names = (meta.goodsNames ?? []).map(sanitizeListValue);
  if (names.some(Boolean)) parts.push(`[TENHANG]${names.join("|")}[/TENHANG]`);
  const seqs = [...new Set(meta.warehouseInSeqs ?? [])].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  if (seqs.length) parts.push(`[WHIN]${seqs.join(",")}[/WHIN]`);
  const fares = (meta.packageFares ?? []).filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.round(n));
  if (fares.length) parts.push(`[CUOC]${fares.join(",")}[/CUOC]`);
  const qtys = (meta.packageItemQtys ?? []).filter((n) => Number.isInteger(n) && n > 0);
  if (qtys.length) parts.push(`[SLQTY]${qtys.join(",")}[/SLQTY]`);
  const weights = (meta.packageWeightsKg ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  if (weights.length) {
    parts.push(`[PKGKG]${weights.map((w) => Number(w.toFixed(2))).join(",")}[/PKGKG]`);
  }
  const body = meta.body?.trim();
  if (body) parts.push(body);
  return parts.length ? parts.join("\n") : undefined;
}

/** Ghi lại note, giữ nguyên các tag khác. */
function rebuildNote(note: string | undefined, patch: Partial<OrderNoteMeta>): string | undefined {
  return buildOrderNote({ ...parseOrderNoteMeta(note), ...patch });
}

/** Lưới an toàn cho đơn tạo ngoài dialog: chỉ ghi khi note chưa có loại hàng. */
export function embedGoodsName(note: string | undefined, goodsName: string | undefined): string | undefined {
  const m = parseOrderNoteMeta(note);
  const name = goodsName?.trim();
  if (!name || isGoodsTypeEnum(name) || m.goodsKinds.some(Boolean) || m.goodsName) {
    return rebuildNote(note, {});
  }
  return rebuildNote(note, { goodsKinds: [name] });
}

/** Loại hàng + tên hàng tự nhập của từng kiện (1 phần tử / kiện). */
export function embedPackageGoods(
  note: string | undefined,
  kinds: string[],
  names: string[],
): string | undefined {
  return rebuildNote(note, { goodsKinds: kinds, goodsName: "", goodsNames: names });
}

export function embedWarehouseInSeqs(note: string | undefined, seqs: number[]): string | undefined {
  return rebuildNote(note, { warehouseInSeqs: seqs });
}

export function embedPackageFares(note: string | undefined, fares: number[] | undefined): string | undefined {
  return rebuildNote(note, { packageFares: fares ?? [] });
}

export function embedPackageItemQtys(note: string | undefined, qtys: number[] | undefined): string | undefined {
  return rebuildNote(note, { packageItemQtys: qtys ?? [] });
}

export function embedPackageWeightsKg(note: string | undefined, weights: number[] | undefined): string | undefined {
  return rebuildNote(note, { packageWeightsKg: weights ?? [] });
}

export function displayOrderNote(note?: string): string {
  return parseOrderNoteMeta(note).body;
}

export function warehouseInSeqs(order: Pick<Order, "note">): number[] {
  return parseOrderNoteMeta(order.note).warehouseInSeqs;
}

export function isPackageWarehouseIn(order: Pick<Order, "note">, seq: number): boolean {
  return warehouseInSeqs(order).includes(seq);
}

/** Loại hàng từng kiện lấy từ note; đơn cũ tách chuỗi [KIEN] theo dấu phẩy. */
export function orderGoodsKinds(order: Pick<Order, "goodsType" | "note">): string[] {
  const m = parseOrderNoteMeta(order.note);
  if (m.goodsKinds.some(Boolean)) return m.goodsKinds;
  const legacy = m.goodsName || (isGoodsTypeEnum(order.goodsType ?? "") ? "" : (order.goodsType ?? "").trim());
  return legacy
    ? legacy
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/** Nhãn 1 kiện: "loại hàng (tên hàng)" — tên hàng chỉ có khi loại là "Khác". */
export function goodsLabelOf(kind: string, goodsName?: string): string {
  const k = kind.trim();
  const n = (goodsName ?? "").trim();
  if (k && n) return `${k} (${n})`;
  return k || n;
}

/** Nhãn "Loại hàng" mức đơn — gộp các nhãn kiện khác nhau. */
export function orderGoodsLabel(order: Pick<Order, "goodsType" | "note">): string {
  const m = parseOrderNoteMeta(order.note);
  const labels = [
    ...new Set(orderGoodsKinds(order).map((k, i) => goodsLabelOf(k, m.goodsNames[i])).filter(Boolean)),
  ];
  return labels.join(", ") || goodsTypeLabel(order.goodsType);
}

export type PackageInboundStatus = "IN" | "MISSING";

export type PackageRow = {
  seq: number;
  code: string;
  /** Loại hàng (chọn từ bảng giá theo sản phẩm, hoặc "Khác"). */
  kind: string;
  /** Tên hàng tự nhập — chỉ có khi loại hàng là "Khác". */
  goodsName: string;
  /** Nhãn hiển thị "loại hàng (tên hàng)". */
  label: string;
  /** Số lượng sản phẩm trong kiện (khai báo). */
  itemQty: number;
  weightKg?: number;
  fare: number;
  inboundStatus: PackageInboundStatus;
};

/** Loại hàng từng kiện; đơn cũ chỉ ghi 1 giá trị thì áp cho mọi kiện. */
function kindsForPackages(order: Order, total: number): string[] {
  const parts = orderGoodsKinds(order).filter(Boolean);
  const fallback = goodsTypeLabel(order.goodsType);
  if (parts.length === 0) return Array.from({ length: total }, () => fallback);
  if (parts.length === 1) return Array.from({ length: total }, () => parts[0]);
  return Array.from({ length: total }, (_, i) => parts[i] || parts[parts.length - 1] || fallback);
}

function faresForPackages(order: Order, total: number): number[] {
  const stored = parseOrderNoteMeta(order.note).packageFares;
  if (stored.length === total) return stored;
  return splitMoney(order.fare ?? 0, total);
}

function weightsForPackages(order: Order, total: number): number[] {
  const stored = parseOrderNoteMeta(order.note).packageWeightsKg;
  if (stored.length === total) {
    return stored.map((w) => Number(Number(w).toFixed(2)));
  }
  if (total === 1 && order.weightKg != null) {
    return [Number(order.weightKg.toFixed(2))];
  }
  if (order.weightKg != null && total > 0) {
    const perPkg = Number((order.weightKg / total).toFixed(2));
    return Array.from({ length: total }, () => perPkg);
  }
  return Array.from({ length: total }, () => 0);
}

/** Chi tiết từng kiện — KL lấy từ [PKGKG] (1 dòng tạo đơn = 1 kiện). */
export function packageRows(order: Order): PackageRow[] {
  const total = packageCount(order);
  const weights = weightsForPackages(order, total);
  const fares = faresForPackages(order, total);
  const meta = parseOrderNoteMeta(order.note);
  const kinds = kindsForPackages(order, total);
  const inSet = new Set(warehouseInSeqs(order));

  return packageSeqList(order).map((seq) => {
    const kind = kinds[seq - 1] || goodsTypeLabel(order.goodsType);
    const goodsName = meta.goodsNames[seq - 1] ?? "";
    return {
      seq,
      code: packageCode(order.code, seq),
      kind,
      goodsName,
      label: goodsLabelOf(kind, goodsName),
      itemQty: meta.packageItemQtys[seq - 1] ?? 1,
      weightKg: weights[seq - 1],
      fare: fares[seq - 1] ?? 0,
      inboundStatus: inSet.has(seq) ? "IN" : "MISSING",
    };
  });
}

export function packageFareOf(order: Order, seq: number): number {
  return packageRows(order)[seq - 1]?.fare ?? order.fare ?? 0;
}

/** Nhãn loại hàng của 1 kiện: "loại hàng (tên hàng)". */
export function packageNameOf(order: Order, seq: number): string {
  return packageRows(order)[seq - 1]?.label || goodsTypeLabel(order.goodsType);
}

export function goodsTypeLabel(goodsType?: string): string {
  if (!goodsType) return "—";
  return GOODS_TYPES.find((g) => g.value === goodsType)?.label ?? goodsType;
}

export type PackageEditFields = {
  kind: string;
  goodsName: string;
  itemQty: number;
  weightKg: number;
  fare: number;
};

/** Cập nhật 1 kiện (1-based seq) — ghi lại note + tổng KL/cước/số kiện. */
export function applyPackageEdit(
  order: Order,
  seq: number,
  patch: PackageEditFields,
): Pick<Order, "note" | "quantity" | "weightKg" | "fare" | "goodsType"> {
  const rows = packageRows(order);
  const idx = seq - 1;
  if (idx < 0 || idx >= rows.length) {
    return {
      note: order.note,
      quantity: packageCount(order),
      weightKg: order.weightKg,
      fare: order.fare,
      goodsType: order.goodsType,
    };
  }
  const next = rows.map((r, i) =>
    i === idx
      ? {
          ...r,
          kind: patch.kind.trim() || r.kind,
          goodsName: patch.kind.trim() === OTHER_GOODS ? patch.goodsName.trim() : "",
          itemQty: Math.max(1, Math.round(patch.itemQty) || 1),
          weightKg: Math.max(0, Number(patch.weightKg) || 0),
          fare: Math.max(0, Math.round(Number(patch.fare) || 0)),
        }
      : r,
  );
  return persistPackageRows(order, next);
}

/** Xóa 1 kiện (1-based). Không cho xóa kiện cuối cùng. */
export function applyPackageRemove(
  order: Order,
  seq: number,
): { ok: true; patch: Pick<Order, "note" | "quantity" | "weightKg" | "fare" | "goodsType"> } | { ok: false; error: string } {
  const rows = packageRows(order);
  if (rows.length <= 1) return { ok: false, error: "Đơn phải còn ít nhất 1 kiện" };
  const idx = seq - 1;
  if (idx < 0 || idx >= rows.length) return { ok: false, error: "Không tìm thấy kiện" };
  const next = rows.filter((_, i) => i !== idx);
  const remappedWhin = warehouseInSeqs(order)
    .filter((s) => s !== seq)
    .map((s) => (s > seq ? s - 1 : s))
    .filter((s) => s >= 1 && s <= next.length);
  return { ok: true, patch: persistPackageRows(order, next, remappedWhin) };
}

function persistPackageRows(
  order: Order,
  rows: Array<{ kind: string; goodsName: string; itemQty: number; weightKg?: number; fare: number }>,
  warehouseInOverride?: number[],
): Pick<Order, "note" | "quantity" | "weightKg" | "fare" | "goodsType"> {
  const n = Math.max(1, rows.length);
  const kinds = rows.map((r) => r.kind.trim() || "Hàng hoá");
  const names = rows.map((r) => (r.kind.trim() === OTHER_GOODS ? r.goodsName.trim() : ""));
  const qtys = rows.map((r) => Math.max(1, Math.round(r.itemQty) || 1));
  const weights = rows.map((r) => Math.max(0, Number(r.weightKg) || 0));
  const fares = rows.map((r) => Math.max(0, Math.round(Number(r.fare) || 0)));
  const whin = (warehouseInOverride ?? warehouseInSeqs(order)).filter((s) => s >= 1 && s <= n);

  let note = embedPackageGoods(order.note, kinds, names);
  note = embedPackageFares(note, fares);
  note = embedPackageItemQtys(note, qtys);
  note = embedPackageWeightsKg(note, weights);
  note = embedWarehouseInSeqs(note, whin);

  const weightKg = Number(weights.reduce((s, w) => s + w, 0).toFixed(2));
  const fare = fares.reduce((s, f) => s + f, 0);
  const goodsType = [...new Set(kinds.filter(Boolean))].join(", ") || order.goodsType;

  return { note, quantity: n, weightKg, fare, goodsType };
}
