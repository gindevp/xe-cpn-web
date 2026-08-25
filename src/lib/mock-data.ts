// Domain types, labels, and helpers. Master data comes from the API.

// Chức danh đang dùng: AD, DH, KT. Các mã còn lại là dữ liệu cũ, giữ để đọc bản ghi lịch sử.
export type Role = "KH" | "Q" | "BX" | "G" | "KT" | "TCN" | "DH" | "BL" | "AD";

export const ROLE_LABELS: Record<Role, string> = {
  KH: "Khách",
  Q: "Quầy",
  BX: "Bốc xếp",
  G: "Giao",
  KT: "Kế toán",
  TCN: "Trưởng CN",
  DH: "Điều phối",
  BL: "Ban lãnh đạo",
  AD: "Admin",
};

export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "WAITING"
  | "IN_TRANSIT"
  | "AT_DEST"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "CANCELLED"
  | "RETURNING"
  | "RETURNED";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã chốt",
  WAITING: "Chờ xuất",
  IN_TRANSIT: "Đang vận chuyển",
  AT_DEST: "Đến VP đích",
  OUT_FOR_DELIVERY: "Đang giao",
  DELIVERED: "Đã giao",
  FAILED_DELIVERY: "Giao thất bại",
  CANCELLED: "Đã hủy",
  RETURNING: "Đang hoàn",
  RETURNED: "Đã hoàn",
};

export type TripStatus =
  | "CREATED"
  | "LOADING"
  | "DEPARTED"
  | "UNLOADING"
  | "CLOSED"
  | "CANCELLED";

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  CREATED: "Đã tạo",
  LOADING: "Đang bốc",
  DEPARTED: "Đã xuất bến",
  UNLOADING: "Đang nhập",
  CLOSED: "Đã đóng",
  CANCELLED: "Đã hủy",
};

export const GOODS_TYPES = [
  { value: "THUONG", label: "Thường" },
  { value: "DE_VO", label: "Dễ vỡ" },
  { value: "DIEN_TU", label: "Điện tử" },
  { value: "THUC_PHAM_KHO", label: "Thực phẩm khô" },
  { value: "GIAY_TO", label: "Giấy tờ" },
  { value: "CONG_KENH", label: "Cồng kềnh" },
];

/** Loại hàng cho phép tự nhập tên hàng. */
export const OTHER_GOODS = "Khác";

/**
 * Danh mục loại hàng mặc định — chỉ dùng để nạp sẵn tab "Giá theo sản phẩm".
 * Lúc tạo đơn, danh sách loại hàng lấy từ bảng giá theo sản phẩm (+ "Khác").
 */
export const GOODS_NAMES = [
  "Bưu kiện",
  "Tài liệu / Giấy tờ",
  "Quần áo",
  "Thực phẩm khô",
  "Đồ điện tử",
  "Đồ gia dụng",
  "Linh kiện / Phụ tùng",
  "Mỹ phẩm",
  "Thuốc / Y tế",
  "Hàng dễ vỡ",
  "Hàng cồng kềnh",
];

const GOODS_NAME_TO_TYPE: Record<string, string> = {
  "Bưu kiện": "THUONG",
  "Tài liệu / Giấy tờ": "GIAY_TO",
  "Quần áo": "THUONG",
  "Thực phẩm khô": "THUC_PHAM_KHO",
  "Đồ điện tử": "DIEN_TU",
  "Đồ gia dụng": "THUONG",
  "Linh kiện / Phụ tùng": "THUONG",
  "Mỹ phẩm": "THUONG",
  "Thuốc / Y tế": "THUONG",
  "Hàng dễ vỡ": "DE_VO",
  "Hàng cồng kềnh": "CONG_KENH",
  Khác: "THUONG",
};

/** Đơn nhiều kiện: lấy loại cần lưu ý nhất để BE/kho biết cách xử lý. */
const GOODS_TYPE_PRIORITY = ["CONG_KENH", "DE_VO", "DIEN_TU", "THUC_PHAM_KHO", "GIAY_TO", "THUONG"];

