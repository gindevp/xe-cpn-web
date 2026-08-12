// Mock data store for X.E Việt Nam demo. Client-only; not persisted.
export type Role = "KH" | "Q" | "BX" | "G" | "KT" | "TCN" | "DH" | "BL" | "AD";

export const ROLE_LABELS: Record<Role, string> = {
  KH: "Khách",
  Q: "Quầy",
  BX: "Bốc xếp",
  G: "Giao",
  KT: "Kế toán",
  TCN: "Trưởng CN",
  DH: "Điều hành",
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

export const OFFICES = [
  { code: "NGH", name: "VP Ngọc Hồi" },
  { code: "LD", name: "VP Lê Duẩn" },
  { code: "PV", name: "VP Phố Vọng" },
  { code: "TDN", name: "VP Trần Đại Nghĩa" },
  { code: "GP", name: "VP Giải Phóng" },
  { code: "HD", name: "VP Hà Đông" },
  { code: "BC", name: "VP BigC" },
  { code: "NB", name: "VP Ninh Bình" },
  { code: "ND", name: "VP Nam Định" },
  { code: "SHN", name: "VP 104 Song Hào - NĐ" },
  { code: "TB", name: "VP Thái Bình" },
  { code: "PT", name: "VP Phú Thọ" },
  { code: "VT", name: "VP Việt Trì" },
  { code: "YB1", name: "VP Yên Bái 1" },
  { code: "YB3", name: "VP Yên Bái 3" },
];

export const ROUTES_MASTER = [
  "GP → NB",
  "GP → VT",
  "VT → NB",
  "NB → TB",
  "GP → ND",
];

export const VEHICLES = [
  { bks: "29H-123.45", capacity: 3500 },
  { bks: "51C-678.90", capacity: 5000 },
  { bks: "43A-111.22", capacity: 2500 },
  { bks: "30F-456.78", capacity: 4000 },
  { bks: "51G-234.56", capacity: 6000 },
  { bks: "43B-987.65", capacity: 3000 },
  { bks: "15C-321.54", capacity: 2000 },
  { bks: "65D-159.75", capacity: 5500 },
];

export const DRIVERS = [
  "Nguyễn Văn A",
  "Trần Văn B",
  "Lê Văn C",
  "Phạm Văn D",
  "Hoàng Minh E",
  "Đặng Quốc F",
  "Bùi Thanh G",
  "Ngô Hữu H",
];

export const PARTNERS = ["Ahamove", "Grab", "XanhSM"];

// Đơn tỉnh↔tỉnh chạy qua hub HN: chia thành nhiều chặng (legs) trên cùng 1 đơn.
export type LegStatus = "PENDING" | "IN_TRANSIT" | "AT_HUB" | "AT_DEST";

export type OrderLeg = {
  index: number;              // 0-based
  fromOffice: string;
  toOffice: string;
  tripCode?: string;
  status: LegStatus;
  departedAt?: string;
  arrivedAt?: string;
};

export type Order = {
  code: string;
  draftCode?: string;
  senderPhone: string;
  senderName?: string;
  receiverName: string;
  receiverPhone: string;
  fromOffice: string;          // = current leg fromOffice
  toOffice: string;            // = current leg toOffice
  hubOffice?: string;          // VP trung chuyển (thường là "GP" - VP Giải Phóng)
  finalToOffice?: string;      // VP đích cuối (khác toOffice khi còn chặng tiếp theo)
  legs?: OrderLeg[];
  currentLegIndex?: number;
  address?: string;
  goodsType: string;
  collectForm: string;
  weightKg?: number;
  quantity?: number; // số lượng kiện/món hàng
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
  pickupAddress?: string;     // địa chỉ nhân viên đến lấy hàng
  pickupStaff?: string;       // nhân viên phụ trách đi lấy
  pickingAt?: string;         // thời điểm shipper bắt đầu đi lấy hàng
  qrDropOff?: boolean;        // khách quét QR lên đơn tại bưu cục, chờ điều phối nhập kho
  pickedUpAt?: string;        // thời điểm đã lấy hàng & nhập kho thành công
  paidAmount?: number;
  shelf?: number;
  stage?:
    | "PICKED"
    | "WH_IN"
    | "TRANSFER_PENDING"
    | "TRANSFERRING"
    | "DEST_WH_IN"
    | "DELIVERING"
    | "FAILED";      // luồng Nhập kho - Luân chuyển - Đang giao
  returnStage?:
    | "RETURN_PENDING"
    | "RT_TRANSFER_PENDING"
    | "RT_TRANSFERRING"
    | "RT_WH_IN"
    | "RT_DELIVERING"
    | "RT_FAILED"
    | "RT_DONE";     // luồng Đơn hoàn
  tripCode?: string;           // = current leg tripCode
};

// ---------- Hub / itinerary helpers ----------
// Danh sách VP thuộc Hà Nội (các VP nội thành / hub).
export const HN_OFFICE_IDS = new Set<string>([
  "GP",
  "BC",
  "HD",
  "LD",
  "NGH",
  "PV",
  "TDN",
]);
// VP hub mặc định để trung chuyển tỉnh↔tỉnh.
export const HN_HUB_CODE = "GP";
export const HN_HUB_NAME = "VP Giải Phóng";

export function isHnOffice(x: string) {
  return HN_OFFICE_IDS.has(x);
}

// Có phải đơn tỉnh↔tỉnh (không đầu nào là HN) → cần trung chuyển
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

const now = new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return iso(d);
};
const hoursAgo = (h: number) => {
  const d = new Date(now);
  d.setHours(d.getHours() - h);
  return iso(d);
};
const todayAt = (h: number, m = 0) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return iso(d);
};

