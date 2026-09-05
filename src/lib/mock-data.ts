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
 * Resolve office code from master directory. Unknown labels stay as folded text —
 * do not invent a hub code.
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
  return folded;
}

/** Offices whose name/code matches an itinerary departure/destination point. */
export function officesMatchingPoint(offices: OfficeRec[], point: string | undefined | null): OfficeRec[] {
  if (!point?.trim()) return [];
  const key = foldOfficeKey(point);
  if (!key) return [];
  const direct = offices.filter((o) => {
    const n = foldOfficeKey(o.name);
    const c = foldOfficeKey(o.code);
    return n === key || c === key || n.includes(key) || key.includes(n);
  });
  if (direct.length) return direct;

  // Branch / itinerary points are province names (e.g. "Nam Định") while master is "VP Nam Định" (ND).
  const preferred = preferredOfficeCodesForPoint(key);
  const byPreferred = preferred
    .map((code) => offices.find((o) => o.code.toUpperCase() === code))
    .filter((o): o is OfficeRec => Boolean(o));
  if (byPreferred.length) return byPreferred;

  return offices.filter((o) => {
    const n = foldOfficeKey(o.name);
    return preferred.some((code) => n.includes(foldOfficeKey(code)) || foldOfficeKey(code).includes(n));
  });
}

/**
 * Map điểm tỉnh / mã ngắn → mã VP ưu tiên (khớp seed office.csv).
 * Dùng khi admin tạo đơn với lộ trình tỉnh mà combobox còn đang để raw "Nam Định".
 */