/** Tên hàng → enum GoodsType của BE. Tên tự nhập ("Khác") coi là THUONG. */
export function goodsTypeFromName(goodsName?: string): string {
  const types = (goodsName ?? "")
    .split(",")
    .map((s) => GOODS_NAME_TO_TYPE[s.trim()])
    .filter(Boolean);
  return GOODS_TYPE_PRIORITY.find((t) => types.includes(t)) ?? "THUONG";
}

export const COLLECT_FORMS = [
  { value: "GUI_TRA", label: "Gửi trả" },
  { value: "NHAN_TRA", label: "Nhận trả" },
  { value: "P30_70", label: "30% trước – 70% sau" },
  { value: "P50_50", label: "50% trước – 50% sau" },
  { value: "P70_30", label: "70% trước – 30% sau" },
];

export const PAY_METHODS = [
  { value: "TM", label: "Tiền mặt" },
  { value: "CK", label: "Chuyển khoản" },
  { value: "THE", label: "Thẻ" },
];

export type OfficeRec = { code: string; name: string; isHub?: boolean };

let officeDirectory: OfficeRec[] = [];

export function setOfficeDirectory(list: OfficeRec[]) {
  officeDirectory = list ?? [];
}

export function officeDirectoryList() {
  return officeDirectory;
}

export function foldOfficeKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(vp|vanphong)/, "");
}

/**
 * GP, "VP Giải Phóng", "Giải Phóng" → cùng mã GP.
 * Dùng khi so VP gửi/nhận (tên trên form vs mã trên API).
 */
export function canonicalOfficeCode(raw?: string | null): string {
  const t = raw?.trim();
  if (!t || t === "ALL") return "";
  const dir = officeDirectory;
  const exact = dir.find((o) => o.code === t || o.name === t);
  if (exact) return exact.code.toUpperCase();
  const folded = foldOfficeKey(t);
  if (!folded) return t.toUpperCase();
  const byFold = dir.find((o) => foldOfficeKey(o.code) === folded || foldOfficeKey(o.name) === folded);
  if (byFold) return byFold.code.toUpperCase();
  const matched = officesMatchingPoint(dir, t);
  if (matched.length === 1) return matched[0].code.toUpperCase();
  if (matched.length > 1) {
    const exactFold = matched.find((o) => foldOfficeKey(o.code) === folded || foldOfficeKey(o.name) === folded);
    return (exactFold ?? matched[0]).code.toUpperCase();
  }
  if (t === HN_HUB_CODE || t === HN_HUB_NAME || folded === "gp" || folded === "giaiphong") {
    return HN_HUB_CODE;
  }
  return folded;
}

/** Offices whose name/code matches an itinerary departure/destination point. */
export function officesMatchingPoint(offices: OfficeRec[], point: string | undefined | null): OfficeRec[] {
  if (!point?.trim()) return [];
  const key = foldOfficeKey(point);
  if (!key) return [];
  return offices.filter((o) => {
    const n = foldOfficeKey(o.name);
    const c = foldOfficeKey(o.code);
    return n === key || c === key || n.includes(key) || key.includes(n);
  });
}

/** Combobox options for VP gửi/VP nhận: itinerary point, mapped to office master when possible. */
export function officeOptionsForPoint(
  offices: OfficeRec[],
  point: string | undefined | null,
  currentValue?: string,
): { value: string; label: string }[] {
  const matched = officesMatchingPoint(offices, point);
  const opts = matched.length
    ? matched.map((o) => ({ value: o.code, label: o.name }))
    : point?.trim()
      ? [{ value: point.trim(), label: point.trim() }]
      : [];
  if (currentValue && !opts.some((o) => o.value === currentValue)) {
    // currentValue có thể là code hoặc tên — tìm code tương ứng
    const found = offices.find((o) => o.code === currentValue || o.name === currentValue);
    opts.push({ value: found?.code ?? currentValue, label: found?.name ?? currentValue });
  }
  return opts;
}

export type LegStatus = "PENDING" | "IN_TRANSIT" | "AT_HUB" | "AT_DEST";

export type OrderLeg = {
  index: number;
  fromOffice: string;
  toOffice: string;
  tripCode?: string;
  status: LegStatus;
};