export const MOCK_ORDERS: Order[] = [
  {
    code: "XE24HN000123",
    senderPhone: "0987123456",
    senderName: "Nguyễn Thị Hoa",
    receiverName: "Trần Văn Nam",
    receiverPhone: "0912345678",
    fromOffice: "GP",
    toOffice: "NB",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 5.2,
    quantity: 2,
    fare: 185000,
    status: "IN_TRANSIT",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(0),
    paidAmount: 185000,
    tripCode: "THN241214-01",
  },
  {
    code: "XE24HN000124",
    senderPhone: "0977888999",
    receiverName: "Lê Thị Mai",
    receiverPhone: "0938222111",
    fromOffice: "GP",
    toOffice: "VT",
    goodsType: "DE_VO",
    collectForm: "NHAN_TRA",
    weightKg: 2.1,
    quantity: 1,
    fare: 95000,
    status: "AT_DEST",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    shelf: 3,
  },
  {
    code: "XE24HCM000201",
    senderPhone: "0901555777",
    senderName: "Shop Hoa Mai",
    receiverName: "Nguyễn Văn Tuấn",
    receiverPhone: "0912888777",
    fromOffice: "NB",
    toOffice: "GP",
    address: "125 Trần Duy Hưng, Cầu Giấy, Hà Nội",
    homeDelivery: true,
    deliveryFee: 30000,
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 4.5,
    quantity: 2,
    fare: 180000,
    status: "AT_DEST",
    createdAt: daysAgo(2),
    updatedAt: hoursAgo(3),
    paidAmount: 210000,
    shelf: 5,
  },
  {
    code: "XE24DN000205",
    senderPhone: "0938111222",
    senderName: "Trần Minh Đức",
    receiverName: "Phạm Thu Hà",
    receiverPhone: "0977333444",
    fromOffice: "VT",
    toOffice: "GP",
    address: "48 Nguyễn Chí Thanh, Đống Đa, Hà Nội",
    homeDelivery: true,
    deliveryFee: 25000,
    goodsType: "DIEN_TU",
    collectForm: "NHAN_TRA",
    weightKg: 1.8,
    quantity: 1,
    fare: 120000,
    status: "AT_DEST",
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(2),
    shelf: 8,
  },
  {
    code: "XE24HP000210",
    senderPhone: "0944777888",
    senderName: "Cty Hải Sản Biển Đông",
    receiverName: "Đỗ Văn Nam",
    receiverPhone: "0933222111",
    fromOffice: "ND",
    toOffice: "GP",
    address: "22 Kim Mã, Ba Đình, Hà Nội",
    homeDelivery: true,
    deliveryFee: 40000,
    goodsType: "THUC_PHAM_KHO",
    collectForm: "P50_50",
    weightKg: 6.2,
    quantity: 3,
    fare: 220000,
    status: "AT_DEST",
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(4),
    paidAmount: 110000,
    shelf: 2,
  },
  {
    code: "XE24HN000215",
    senderPhone: "0966444555",
    senderName: "Lê Hoàng Anh",
    receiverName: "Vũ Thị Ngọc",
    receiverPhone: "0922666777",
    fromOffice: "GP",
    toOffice: "NB",
    goodsType: "GIAY_TO",
    collectForm: "GUI_TRA",
    weightKg: 0.5,
    quantity: 1,
    fare: 60000,
    status: "AT_DEST",
    createdAt: daysAgo(4),
    updatedAt: daysAgo(2),
    paidAmount: 60000,
    shelf: 12,
  },
  {
    code: "XE24HCM000045",
    senderPhone: "0901234567",
    receiverName: "Phạm Quốc Bảo",
    receiverPhone: "0908765432",
    fromOffice: "NB",
    toOffice: "GP",
    address: "12 Nguyễn Trãi, Thanh Xuân, Hà Nội",
    hubOffice: "GP",
    goodsType: "DIEN_TU",
    collectForm: "P50_50",
    weightKg: 8.5,
    quantity: 3,
    fare: 320000,
    deliveryFee: 30000,
    homeDelivery: true,
    status: "OUT_FOR_DELIVERY",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(0),
    paidAmount: 160000,
  },
  {
    code: "XE24DN000009",
    senderPhone: "0912000111",
    receiverName: "Ngô Thị Lan",
    receiverPhone: "0977000222",
    fromOffice: "VT",
    toOffice: "NB",
    goodsType: "THUC_PHAM_KHO",
    collectForm: "GUI_TRA",
    weightKg: 3,
    quantity: 1,
    fare: 110000,
    status: "DELIVERED",
    createdAt: daysAgo(5),
    updatedAt: daysAgo(3),
    paidAmount: 110000,
  },
  {
    code: "XE24HN000125",
    draftCode: "N-HN-9981",
    senderPhone: "0966555444",
    receiverName: "Đinh Văn Hùng",
    receiverPhone: "0933777666",
    fromOffice: "GP",
    toOffice: "TB",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    fare: 0,
    quantity: 1,
    status: "DRAFT",
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
  {
    code: "XE24HP000012",
    senderPhone: "0944333222",
    receiverName: "Vũ Thị Trang",
    receiverPhone: "0922111000",
    fromOffice: "ND",
    toOffice: "GP",
    goodsType: "GIAY_TO",
    collectForm: "GUI_TRA",
    weightKg: 0.3,
    quantity: 1,
    fare: 45000,
    status: "CONFIRMED",
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
    paidAmount: 45000,
  },
  // ---- Đơn đang trên xe (IN_TRANSIT) — cho "Hàng sắp về" ----
  // Trip THCM241214-05: HCM → HN
  {
    code: "XE24HCM000101",
    senderPhone: "0901112233",
    senderName: "Công ty TNHH Minh Phát",
    receiverName: "Nguyễn Thị Hằng",
    receiverPhone: "0987001122",
    fromOffice: "NB",
    toOffice: "GP",
    goodsType: "DIEN_TU",
    collectForm: "GUI_TRA",
    weightKg: 12.4,
    quantity: 4,
    dimensions: "50x40x30",
    fare: 420000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(8),
    updatedAt: hoursAgo(6),
    paidAmount: 420000,
    tripCode: "THCM241214-05",
  },
  {
    code: "XE24HCM000102",
    senderPhone: "0938776655",
    senderName: "Shop Thảo Nguyên",
    receiverName: "Lê Quang Huy",
    receiverPhone: "0911223344",
    fromOffice: "NB",
    toOffice: "GP",
    address: "88 Cầu Giấy, Hà Nội",
    homeDelivery: true,
    deliveryFee: 35000,
    goodsType: "THUONG",
    collectForm: "NHAN_TRA",
    weightKg: 3.2,
    quantity: 2,
    fare: 145000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(9),
    updatedAt: hoursAgo(6),
    tripCode: "THCM241214-05",
  },
  {
    code: "XE24HCM000103",
    senderPhone: "0909334455",
    senderName: "Trần Bảo Long",
    receiverName: "Phạm Thị Yến",
    receiverPhone: "0966554433",
    fromOffice: "NB",
    toOffice: "GP",
    goodsType: "DE_VO",
    collectForm: "P50_50",
    weightKg: 6.8,
    quantity: 1,
    dimensions: "60x60x40",
    fare: 260000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(10),
    updatedAt: hoursAgo(6),
    paidAmount: 130000,
    tripCode: "THCM241214-05",
  },
  {
    code: "XE24HCM000104",
    senderPhone: "0977111000",
    senderName: "Xưởng may Thanh Tùng",
    receiverName: "Đỗ Văn Sơn",
    receiverPhone: "0933882211",
    fromOffice: "NB",
    toOffice: "GP",
    goodsType: "CONG_KENH",
    collectForm: "GUI_TRA",
    weightKg: 25,
    quantity: 5,
    dimensions: "120x80x60",
    fare: 780000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(11),
    updatedAt: hoursAgo(6),
    paidAmount: 780000,
    tripCode: "THCM241214-05",
  },
  {
    code: "XE24HCM000105",
    senderPhone: "0912550099",
    receiverName: "Vũ Minh Đức",
    receiverPhone: "0944667788",
    fromOffice: "NB",
    toOffice: "GP",
    goodsType: "GIAY_TO",
    collectForm: "GUI_TRA",
    weightKg: 0.5,
    quantity: 1,
    fare: 55000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(9),
    updatedAt: hoursAgo(6),
    paidAmount: 55000,
    tripCode: "THCM241214-05",
  },
  // Trip TDN241214-04: DN → HN
  {
    code: "XE24DN000201",
    senderPhone: "0905667788",
    senderName: "Đặc sản Đà Nẵng",
    receiverName: "Chu Thị Lệ",
    receiverPhone: "0987334455",
    fromOffice: "VT",
    toOffice: "GP",
    goodsType: "THUC_PHAM_KHO",
    collectForm: "GUI_TRA",
    weightKg: 8,
    quantity: 3,
    fare: 210000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(10),
    paidAmount: 210000,
    tripCode: "TDN241214-04",
  },
  {
    code: "XE24DN000202",
    senderPhone: "0935224466",
    receiverName: "Hoàng Thị Mai",
    receiverPhone: "0912778899",
    fromOffice: "VT",
    toOffice: "GP",
    address: "45 Xuân Thủy, Cầu Giấy, Hà Nội",
    homeDelivery: true,
    deliveryFee: 25000,
    goodsType: "DE_VO",
    collectForm: "NHAN_TRA",
    weightKg: 2.5,
    quantity: 1,
    fare: 120000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(13),
    updatedAt: hoursAgo(10),
    tripCode: "TDN241214-04",
  },
  {
    code: "XE24DN000203",
    senderPhone: "0906445533",
    senderName: "Nguyễn Bá Tùng",
    receiverName: "Lý Quốc Việt",
    receiverPhone: "0977665544",
    fromOffice: "VT",
    toOffice: "GP",
    goodsType: "DIEN_TU",
    collectForm: "GUI_TRA",
    weightKg: 4.2,
    quantity: 2,
    fare: 175000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(11),
    updatedAt: hoursAgo(10),
    paidAmount: 175000,
    tripCode: "TDN241214-04",
  },
  // Trip THCM241214-06: HCM → DN
  {
    code: "XE24HCM000301",
    senderPhone: "0908112244",
    senderName: "Shop mỹ phẩm Lan Anh",
    receiverName: "Trần Thị Ngọc",
    receiverPhone: "0905998877",
    fromOffice: "NB",
    toOffice: "VT",
    goodsType: "DE_VO",
    collectForm: "GUI_TRA",
    weightKg: 1.8,
    quantity: 6,
    fare: 165000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(16),
    updatedAt: hoursAgo(14),
    paidAmount: 165000,
    tripCode: "THCM241214-06",
  },
  {
    code: "XE24HCM000302",
    senderPhone: "0931447788",
    receiverName: "Phan Văn Tài",
    receiverPhone: "0906443322",
    fromOffice: "NB",
    toOffice: "VT",
    goodsType: "CONG_KENH",
    collectForm: "P30_70",
    weightKg: 45,
    quantity: 2,
    dimensions: "150x100x80",
    fare: 950000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(15),
    updatedAt: hoursAgo(14),
    paidAmount: 285000,
    tripCode: "THCM241214-06",
  },
  {
    code: "XE24HCM000303",
    senderPhone: "0967335522",
    senderName: "Kho HCM 3",
    receiverName: "Đỗ Thị Hà",
    receiverPhone: "0935112233",
    fromOffice: "NB",
    toOffice: "VT",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 5,
    quantity: 3,
    fare: 130000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(15),
    updatedAt: hoursAgo(14),
    paidAmount: 130000,
    tripCode: "THCM241214-06",
  },
  {
    code: "XE24HCM000304",
    senderPhone: "0918776655",
    receiverName: "Nguyễn Tuấn Anh",
    receiverPhone: "0905332211",
    fromOffice: "NB",
    toOffice: "VT",
    goodsType: "GIAY_TO",
    collectForm: "GUI_TRA",
    weightKg: 0.2,
    quantity: 1,
    fare: 40000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(16),
    updatedAt: hoursAgo(14),
    paidAmount: 40000,
    tripCode: "THCM241214-06",
  },
  // Trip TCT241214-02: CT → HCM
  {
    code: "XE24CT000021",
    senderPhone: "0939221100",
    senderName: "Nông sản Cần Thơ",
    receiverName: "Lâm Văn Bình",
    receiverPhone: "0908776633",
    fromOffice: "TB",
    toOffice: "NB",
    goodsType: "THUC_PHAM_KHO",
    collectForm: "GUI_TRA",
    weightKg: 30,
    quantity: 10,
    fare: 380000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(3),
    paidAmount: 380000,
    tripCode: "TCT241214-02",
  },
  {
    code: "XE24CT000022",
    senderPhone: "0919332244",
    receiverName: "Trịnh Thu Trang",
    receiverPhone: "0977554433",
    fromOffice: "TB",
    toOffice: "NB",
    address: "225 Điện Biên Phủ, Q.3, HCM",
    homeDelivery: true,
    deliveryFee: 30000,
    goodsType: "THUONG",
    collectForm: "NHAN_TRA",
    weightKg: 4,
    quantity: 2,
    fare: 95000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(3),
    tripCode: "TCT241214-02",
  },
  // Trip THP241214-07: HP → HN
  {
    code: "XE24HP000031",
    senderPhone: "0904556677",
    senderName: "Hải sản Hải Phòng",
    receiverName: "Nguyễn Văn Đông",
    receiverPhone: "0912443355",
    fromOffice: "ND",
    toOffice: "GP",
    goodsType: "DE_VO",
    collectForm: "GUI_TRA",
    weightKg: 15,
    quantity: 8,
    dimensions: "60x40x40",
    fare: 240000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(2),
    paidAmount: 240000,
    tripCode: "THP241214-07",
  },
  {
    code: "XE24HP000032",
    senderPhone: "0966223344",
    receiverName: "Đào Thị Kim",
    receiverPhone: "0987112233",
    fromOffice: "ND",
    toOffice: "GP",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 2,
    quantity: 1,
    fare: 65000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(2),
    paidAmount: 65000,
    tripCode: "THP241214-07",
  },
  // Trip THN241214-08: HN → CT
  {
    code: "XE24HN000401",
    senderPhone: "0987554433",
    senderName: "Cty Dược Bảo An",
    receiverName: "Trương Văn Nhân",
    receiverPhone: "0939887766",
    fromOffice: "GP",
    toOffice: "TB",
    goodsType: "DIEN_TU",
    collectForm: "P70_30",
    weightKg: 9,
    quantity: 4,
    fare: 340000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(20),
    updatedAt: hoursAgo(18),
    paidAmount: 238000,
    tripCode: "THN241214-08",
  },
  {
    code: "XE24HN000402",
    senderPhone: "0913224455",
    receiverName: "Huỳnh Thị Ngân",
    receiverPhone: "0918776644",
    fromOffice: "GP",
    toOffice: "TB",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 3.5,
    quantity: 2,
    fare: 125000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(19),
    updatedAt: hoursAgo(18),
    paidAmount: 125000,
    tripCode: "THN241214-08",
  },
  {
    code: "XE24HN000403",
    senderPhone: "0977889900",
    senderName: "Shop thời trang Bella",
    receiverName: "Kiều Thị Vy",
    receiverPhone: "0908114455",
    fromOffice: "GP",
    toOffice: "TB",
    address: "78 Nguyễn Văn Cừ, Ninh Kiều, Cần Thơ",
    homeDelivery: true,
    deliveryFee: 25000,
    goodsType: "THUONG",
    collectForm: "NHAN_TRA",
    weightKg: 1.2,
    quantity: 3,
    fare: 95000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(19),
    updatedAt: hoursAgo(18),
    tripCode: "THN241214-08",
  },
  // ===== Đơn tỉnh↔tỉnh qua hub HN (2 chặng, cùng 1 mã đơn) =====
  // Đơn 1: đang chạy chặng 1 (HP → HN), chặng 2 (HN → DN) đang chờ trung chuyển
  {
    code: "XE24HP000701",
    senderPhone: "0912345001",
    senderName: "Nguyễn Văn Toàn (HP)",
    receiverName: "Trần Thị Bích (ĐN)",
    receiverPhone: "0987654001",
    fromOffice: "ND",
    toOffice: "GP",
    hubOffice: "GP",
    finalToOffice: "VT",
    currentLegIndex: 0,
    legs: [
      { index: 0, fromOffice: "ND", toOffice: "GP", status: "IN_TRANSIT", tripCode: "THP241214-11", departedAt: hoursAgo(4) },
      { index: 1, fromOffice: "GP", toOffice: "VT", status: "PENDING" },
    ],
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 3.2,
    quantity: 2,
    fare: 210000,
    status: "IN_TRANSIT",
    createdAt: hoursAgo(6),
    updatedAt: hoursAgo(4),
    paidAmount: 210000,
    tripCode: "THP241214-11",
  },
  // Đơn 2: đã đến hub HN, đang chờ gán xe cho chặng 2 (HN → HCM) — sẽ hiện lại ở "Đơn chờ gán xe" của HN
  {
    code: "XE24DN000702",
    senderPhone: "0912345002",
    senderName: "Lê Thanh Hà (ĐN)",
    receiverName: "Phạm Minh Đức (HCM)",
    receiverPhone: "0987654002",
    fromOffice: "GP",
    toOffice: "NB",
    hubOffice: "GP",
    finalToOffice: "NB",
    currentLegIndex: 1,
    legs: [
      { index: 0, fromOffice: "VT", toOffice: "GP", status: "AT_HUB", tripCode: "TDN241213-05", arrivedAt: hoursAgo(2) },
      { index: 1, fromOffice: "GP", toOffice: "NB", status: "PENDING" },
    ],
    goodsType: "DIEN_TU",
    collectForm: "NHAN_TRA",
    weightKg: 5.5,
    quantity: 1,
    fare: 340000,
    status: "CONFIRMED",
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(2),
  },
  // Đơn 3: đã hoàn tất cả 2 chặng, đã đến VP đích cuối HP
  {
    code: "XE24DN000703",
    senderPhone: "0912345003",
    senderName: "Ngô Thị Linh (ĐN)",
    receiverName: "Vũ Quang Huy (HP)",
    receiverPhone: "0987654003",
    fromOffice: "GP",
    toOffice: "ND",
    hubOffice: "GP",
    finalToOffice: "ND",
    currentLegIndex: 1,
    legs: [
      { index: 0, fromOffice: "VT", toOffice: "GP", status: "AT_HUB", arrivedAt: daysAgo(1) },
      { index: 1, fromOffice: "GP", toOffice: "ND", status: "AT_DEST", tripCode: "THN241214-09", arrivedAt: hoursAgo(3) },
    ],
    goodsType: "GIAY_TO",
    collectForm: "GUI_TRA",
    weightKg: 0.8,
    quantity: 1,
    fare: 165000,
    status: "AT_DEST",
    createdAt: daysAgo(2),
    updatedAt: hoursAgo(3),
    paidAmount: 165000,
    shelf: 7,
  },
  // ---- Đơn khách chọn "Lấy tận nơi" → chờ nhân viên đi lấy & nhập kho ----
  {
    code: "XE24HN000901",
    senderPhone: "0913222444",
    senderName: "Shop Mai Anh",
    receiverName: "Phạm Quốc Đạt",
    receiverPhone: "0904111222",
    fromOffice: "GP",
    toOffice: "VT",
    goodsType: "THUONG",
    collectForm: "NHAN_TRA",
    weightKg: 6.5,
    quantity: 3,
    fare: 145000,
    status: "CONFIRMED",
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
    homePickup: true,
    pickupAddress: "52 Nguyễn Trãi, Thanh Xuân, Hà Nội",
    pickupStaff: "Nguyễn Văn Hùng",
    pickupFee: 30000,
  },
  {
    code: "XE24HN000902",
    senderPhone: "0966777888",
    senderName: "Công ty TNHH Bình Minh",
    receiverName: "Vũ Thị Lan",
    receiverPhone: "0977333555",
    fromOffice: "GP",
    toOffice: "NB",
    goodsType: "DE_VO",
    collectForm: "GUI_TRA",
    weightKg: 12,
    quantity: 5,
    fare: 320000,
    status: "CONFIRMED",
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
    homePickup: true,
    pickupAddress: "KCN Sài Đồng, Long Biên, Hà Nội",
    pickupStaff: "Trần Minh Tuấn",
    pickupFee: 50000,
    paidAmount: 320000,
  },
  {
    code: "XE24HP000903",
    senderPhone: "0932555111",
    senderName: "Kho Hải An",
    receiverName: "Đỗ Văn Sơn",
    receiverPhone: "0918444222",
    fromOffice: "ND",
    toOffice: "GP",
    goodsType: "THUONG",
    collectForm: "NHAN_TRA",
    weightKg: 3.2,
    quantity: 1,
    fare: 85000,
    status: "CONFIRMED",
    createdAt: hoursAgo(20),
    updatedAt: hoursAgo(20),
    homePickup: true,
    pickupAddress: "18 Lê Hồng Phong, Ngô Quyền, Hải Phòng",
    pickupFee: 25000,
  },
  {
    code: "XE24DN000904",
    senderPhone: "0905888333",
    senderName: "Anh Khoa",
    receiverName: "Lý Thu Hà",
    receiverPhone: "0946222888",
    fromOffice: "VT",
    toOffice: "GP",
    goodsType: "GIAY_TO",
    collectForm: "GUI_TRA",
    weightKg: 0.5,
    quantity: 1,
    fare: 60000,
    status: "CONFIRMED",
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(8),
    homePickup: true,
    pickupAddress: "230 Nguyễn Văn Linh, Hải Châu, Đà Nẵng",
    pickupStaff: "Hồ Anh Khoa",
    pickupFee: 20000,
    pickedUpAt: hoursAgo(8),
  },
  {
    code: "XE24HN000905",
    senderPhone: "0912345001",
    senderName: "Chị Mai",
    receiverName: "Nguyễn Đức Long",
    receiverPhone: "0987001122",
    fromOffice: "GP",
    toOffice: "ND",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 2.4,
    quantity: 2,
    fare: 70000,
    status: "CONFIRMED",
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    qrDropOff: true,
  },
  {
    code: "XE24HN000906",
    senderPhone: "0912345002",
    senderName: "Shop Hoa Tươi",
    receiverName: "Trần Bích Ngọc",
    receiverPhone: "0987003344",
    fromOffice: "GP",
    toOffice: "TB",
    goodsType: "DE_VO",
    collectForm: "NHAN_TRA",
    weightKg: 1.2,
    quantity: 1,
    fare: 55000,
    status: "CONFIRMED",
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    qrDropOff: true,
  },
  {
    code: "XE24HP000907",
    senderPhone: "0932555999",
    senderName: "Anh Dũng",
    receiverName: "Phạm Thu Trang",
    receiverPhone: "0918777333",
    fromOffice: "ND",
    toOffice: "GP",
    goodsType: "THUONG",
    collectForm: "GUI_TRA",
    weightKg: 4,
    quantity: 2,
    fare: 95000,
    status: "CONFIRMED",
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(4),
    homePickup: true,
    pickupAddress: "27 Lạch Tray, Ngô Quyền, Hải Phòng",
    pickupStaff: "Lê Quang Vinh",
    pickingAt: hoursAgo(1),
    pickupFee: 25000,
  },
];

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

export const MOCK_TRIPS: Trip[] = [
  {
    code: "THN241214-01",
    bks: "29H-123.45",
    driver: "Nguyễn Văn A",
    route: "GP → NB",
    departAt: daysAgo(0),
    status: "DEPARTED",
    office: "GP",
    scanned: 42,
    loaded: 42,
  },
  {
    code: "THN241214-02",
    bks: "51C-678.90",
    driver: "Trần Văn B",
    route: "GP → VT",
    departAt: daysAgo(0),
    status: "LOADING",
    office: "GP",
    scanned: 15,
    loaded: 20,
  },
  {
    code: "TDN241213-01",
    bks: "43A-111.22",
    driver: "Lê Văn C",
    route: "VT → NB",
    departAt: daysAgo(1),
    status: "CLOSED",
    office: "VT",
    scanned: 28,
    loaded: 28,
  },
  {
    code: "THN241213-03",
    bks: "29H-123.45",
    driver: "Phạm Văn D",
    route: "GP → ND",
    departAt: daysAgo(1),
    status: "UNLOADING",
    office: "ND",
    scanned: 33,
    loaded: 35,
  },
  // ---- Đang trên đường (DEPARTED) — dùng cho màn "Hàng sắp về" ----
  {
    code: "THCM241214-05",
    bks: "51G-234.56",
    driver: "Hoàng Minh E",
    route: "NB → GP",
    departAt: hoursAgo(6),
    status: "DEPARTED",
    office: "NB",
    scanned: 58,
    loaded: 58,
  },
  {
    code: "TDN241214-04",
    bks: "43B-987.65",
    driver: "Đặng Quốc F",
    route: "VT → GP",
    departAt: hoursAgo(10),
    status: "DEPARTED",
    office: "VT",
    scanned: 24,
    loaded: 24,
  },
  {
    code: "THCM241214-06",
    bks: "65D-159.75",
    driver: "Bùi Thanh G",
    route: "HCM → DN",
    departAt: hoursAgo(14),
    status: "DEPARTED",
    office: "NB",
    scanned: 36,
    loaded: 36,
  },
  {
    code: "TCT241214-02",
    bks: "30F-456.78",
    driver: "Ngô Hữu H",
    route: "TB → NB",
    departAt: hoursAgo(3),
    status: "DEPARTED",
    office: "TB",
    scanned: 18,
    loaded: 18,
  },
  {
    code: "THP241214-07",
    bks: "15C-321.54",
    driver: "Nguyễn Văn A",
    route: "ND → GP",
    departAt: hoursAgo(2),
    status: "DEPARTED",
    office: "ND",
    scanned: 12,
    loaded: 12,
  },
  {
    code: "THN241214-08",
    bks: "29H-123.45",
    driver: "Trần Văn B",
    route: "GP → TB",
    departAt: hoursAgo(18),
    status: "DEPARTED",
    office: "GP",
    scanned: 22,
    loaded: 22,
  },
  // ===== Xe khả dụng trong ngày (chờ xếp hàng) =====
  {
    code: "XE-GP-0600",
    bks: "29H-101.11",
    driver: "Nguyễn Văn A",
    route: "GP → NB",
    departAt: todayAt(6, 0),
    status: "LOADING",
    office: "GP",
    scanned: 18,
    loaded: 12,
  },
  {
    code: "XE-GP-0800",
    bks: "29B-202.22",
    driver: "Trần Văn B",
    route: "GP → ND",
    departAt: todayAt(8, 0),
    status: "LOADING",
    office: "GP",
    scanned: 24,
    loaded: 20,
  },
  {
    code: "XE-GP-1000",
    bks: "29C-303.33",
    driver: "Lê Văn C",
    route: "GP → TB",
    departAt: todayAt(10, 0),
    status: "CREATED",
    office: "GP",
    scanned: 0,
    loaded: 0,
  },
  {
    code: "XE-GP-1200",
    bks: "29D-404.44",
    driver: "Phạm Văn D",
    route: "GP → VT",
    departAt: todayAt(12, 0),
    status: "CREATED",
    office: "GP",
    scanned: 6,
    loaded: 4,
  },
  {
    code: "XE-GP-1400",
    bks: "29E-505.55",
    driver: "Hoàng Minh E",
    route: "GP → PT",
    departAt: todayAt(14, 0),
    status: "LOADING",
    office: "GP",
    scanned: 15,
    loaded: 9,
  },
  {
    code: "XE-GP-1600",
    bks: "29F-606.66",
    driver: "Đặng Quốc F",
    route: "GP → YB1",
    departAt: todayAt(16, 0),
    status: "CREATED",
    office: "GP",
    scanned: 0,
    loaded: 0,
  },
  {
    code: "XE-HD-1700",
    bks: "30A-707.77",
    driver: "Bùi Thanh G",
    route: "HD → NB",
    departAt: todayAt(17, 30),
    status: "LOADING",
    office: "HD",
    scanned: 11,
    loaded: 7,
  },
  {
    code: "XE-NGH-1800",
    bks: "30B-808.88",
    driver: "Ngô Hữu H",
    route: "NGH → ND",
    departAt: todayAt(18, 0),
    status: "CREATED",
    office: "NGH",
    scanned: 3,
    loaded: 3,
  },
  {
    code: "XE-GP-2000",
    bks: "29G-909.99",
    driver: "Vũ Đình K",
    route: "GP → YB3",
    departAt: todayAt(20, 0),
    status: "CREATED",
    office: "GP",
    scanned: 0,
    loaded: 0,
  },
  {
    code: "XE-GP-2200",
    bks: "29H-121.21",
    driver: "Trịnh Văn L",
    route: "GP → SHN",
    departAt: todayAt(22, 0),
    status: "LOADING",
    office: "GP",
    scanned: 9,
    loaded: 5,
  },
];

export const MOCK_PRICING = [
  { route: "GP → NB", tier: "0-2kg", unit: 65000, surcharge: 0 },
  { route: "GP → NB", tier: "2-5kg", unit: 32000, surcharge: 5000 },
  { route: "GP → NB", tier: "5-10kg", unit: 28000, surcharge: 10000 },
  { route: "GP → VT", tier: "0-2kg", unit: 45000, surcharge: 0 },
  { route: "GP → VT", tier: "2-5kg", unit: 22000, surcharge: 5000 },
  { route: "NB → TB", tier: "0-2kg", unit: 30000, surcharge: 0 },
];

export const MOCK_USERS = [
  { username: "admin", role: "AD" as Role, office: "ALL", active: true },
  { username: "quay.hn", role: "Q" as Role, office: "GP", active: true },
  { username: "quay.hcm", role: "Q" as Role, office: "NB", active: true },
  { username: "bx.hn", role: "BX" as Role, office: "GP", active: true },
  { username: "giao.hn.01", role: "G" as Role, office: "GP", active: true },
  { username: "kt.hn", role: "KT" as Role, office: "GP", active: true },
  { username: "tcn.hn", role: "TCN" as Role, office: "GP", active: true },
  { username: "dh", role: "DH" as Role, office: "ALL", active: true },
  { username: "bl", role: "BL" as Role, office: "ALL", active: true },
];

export function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + "₫";
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

export function officeName(code: string) {
  return OFFICES.find((o) => o.code === code)?.name ?? code;
}