export function preferredOfficeCodesForPoint(foldedPoint: string): string[] {
  const f = foldedPoint;
  if (!f) return [];
  if (f === "nd" || f.includes("namdinh")) return ["ND", "SHN"];
  if (f === "nb" || f.includes("ninhbinh") || f.includes("tamcoc")) return ["NB"];
  if (f === "tb" || f.includes("thaibinh")) return ["TB"];
  if (f === "pt" || f.includes("phutho")) return ["PT"];
  if (f === "vt" || f.includes("viettri")) return ["VT"];
  if (f === "yb" || f.includes("yenbai") || f.startsWith("yb")) return ["YB1", "YB3"];
  if (f === "gp" || f.includes("giaiphong")) return ["GP"];
  if (f.includes("hadong")) return ["HD"];
  if (f.includes("bigc")) return ["BC"];
  if (f.includes("ngochoi")) return ["NGH"];
  if (f.includes("leduan")) return ["LD"];
  if (f.includes("phovong")) return ["PV"];
  if (f.includes("trandainghia")) return ["TDN"];
  return [];
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
    : [];
  // Không đưa raw tỉnh ("Nam Định") vào value — BE/strict resolve sẽ fail khi admin tạo đơn.
  if (currentValue && !opts.some((o) => o.value === currentValue)) {
    const found = offices.find((o) => o.code === currentValue || o.name === currentValue);
    if (found) {
      opts.push({ value: found.code, label: found.name });
    } else {
      const viaPoint = officesMatchingPoint(offices, currentValue);
      if (viaPoint[0]) opts.push({ value: viaPoint[0].code, label: viaPoint[0].name });
    }
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
  /** Tiền thu hộ COD (không gồm phí). */
  codAmount?: number;
  /** Phí thu hộ COD (cột riêng; không nằm trong fare). */
  codFee?: number;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  codExportedAt?: string;
  vehiclePlate?: string;
  driverName?: string;
};

export const HN_HUB_CODE = "GP";

export function hubOffice(): OfficeRec | undefined {
  return officeDirectory.find((o) => o.isHub);
}

export const HN_HUB_NAME = "VP Giải Phóng";

export function isHnOffice(x: string) {
  if (!x) return false;
  const hit = officeDirectory.find((o) => o.code === x || o.name === x);
  if (hit) return Boolean(hit.isHub) || hit.code === HN_HUB_CODE;
  return x === HN_HUB_CODE || x === HN_HUB_NAME;
}

/** Mã VP khu vực Hà Nội (hub + bưu cục HN). */
const HN_OFFICE_CODES = new Set(["gp", "hd", "bc", "vphn", "ngh", "ld", "pv", "tdn"]);

/**
 * Mã điểm trên tên/mã lộ trình phía HN (TC, BC, HĐ, GA…).
 * "TC" trong master đôi khi là Tam Cốc — xem `isHnRegionPoint` (ưu tiên tên điểm).
 */
const HN_ITINERARY_POINT_CODES = new Set(["tc", "bc", "hd", "ga", "gp", "vphn"]);

/** VP thuộc khu vực Hà Nội (hub + tên/mã gợi HN). */
export function isHnRegionOffice(o: { code: string; name: string; isHub?: boolean }) {
  if (!o) return false;
  if (o.isHub || o.code === HN_HUB_CODE) return true;
  if (isHnOffice(o.code) || isHnOffice(o.name)) return true;
  const codeKey = foldOfficeKey(o.code);
  if (HN_OFFICE_CODES.has(codeKey)) return true;
  const t = foldOfficeKey(`${o.code} ${o.name}`);
  return (
    t.includes("hanoi") ||
    t.includes("giaiphong") ||
    t.includes("bigc") ||
    t.includes("hadong") ||
    t.includes("ngochoi")
  );
}

export function hnRegionOffices(offices: OfficeRec[]): OfficeRec[] {
  return offices.filter(isHnRegionOffice);
}

function isProvincialRegionPoint(point: string): boolean {
  const f = foldOfficeKey(point);
  return (
    f.includes("tamcoc") ||
    f.includes("ninhbinh") ||
    f.includes("thaibinh") ||
    f.includes("namdinh") ||
    f.includes("phutho") ||
    f.includes("viettri") ||
    f.includes("yenbai")
  );
}

/** Điểm lộ trình / mã viết tắt thuộc HN (chọn full VP HN, không auto 1 VP). */
export function isHnRegionPoint(point: string | undefined | null, offices: OfficeRec[] = officeDirectory): boolean {
  if (!point?.trim()) return false;
  const raw = point.trim();
  const folded = foldOfficeKey(raw);

  // Tam Cốc = Ninh Bình (không phải HN dù mã lộ trình TC)
  if (folded.includes("tamcoc")) return false;
  if (isProvincialRegionPoint(raw) && !folded.includes("hanoi")) return false;

  if (/hà\s*nội|ha\s*noi|\bhn\b/i.test(raw)) return true;
  // Khớp BE toSlug → ha-noi: Ga HN, Hà Đông, Big C, Phố Cổ, Giải Phóng…
  if (
    folded.includes("hanoi") ||
    folded.includes("hadong") ||
    folded.includes("bigc") ||
    folded.includes("giaiphong") ||
    folded.includes("phoco") ||
    folded.includes("noibai") ||
    folded === "ga" ||
    (folded.startsWith("ga") && folded.includes("hanoi"))
  ) {
    return true;
  }
  if (HN_ITINERARY_POINT_CODES.has(folded)) return true;

  const matched = officesMatchingPoint(offices, raw);
  if (matched.length >= 1 && matched.every(isHnRegionOffice)) return true;
  if (matched.length === 1 && isHnRegionOffice(matched[0])) return true;
  return false;
}

function splitRouteSides(label: string | undefined | null): [string, string] | null {
  if (!label?.trim()) return null;
  const parts = label
    .split(/\s*[-–—]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return [parts[0], parts[parts.length - 1]];
}

export type ItineraryHnRef = {
  name?: string;
  code?: string;
  departurePoint?: string;
  destinationPoint?: string;
  routeDirection?: string;
};

/**
 * Phía đi/đến của lộ trình có phải HN không.
 * Điểm TC/BC/HĐ/GA đứng trước → gửi từ HN; đứng sau → nhận tại HN (và ngược lại).
 */
export function isHnItinerarySide(
  it: ItineraryHnRef | undefined | null,
  side: "from" | "to",
  offices: OfficeRec[] = officeDirectory,
): boolean {
  if (!it) return false;

  const point = side === "from" ? it.departurePoint : it.destinationPoint;
  if (point?.trim()) {
    if (isHnRegionPoint(point, offices)) return true;
    if (isProvincialRegionPoint(point)) return false;
    const matched = officesMatchingPoint(offices, point);
    if (matched.length >= 1) return matched.some(isHnRegionOffice);
  }

  const dirSides = splitRouteSides(it.routeDirection);
  if (dirSides) {
    const dirPoint = side === "from" ? dirSides[0] : dirSides[1];
    if (isHnRegionPoint(dirPoint, offices)) return true;
    if (isProvincialRegionPoint(dirPoint)) return false;
  }

  for (const label of [it.name, it.code]) {
    const sides = splitRouteSides(label);
    if (!sides) continue;
    const token = side === "from" ? sides[0] : sides[1];
    if (isHnRegionPoint(token, offices)) return true;
  }
  return false;
}

/** Map điểm/mã lộ trình → tên tỉnh/TP cho AddressPicker (V1; V2 tự map Thái Bình→Hưng Yên). */
function provinceNameFromPointText(point: string | undefined | null): string | undefined {
  if (!point?.trim()) return undefined;
  const f = foldOfficeKey(point);
  if (
    f.includes("hanoi") ||
    f.includes("hadong") ||
    f.includes("bigc") ||
    f.includes("giaiphong") ||
    f.includes("phoco") ||
    f.includes("noibai") ||
    f === "ga" ||
    HN_ITINERARY_POINT_CODES.has(f)
  ) {
    if (f.includes("tamcoc")) return "Ninh Bình";
    return "Hà Nội";
  }
  if (f.includes("tamcoc") || f.includes("ninhbinh") || f === "nb") return "Ninh Bình";
  if (f.includes("thaibinh") || f === "tb") return "Thái Bình";
  if (f.includes("namdinh") || f === "nd") return "Nam Định";
  if (f.includes("phutho") || f === "pt") return "Phú Thọ";
  if (f.includes("viettri") || f === "vt") return "Việt Trì";
  if (f.includes("yenbai") || f === "yb" || f.startsWith("yb")) return "Yên Bái";
  if (f.includes("hungyen")) return "Hưng Yên";
  return undefined;
}

/**
 * Gợi ý tỉnh/TP theo phía lộ trình (điểm TC/BC/HĐ/GA → Hà Nội; phía tỉnh → đúng tỉnh).
 */
export function provinceHintFromItinerarySide(
  it: ItineraryHnRef | undefined | null,
  side: "from" | "to",
  offices: OfficeRec[] = officeDirectory,
): string | undefined {
  if (!it) return undefined;
  if (isHnItinerarySide(it, side, offices)) return "Hà Nội";

  const point = side === "from" ? it.departurePoint : it.destinationPoint;
  const fromPoint = provinceNameFromPointText(point);
  if (fromPoint) return fromPoint;

  const dirSides = splitRouteSides(it.routeDirection);
  if (dirSides) {
    const fromDir = provinceNameFromPointText(side === "from" ? dirSides[0] : dirSides[1]);
    if (fromDir) return fromDir;
  }

  for (const label of [it.name, it.code]) {
    const sides = splitRouteSides(label);
    if (!sides) continue;
    const fromToken = provinceNameFromPointText(side === "from" ? sides[0] : sides[1]);
    if (fromToken) return fromToken;
  }
  return undefined;
}

/** Tuyến (branch) thuộc HN theo tên hoặc điểm đi/đến của lộ trình. */
export function isHnBranch(
  branchName: string,
  itineraries: (ItineraryHnRef & { branch?: { name?: string } })[],
  offices: OfficeRec[],
): boolean {
  if (!branchName?.trim()) return false;
  if (/hà\s*nội|ha\s*noi|\bhn\b|giải\s*phóng/i.test(branchName)) return true;
  return itineraries.some((it) => {
    if (it.branch?.name !== branchName) return false;
    return isHnItinerarySide(it, "from", offices) || isHnItinerarySide(it, "to", offices);
  });
}

/** Tuyến nhân viên VP tỉnh được phép chọn (khớp mã/tên VP trên tên tuyến hoặc điểm lộ trình). */
export function branchesForStaffOffice(
  branchNames: string[],
  staffOfficeCode: string,
  offices: OfficeRec[],
  itineraries: { name?: string; branch?: { name?: string }; departurePoint?: string; destinationPoint?: string }[],
): string[] {
  const staff = offices.find((o) => o.code === staffOfficeCode || o.name === staffOfficeCode);
  if (!staff) return branchNames;
  if (isHnRegionOffice(staff)) return branchNames;
  const keys = [foldOfficeKey(staff.code), foldOfficeKey(staff.name)].filter(Boolean);
  return branchNames.filter((bn) => {
    const bnKey = foldOfficeKey(bn);
    if (keys.some((k) => bnKey.includes(k) || k.includes(bnKey))) return true;
    return itineraries.some((it) => {
      if (it.branch?.name !== bn) return false;
      const blob = foldOfficeKey(`${it.departurePoint ?? ""} ${it.destinationPoint ?? ""} ${it.name ?? ""}`);
      return keys.some((k) => blob.includes(k));
    });
  });
}

/**
 * Trung chuyển qua hub đã tắt: đơn mới luôn 1 chặng VP gửi → VP nhận.
 */
export function needsHubTransit(_from: string, _to: string) {
  return false;
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

/** Tiền VNĐ dạng #.###.### VNĐ (làm tròn đồng). */
export function formatVND(n: number) {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `${v.toLocaleString("vi-VN")} VNĐ`;
}

/** Chuỗi hiển thị trong ô nhập tiền: #.###.### (không kèm đơn vị). */
export function formatVndInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return Math.round(n).toLocaleString("vi-VN");
}

/** Lấy số VNĐ từ chuỗi ô nhập (bỏ dấu chấm/phẩy/chữ). */
export function parseVndInput(raw: string): number {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** Cân KG — giữ thập phân, bỏ số 0 thừa phía sau. */
export function formatKg(n: number | null | undefined, digits = 3) {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Number(n);
  const s = v.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return `${s} KG`;
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