export type Order = {
  code: string;
  draftCode?: string;
  senderPhone: string;
  senderName?: string;
  receiverName: string;
  receiverPhone: string;
  fromOffice: string;
  toOffice: string;
  hubOffice?: string;
  finalToOffice?: string;
  legs?: OrderLeg[];
  currentLegIndex?: number;
  address?: string;
  goodsType: string;
  collectForm: string;
  weightKg?: number;
  quantity?: number;
  dimensions?: string;
  fare: number;
  pickupFee?: number;
  deliveryFee?: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  note?: string;
  homeDelivery?: boolean;
  homePickup?: boolean;
  pickupAddress?: string;
  pickupStaff?: string;
  pickingAt?: string;
  qrDropOff?: boolean;
  pickedUpAt?: string;
  paidAmount?: number;
  route?: string;
  itinerary?: string;
  branchCode?: string;
  shelf?: number;
  stage?:
    | "PICKED"
    | "WH_IN"
    | "TRANSFER_PENDING"
    | "TRANSFERRING"
    | "DEST_WH_IN"
    | "DELIVERING"
    | "FAILED";
  returnStage?:
    | "RETURN_PENDING"
    | "RT_TRANSFER_PENDING"
    | "RT_TRANSFERRING"
    | "RT_WH_IN"
    | "RT_DELIVERING"
    | "RT_FAILED"
    | "RT_DONE";
  tripCode?: string;
};

export const HN_HUB_CODE = "GP";

export function hubOffice(): OfficeRec | undefined {
  return officeDirectory.find((o) => o.isHub) ?? officeDirectory.find((o) => o.code === HN_HUB_CODE);
}

export const HN_HUB_NAME = "VP Giải Phóng";

export function isHnOffice(x: string) {
  if (!x) return false;
  const hit = officeDirectory.find((o) => o.code === x || o.name === x);
  if (hit) return Boolean(hit.isHub) || hit.code === HN_HUB_CODE;
  return x === HN_HUB_CODE || x === HN_HUB_NAME;
}

/**
 * Trung chuyển qua hub HN đang TẮT: đơn mới luôn 1 chặng VP gửi → VP nhận.
 * Giữ helper để bật lại khi nghiệp vụ hub được chốt (đơn cũ trong DB vẫn có hub + legs).
 */
export function needsHubTransit(from: string, to: string) {
  return !!from && !!to && !isHnOffice(from) && !isHnOffice(to);
}

export function describeItinerary(o: Order): {
  legs: { from: string; to: string; done: boolean; current: boolean }[];
  isMultiLeg: boolean;
  currentIdx: number;
  totalLegs: number;
} {
  const legs = o.legs && o.legs.length
    ? o.legs
    : [{ index: 0, fromOffice: o.fromOffice, toOffice: o.toOffice, status: "PENDING" as LegStatus }];
  const cur = o.currentLegIndex ?? 0;
  return {
    legs: legs.map((l, i) => ({
      from: l.fromOffice,
      to: l.toOffice,
      done: i < cur,
      current: i === cur,
    })),
    isMultiLeg: legs.length > 1,
    currentIdx: cur,
    totalLegs: legs.length,
  };
}

export type Trip = {
  code: string;
  bks: string;
  driver: string;
  route: string;
  departAt: string;
  status: TripStatus;
  office: string;
  scanned: number;
  loaded: number;
};

export function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + "₫";
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

export function officeName(code: string) {
  return officeDirectory.find((o) => o.code === code || o.name === code)?.name ?? code;
}

/** VP nhận đích thực (finalToOffice nếu có, không thì toOffice). */
export function orderReceiverOffice(order: Pick<Order, "toOffice" | "finalToOffice">): string {
  return order.finalToOffice || order.toOffice;
}

export function receiverOfficeName(order: Pick<Order, "toOffice" | "finalToOffice">): string {
  return officeName(orderReceiverOffice(order));
}

/** Nhãn lộ trình hiển thị: VP gửi → VP nhận đích. */
export function orderRouteLabel(order: Pick<Order, "fromOffice" | "toOffice" | "finalToOffice">): string {
  return `${officeName(order.fromOffice)} → ${receiverOfficeName(order)}`;
}
