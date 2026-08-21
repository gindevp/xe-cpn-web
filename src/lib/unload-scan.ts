import { canonicalOfficeCode, officeName, type Order } from "./mock-data";
import { packageCode, packageCount, parsePackageScan } from "./package-label";

export function sameOffice(a?: string | null, b?: string | null) {
  const ca = canonicalOfficeCode(a);
  const cb = canonicalOfficeCode(b);
  return !!ca && !!cb && ca === cb;
}

/** VP đang nhận chặng hiện tại (hub hoặc VP đích). */
export function unloadDestOffice(order: Order): string {
  const idx = order.currentLegIndex ?? 0;
  const leg = order.legs?.find((l) => l.index === idx) ?? order.legs?.[idx];
  if (leg?.toOffice) return leg.toOffice;
  return order.toOffice;
}

/** QR URL / khoảng trắng / chữ thường → mã kiện hoặc mã đơn. */
export function normalizeScanRaw(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  try {
    const url = new URL(s);
    s = url.searchParams.get("code") || url.searchParams.get("order") || url.pathname.split("/").filter(Boolean).pop() || s;
  } catch {
    /* not a URL */
  }
  s = (s.split(/\s+/).pop() || s).trim();
  return s.toUpperCase();
}

function matchesOrderCode(order: Order, orderCode: string) {
  const c = orderCode.toUpperCase();
  return order.code.toUpperCase() === c || (order.draftCode?.toUpperCase() ?? "") === c;
}

/** Đơn đang ở tab Hàng trên xe (VP gửi đã xuất). */
export function isHangTrenXe(order: Order) {
  const stage = (order as Order & { stage?: string }).stage;
  if (stage) return stage === "TRANSFERRING";
  return order.status === "IN_TRANSIT";
}

export function findOrderForScan(orders: Order[], raw: string): { order: Order; seq?: number } | null {
  const code = normalizeScanRaw(raw);
  if (!code) return null;
  const parsed = parsePackageScan(code);
  const direct = orders.find((o) => matchesOrderCode(o, parsed.orderCode));
  if (direct) {
    const seq = parsed.seq ?? (packageCount(direct) === 1 ? 1 : undefined);
    return { order: direct, seq };
  }
  for (const o of orders) {
    const n = packageCount(o);
    for (let seq = 1; seq <= n; seq++) {
      if (packageCode(o.code, seq).toUpperCase() === code) return { order: o, seq };
      if (o.draftCode && packageCode(o.draftCode, seq).toUpperCase() === code) return { order: o, seq };
    }
  }
  return null;
}

export function validateUnloadPackage(opts: {
  order: Order;
  seq: number;
  scannerOffice: string;
  alreadyWarehouseIn?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const { order, seq, scannerOffice, alreadyWarehouseIn } = opts;
  const n = packageCount(order);
  if (!Number.isInteger(seq) || seq < 1 || seq > n) {
    return { ok: false, error: `Kiện ${seq} không thuộc đơn ${order.code}` };
  }
  if (!alreadyWarehouseIn && !isHangTrenXe(order)) {
    return {
      ok: false,
      error: `Đơn ${order.code} không ở tab Hàng trên xe — không thể xuống hàng`,
    };
  }
  if (!scannerOffice.trim()) {
    return { ok: false, error: "Tài khoản chưa gán văn phòng — không quét xuống hàng được" };
  }
  const dest = unloadDestOffice(order);
  if (!sameOffice(scannerOffice, dest) && !sameOffice(scannerOffice, order.toOffice)) {
    return {
      ok: false,
      error: `Tài khoản thuộc ${officeName(scannerOffice)} — đơn này VP nhận là ${officeName(dest)}. Chỉ VP nhận mới được quét xuống hàng.`,
    };
  }
  return { ok: true };
}
