import { ApiError, apiRequest, getApiBase, getToken } from "./client";
import { compactTaxCode, isValidVietnamTaxCode } from "../vn-tax-code";
import type { LegStatus, OrderIssueType, OrderStatus, TripStatus } from "../mock-data";
import type { OrderX, TripX } from "../store";

export type OrderSummary = {
  id?: number;
  orderCode: string;
  draftCode?: string;
  createdAt?: string;
  updatedAt?: string;
  status: OrderStatus;
  forwardStage?: string;
  returnStage?: string;
  senderName?: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  fromOfficeCode?: string;
  toOfficeCode?: string;
  hubOfficeCode?: string;
  finalToOfficeCode?: string;
  goodsType?: string;
  paymentTerm?: string;
  weightKg?: number;
  quantity?: number;
  fareAmount?: number;
  paidAmount?: number;
  pickupFeeAmount?: number;
  deliveryFeeAmount?: number;
  homePickup?: boolean;
  homeDelivery?: boolean;
  qrDropOff?: boolean;
  hasGoodsPhoto?: boolean;
  pickupAddress?: string;
  deliveryAddress?: string;
  currentTripCode?: string;
  shelfNumber?: number;
  note?: string;
  pickingAt?: string;
  pickedUpAt?: string;
  pickupStaffUsername?: string;
  partnerCode?: string;
  partnerFeeAmount?: number;
  partnerOrderId?: string;
  partnerStatus?: string;
  partnerTrackingUrl?: string;
  partnerDriverName?: string;
  partnerDriverPhone?: string;
  partnerPodUrl?: string;
  partnerFailReason?: string;
  partnerUpdatedAt?: string;
  partnerCodAmount?: number;
  partnerCodCollectedAt?: string;
  partnerCodCollectedBy?: string;
  shipperId?: number;
  shipperName?: string;
  shipperPhone?: string;
  currentLegIndex?: number;
  codAmount?: number;
  codFeeAmount?: number;
  goodsFareAmount?: number;
  declaredFeeAmount?: number;
  discountAmount?: number;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  invoiceRequested?: boolean;
  onCredit?: boolean;
  invoiceTaxCode?: string;
  invoiceCompanyName?: string;
  invoiceEmail?: string;
  invoiceCompanyAddress?: string;
  invoiceBuyerName?: string;
  invoiceRefId?: string;
  invoiceStatus?: string;
  invoiceType?: string;
  invoiceTransactionId?: string;
  invoiceNo?: string;
  invoiceSeries?: string;
  invoiceCode?: string;
  invoiceGrossAmount?: number;
  invoiceNetAmount?: number;
  invoiceVatAmount?: number;
  invoiceIssuedAt?: string;
  invoiceError?: string;
  routeLabel?: string;
  itineraryLabel?: string;
  codExportedAt?: string;
  codExportedBy?: string;
  codExportedByName?: string;
  createdBy?: string;
  createdByName?: string;
  createdByRole?: string;
  vehiclePlate?: string;
  driverName?: string;
  /** Giờ xuất phát chuyến hiện tại (trip.departAt). */
  departAt?: string;
  warehouseInAt?: string;
  tripAssignedAt?: string;
  driverSignedAt?: string;
  destWarehouseInAt?: string;
  shipperAssignedAt?: string;
  legs?: Array<{
    index?: number;
    fromOfficeCode?: string;
    toOfficeCode?: string;
    tripCode?: string;
    status?: string;
    departedAt?: string;
    arrivedAt?: string;
  }>;
  failCount?: number;
  events?: Array<{
    at: string;
    action: string;
    detail?: string;
    by?: string;
    byStaffCode?: string | null;
    byName?: string | null;
  }>;
  podPhotos?: string[];
  /** Cùng thứ tự podPhotos. "Nhận" / "Giao", hoặc rỗng. */
  podPhotoCaptions?: string[];
  cancelReason?: string;
  receiverActualName?: string;
  receiverActualPhone?: string;
  /** Open issue on list/detail (BE OrderSummaryDTO). */
  issueType?: string;
  issueReason?: string;
  issueOpenedAt?: string;
  issueOpenedBy?: string;
  issues?: Array<{
    id?: number;
    issueType?: string;
    issueStatus?: string;
    reason?: string;
    openedAt?: string;
    openedByUsername?: string;
    resolvedAt?: string;
    photos?: string[];
  }>;
  currentIssueId?: number;
};

export type TripSummary = {
  id?: number;
  tripCode: string;
  status: TripStatus;
  departAt: string;
  officeCode?: string;
  routeCode?: string;
  routeName?: string;
  itineraryLabel?: string;
  vehiclePlate?: string;
  driverName?: string;
  loadedCount?: number;
  scannedCount?: number;
  assignments?: Array<{
    orderCode: string;
    assignmentStatus: string;
    scannedAt?: string;
    loadedAt?: string;
  }>;
};

type ListPage<T> = { content: T[]; page: number; size: number; totalElements: number };

function mapOpenIssue(dto: OrderSummary): OrderX["issue"] | undefined {
  const fromList =
    dto.issueType &&
    ({
      type: dto.issueType as OrderIssueType,
      reason: dto.issueReason,
      at: dto.issueOpenedAt ?? new Date().toISOString(),
      by: dto.issueOpenedBy ?? "system",
    } as const);
  if (fromList) {
    const fromStageMatch = dto.issueReason?.match(/\|\s*FROM=(WH_IN|DEST_WH_IN)\s*$/);
    return {
      ...fromList,
      fromStage: fromStageMatch?.[1] as "WH_IN" | "DEST_WH_IN" | undefined,
    };
  }
  const open = (dto.issues ?? []).find(
    (i) => i.issueStatus === "OPEN" || (!i.resolvedAt && i.issueType),
  );
  if (!open?.issueType) return undefined;
  const fromStageMatch = open.reason?.match(/\|\s*FROM=(WH_IN|DEST_WH_IN)\s*$/);
  return {
    type: open.issueType as OrderIssueType,
    reason: open.reason,
    at: open.openedAt ?? new Date().toISOString(),
    by: open.openedByUsername ?? "system",
    fromStage: fromStageMatch?.[1] as "WH_IN" | "DEST_WH_IN" | undefined,
    photos: Array.isArray(open.photos) ? open.photos.filter(Boolean) : undefined,
  };
}

export function mapOrder(dto: OrderSummary): OrderX {
  const now = new Date().toISOString();
  const eventTimes = (dto.events ?? [])
    .map((e) => e.at)
    .filter(Boolean)
    .sort();
  const createdAt = dto.createdAt ?? eventTimes[0] ?? dto.pickingAt ?? dto.pickedUpAt ?? now;
  const updatedAt =
    dto.updatedAt ?? eventTimes.at(-1) ?? dto.pickedUpAt ?? dto.pickingAt ?? createdAt;
  return {
    code: dto.orderCode,
    draftCode: dto.draftCode,
    senderPhone: dto.senderPhone,
    senderName: dto.senderName,
    receiverName: dto.receiverName,
    receiverPhone: dto.receiverPhone,
    fromOffice: dto.fromOfficeCode ?? "",
    toOffice: dto.toOfficeCode ?? "",
    hubOffice: dto.hubOfficeCode,
    finalToOffice: dto.finalToOfficeCode,
    address: dto.deliveryAddress,
    pickupAddress: dto.pickupAddress,
    goodsType: dto.goodsType ?? "THUONG",
    collectForm: dto.paymentTerm ?? "GUI_TRA",
    weightKg: dto.weightKg != null ? Number(dto.weightKg) : undefined,
    quantity: dto.quantity,
    fare: Number(dto.fareAmount ?? 0),
    pickupFee: dto.pickupFeeAmount != null ? Number(dto.pickupFeeAmount) : undefined,
    deliveryFee: dto.deliveryFeeAmount != null ? Number(dto.deliveryFeeAmount) : undefined,
    status: dto.status,
    createdAt,
    updatedAt,
    note: dto.note,
    homeDelivery: dto.homeDelivery,
    homePickup: dto.homePickup,
    qrDropOff: dto.qrDropOff,
    hasGoodsPhoto: dto.hasGoodsPhoto,
    paidAmount: dto.paidAmount != null ? Number(dto.paidAmount) : 0,
    shelf: dto.shelfNumber,
    // Don't keep warehouse stage after terminal status — otherwise "Nhập kho giao" still lists them.
    stage: ["DELIVERED", "CANCELLED", "RETURNED"].includes(dto.status)
      ? undefined
      : (dto.forwardStage as any),
    returnStage: dto.returnStage as any,
    tripCode: dto.currentTripCode,
    pickingAt: dto.pickingAt,
    pickedUpAt: dto.pickedUpAt,
    pickupStaff: dto.pickupStaffUsername,
    partnerCode: dto.partnerCode,
    partnerFee: dto.partnerFeeAmount != null ? Number(dto.partnerFeeAmount) : undefined,
    partnerOrderId: dto.partnerOrderId,
    partnerStatus: dto.partnerStatus,
    partnerTrackingUrl: dto.partnerTrackingUrl,
    partnerDriverName: dto.partnerDriverName,
    partnerDriverPhone: dto.partnerDriverPhone,
    partnerPodUrl: dto.partnerPodUrl,
    partnerFailReason: dto.partnerFailReason,
    partnerUpdatedAt: dto.partnerUpdatedAt,
    partnerCodAmount: dto.partnerCodAmount != null ? Number(dto.partnerCodAmount) : undefined,
    partnerCodCollectedAt: dto.partnerCodCollectedAt,
    partnerCodCollectedBy: dto.partnerCodCollectedBy,
    shipperId: dto.shipperId,
    shipperName: dto.shipperName,
    shipperPhone: dto.shipperPhone,
    codAmount: dto.codAmount != null ? Number(dto.codAmount) : undefined,
    codFee: dto.codFeeAmount != null ? Number(dto.codFeeAmount) : undefined,
    goodsFare: dto.goodsFareAmount != null ? Number(dto.goodsFareAmount) : undefined,
    declaredFee: dto.declaredFeeAmount != null ? Number(dto.declaredFeeAmount) : undefined,
    discountAmount: dto.discountAmount != null ? Number(dto.discountAmount) : undefined,
    bankName: dto.bankName,
    bankAccountNo: dto.bankAccountNo,
    bankAccountName: dto.bankAccountName,
    invoiceRequested: dto.invoiceRequested,
    onCredit: dto.onCredit,
    invoiceTaxCode: dto.invoiceTaxCode,
    invoiceCompanyName: dto.invoiceCompanyName,
    invoiceEmail: dto.invoiceEmail,
    invoiceCompanyAddress: dto.invoiceCompanyAddress,
    invoiceBuyerName: dto.invoiceBuyerName,
    invoiceRefId: dto.invoiceRefId,
    invoiceStatus: dto.invoiceStatus,
    invoiceType: dto.invoiceType,
    invoiceTransactionId: dto.invoiceTransactionId,
    invoiceNo: dto.invoiceNo,
    invoiceSeries: dto.invoiceSeries,
    invoiceCode: dto.invoiceCode,
    invoiceGrossAmount: dto.invoiceGrossAmount != null ? Number(dto.invoiceGrossAmount) : undefined,
    invoiceNetAmount: dto.invoiceNetAmount != null ? Number(dto.invoiceNetAmount) : undefined,
    invoiceVatAmount: dto.invoiceVatAmount != null ? Number(dto.invoiceVatAmount) : undefined,
    invoiceIssuedAt: dto.invoiceIssuedAt,
    invoiceError: dto.invoiceError,
    route: dto.routeLabel,
    itinerary: dto.itineraryLabel,
    codExportedAt: dto.codExportedAt,
    codExportedBy: dto.codExportedBy,
    codExportedByName: dto.codExportedByName,
    createdBy: dto.createdBy,
    createdByName: dto.createdByName,
    createdByRole: dto.createdByRole,
    vehiclePlate: dto.vehiclePlate,
    driverName: dto.driverName,
    departAt: dto.departAt,
    warehouseInAt: dto.warehouseInAt,
    tripAssignedAt: dto.tripAssignedAt,
    driverSignedAt: dto.driverSignedAt,
    destWarehouseInAt: dto.destWarehouseInAt,
    shipperAssignedAt: dto.shipperAssignedAt,
    currentLegIndex: dto.currentLegIndex,
    legs: (dto.legs ?? []).map((l) => ({
      index: l.index ?? 0,
      fromOffice: l.fromOfficeCode ?? "",
      toOffice: l.toOfficeCode ?? "",
      tripCode: l.tripCode,
      status: ((l.status as LegStatus) || "PENDING") as LegStatus,
      departedAt: l.departedAt,
      arrivedAt: l.arrivedAt,
    })),
    failCount: dto.failCount,
    receiverActualName: dto.receiverActualName,
    receiverActualPhone: dto.receiverActualPhone,
    cancelReason: dto.cancelReason,
    issue: mapOpenIssue(dto),
    podPhotos: (dto.podPhotos ?? []).map((url, i) => ({
      at: now,
      by: "system",
      url: typeof url === "string" ? url : `pod-${i + 1}`,
      label: dto.podPhotoCaptions?.[i]?.trim() || undefined,
    })),
    events: (dto.events ?? []).map((e) => ({
      at: typeof e.at === "string" ? e.at : new Date(e.at as any).toISOString(),
      by: e.by ?? "system",
      byStaffCode: e.byStaffCode ?? undefined,
      byName: e.byName ?? undefined,
      action: e.action,
      detail: e.detail,
    })),
  } as OrderX;
}

/** Hide office-code arrows like GP → ND; prefer the VTHK tuyến/lộ trình the user picked. */
function displayableTripRoute(dto: TripSummary): string {
  const label = dto.itineraryLabel?.trim();
  if (label) return label;
  const raw = (dto.routeName || dto.routeCode || "").trim();
  if (/^[A-Z0-9]{2,4}\s*[→\-]\s*[A-Z0-9]{2,4}$/.test(raw)) return "";
  return raw;
}

export function mapTrip(dto: TripSummary): TripX {
  const scanned = (dto.assignments ?? [])
    .filter(
      (a) => a.scannedAt || a.assignmentStatus === "LOADED" || a.assignmentStatus === "SCANNED",
    )
    .map((a) => a.orderCode);
  const loaded = (dto.assignments ?? [])
    .filter((a) => a.assignmentStatus === "LOADED")
    .map((a) => a.orderCode);
  return {
    code: dto.tripCode,
    bks: dto.vehiclePlate ?? "",
    driver: dto.driverName ?? "",
    route: displayableTripRoute(dto),
    departAt: dto.departAt,
    status: dto.status,
    office: dto.officeCode ?? "",
    scanned: dto.scannedCount ?? scanned.length,
    loaded: dto.loadedCount ?? loaded.length,
    scannedCodes: scanned,
    loadedCodes: loaded,
    events: [],
  };
}

export type ListOrdersParams = {
  status?: string;
  keyword?: string;
  size?: number;
  page?: number;
  sort?: string;
  fromOfficeCode?: string;
  toOfficeCode?: string;
  receiverOfficeCode?: string;
  paymentTerm?: string;
  createdFrom?: string;
  createdTo?: string;
  routeLabel?: string;
  itineraryLabel?: string;
  codes?: string[];
  /** VP gửi hoặc VP đến hoặc VP nhận. */
  officeCode?: string;
  statuses?: string[];
  /** Đơn chưa kết thúc hoặc cập nhật trong N ngày gần nhất. */
  openOrUpdatedWithinDays?: number;
  /** Khoảng ngày cập nhật (yyyy-MM-dd). */
  updatedFrom?: string;
  updatedTo?: string;
  /** VP thao tác thành công: đơn giao → VP nhận, đơn hoàn → VP gửi. */
  successOfficeCode?: string;
  homeDelivery?: boolean;
  /** Ô tìm đơn: có keyword thì NV xem được đơn mọi VP (danh sách nghiệp vụ vẫn theo VP). */
  searchAllOffices?: boolean;
  /** Đơn chờ duyệt huỷ: mặc định BE ẩn; "only" = chỉ lấy các đơn đó. */
  cancelRequests?: "only" | "include";
  /** Chỉ đơn có thu hộ (tiền COD > 0 hoặc đơn cũ PaymentTerm.COD). */
  codOnly?: boolean;
};

export async function listOrders(params?: ListOrdersParams) {
  return (await listOrdersPage(params)).rows;
}

/** Một trang đơn từ server kèm tổng số dòng khớp bộ lọc. */
export async function listOrdersPage(
  params?: ListOrdersParams,
): Promise<{ rows: OrderX[]; total: number }> {
  const q = new URLSearchParams();
  for (const code of params?.codes ?? []) q.append("codes", code);
  for (const s of params?.statuses ?? []) q.append("statuses", s);
  if (params?.officeCode) q.set("officeCode", params.officeCode);
  if (params?.openOrUpdatedWithinDays != null)
    q.set("openOrUpdatedWithinDays", String(params.openOrUpdatedWithinDays));
  if (params?.updatedFrom) q.set("updatedFrom", params.updatedFrom);
  if (params?.updatedTo) q.set("updatedTo", params.updatedTo);
  if (params?.successOfficeCode) q.set("successOfficeCode", params.successOfficeCode);
  if (params?.homeDelivery != null) q.set("homeDelivery", String(params.homeDelivery));
  if (params?.searchAllOffices) q.set("searchAllOffices", "true");
  if (params?.cancelRequests) q.set("cancelRequests", params.cancelRequests);
  if (params?.codOnly) q.set("codOnly", "true");
  if (params?.status) q.set("status", params.status);
  if (params?.keyword) q.set("keyword", params.keyword);
  if (params?.fromOfficeCode) q.set("fromOfficeCode", params.fromOfficeCode);
  if (params?.toOfficeCode) q.set("toOfficeCode", params.toOfficeCode);
  if (params?.receiverOfficeCode) q.set("receiverOfficeCode", params.receiverOfficeCode);
  if (params?.paymentTerm) q.set("paymentTerm", params.paymentTerm);
  if (params?.createdFrom) q.set("createdFrom", params.createdFrom);
  if (params?.createdTo) q.set("createdTo", params.createdTo);
  if (params?.routeLabel) q.set("routeLabel", params.routeLabel);
  if (params?.itineraryLabel) q.set("itineraryLabel", params.itineraryLabel);
  if (params?.page != null) q.set("page", String(params.page));
  q.set("size", String(params?.size ?? 200));
  q.set("sort", params?.sort ?? "id,desc");
  const page = await apiRequest<ListPage<OrderSummary> | OrderSummary[]>(`/api/orders?${q}`);
  const rows = Array.isArray(page) ? page : (page.content ?? []);
  const total = Array.isArray(page) ? rows.length : (page.totalElements ?? rows.length);
  return { rows: rows.map(mapOrder), total };
}

export async function markCodExported(orderCodes: string[]) {
  return apiRequest<{ updated: number }>("/api/orders/cod/mark-exported", {
    method: "POST",
    body: { orderCodes },
  });
}

/** Giấy đề nghị thanh toán COD (trang HTML theo mẫu BMTT-01) — apiRequest chỉ đọc JSON nên tải bằng fetch. */
export async function fetchCodPaymentRequestHtml(orderCode: string): Promise<string> {
  const base = getApiBase();
  if (!base) throw new ApiError("API base URL not configured", 0);
  const token = getToken();
  const res = await fetch(`${base}/api/orders/cod/payment-request?code=${encodeURIComponent(orderCode)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      const d = JSON.parse(text) as { detail?: string; title?: string };
      msg = d.title || d.detail || msg;
    } catch {
      if (text && text.length < 300) msg = text;
    }
    throw new ApiError(msg, res.status);
  }
  return res.text();
}

export async function getOrder(code: string) {
  const dto = await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}`);
  return mapOrder(dto);
}

/** Ảnh đơn hàng khách gửi lúc tạo đơn; null nếu không có. */
export async function fetchOrderGoodsPhoto(code: string): Promise<string | null> {
  const res = await apiRequest<{ image?: string }>(
    `/api/orders/${encodeURIComponent(code)}/goods-photo`,
  );
  return res?.image || null;
}

/** Public guest create — luôn CONFIRMED + mã thật (không nháp). */
export async function createGuestOrder(body: Record<string, unknown>) {
  return apiRequest<{ draftCode?: string; orderCode: string; status: string; fareAmount: number }>(
    "/api/orders/guest",
    { method: "POST", auth: false, body, timeoutMs: 30000 },
  );
}

/** @deprecated Dùng createGuestOrder — cùng hành vi CONFIRMED. */
export async function createDraft(body: Record<string, unknown>) {
  return createGuestOrder(body);
}

export async function createOrder(body: Record<string, unknown>) {
  return mapOrder(await apiRequest<OrderSummary>("/api/orders", { method: "POST", body }));
}

/** Ghi nhận thanh toán (thu đầu gửi / thu thêm). paymentKind TRUOC = thu trước khi giao. */
export async function addOrderPayment(
  code: string,
  body: { amount: number; method?: string; paymentKind?: string; note?: string },
) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/payments`, {
      method: "POST",
      body: {
        amount: body.amount,
        method: body.method ?? "TM",
        paymentKind: body.paymentKind ?? "TRUOC",
        note: body.note,
      },
    }),
  );
}

export async function patchOrder(code: string, body: Record<string, unknown>) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body,
    }),
  );
}

/** Xuất HĐĐT MISA (đơn DELIVERED) — MISA gửi HĐ về email người mua. */
export async function issueOrderInvoice(
  code: string,
  body: { taxCode: string; companyName: string; address: string; email: string; buyerName?: string },
) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/invoice/issue`, {
      method: "POST",
      body,
    }),
  );
}

/** Lưu / bỏ thông tin xuất hoá đơn (mọi trạng thái, khoá khi đã xuất HĐ). */
export async function saveOrderInvoiceInfo(
  code: string,
  body: {
    requested: boolean;
    taxCode?: string;
    companyName?: string;
    address?: string;
    email?: string;
    buyerName?: string;
  },
) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/invoice/info`, {
      method: "PUT",
      body,
    }),
  );
}

/** Link xem HĐĐT trên MISA (hết hạn sau ~5 phút). */
export type TaxCodeLookupResult = {
  ok: boolean;
  taxCode?: string;
  companyName?: string;
  address?: string | null;
  /** Trạng thái người nộp thuế (chỉ nguồn Xinvoice có), vd "NNT đang hoạt động". */
  status?: string;
  active?: boolean;
  /** Loại người nộp thuế (chỉ nguồn Xinvoice có), vd "Hộ kinh doanh cá thể". */
  orgType?: string;
  code?: string;
  message?: string;
};

/** Tra tên / địa chỉ doanh nghiệp theo MST (BE gọi nguồn công khai, cache 24h). */
export function lookupTaxCode(taxCode: string) {
  return apiRequest<TaxCodeLookupResult>(`/api/tax-codes/${encodeURIComponent(taxCode)}`);
}

/** Một dòng màn Quản lý hoá đơn (BE tính sẵn mốc thanh toán, hạn 3 tiếng, loại HĐ). */
export type InvoiceRow = {
  orderCode: string;
  orderStatus?: string;
  paymentTerm?: string;
  onCredit: boolean;
  payer: "SENDER" | "RECEIVER";
  paidAt?: string;
  deadlineAt?: string;
  fromOfficeCode?: string;
  fromOfficeName?: string;
  toOfficeCode?: string;
  toOfficeName?: string;
  senderName?: string;
  senderPhone?: string;
  receiverName?: string;
  receiverPhone?: string;
  fareAmount?: number;
  paidAmount?: number;
  invoiceAmount?: number;
  invoiceRequested: boolean;
  invoiceTaxCode?: string;
  invoiceCompanyName?: string;
  invoiceStatus?: string;
  invoiceType?: "COMPANY" | "PERSONAL";
  invoiceNo?: string;
  invoiceSeries?: string;
  invoiceIssuedAt?: string;
  invoiceError?: string;
  late: boolean;
  openIssueType?: string | null;
};

/** Đơn có mốc thanh toán trong [from, to] (yyyy-MM-dd, tối đa 62 ngày). */
export function listInvoiceRows(from: string, to: string) {
  return apiRequest<InvoiceRow[]>(
    `/api/invoices?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export type AutoCallCatchUpResult = {
  eligible: string[];
  sent: number;
  scheduled: number;
  skipped: Array<{ orderCode: string; reason: string }>;
};

const CATCH_UP_BATCH = 300;

/** Gọi Auto Call bù cho đơn nhập kho giao chưa gọi được; dryRun = chỉ xem đơn đủ điều kiện. BE nhận tối đa 500 mã/lần → chia đợt. */
export async function autoCallCatchUp(orderCodes: string[], dryRun: boolean) {
  const total: AutoCallCatchUpResult = { eligible: [], sent: 0, scheduled: 0, skipped: [] };
  for (let i = 0; i < orderCodes.length; i += CATCH_UP_BATCH) {
    const r = await apiRequest<AutoCallCatchUpResult>(`/api/auto-calls/catch-up`, {
      method: "POST",
      body: { orderCodes: orderCodes.slice(i, i + CATCH_UP_BATCH), dryRun },
      timeoutMs: 60000,
    });
    total.eligible.push(...r.eligible);
    total.sent += r.sent;
    total.scheduled += r.scheduled;
    total.skipped.push(...r.skipped);
  }
  return total;
}

/** Tích / bỏ tích "đã xuất HĐ cá nhân" — trả kết quả từng mã ("OK" hoặc lý do lỗi). */
export function markInvoicesPersonal(orderCodes: string[], marked: boolean) {
  return apiRequest<Record<string, string>>(`/api/invoices/mark`, {
    method: "POST",
    body: { orderCodes, marked },
  });
}

export type InvoiceBackfillStatus = {
  running: boolean;
  actor?: string;
  startedAt?: string;
  finishedAt?: string;
  total: number;
  done: number;
  results: Record<string, number>;
  failedCodes: string[];
};

/** Xuất bù HĐĐT (chạy nền): DN nếu đơn có yêu cầu kèm MST, còn lại cá nhân. */
export function startInvoiceBackfill(orderCodes: string[]) {
  return apiRequest<InvoiceBackfillStatus>(`/api/invoices/backfill`, {
    method: "POST",
    body: { orderCodes },
  });
}

export function invoiceBackfillStatus() {
  return apiRequest<InvoiceBackfillStatus>(`/api/invoices/backfill`);
}

export type InvoiceBuyerProfile = {
  id?: string;
  phone: string;
  taxCode?: string;
  companyName?: string;
  address?: string;
  email?: string;
  fromOrderCode?: string;
  issuedAt?: string;
};

export type PhoneTaxBody = {
  phone?: string;
  taxCode?: string;
  companyName?: string;
  address?: string;
  email?: string;
  contactName?: string;
};

export type BuyerDirectoryEntry = {
  phone: string;
  name?: string | null;
  profiles: InvoiceBuyerProfile[];
};

/** SĐT và MST đang gắn. q rỗng = các số vừa cập nhật. */
export function listBuyerDirectory(query = "") {
  const q = query.trim();
  const path = q ? `/api/invoices/buyer-directory?q=${encodeURIComponent(q)}` : "/api/invoices/buyer-directory";
  return apiRequest<BuyerDirectoryEntry[]>(path);
}

export function createPhoneTax(body: PhoneTaxBody) {
  return apiRequest<InvoiceBuyerProfile>("/api/invoices/phone-tax", { method: "POST", body });
}

export function updatePhoneTax(id: string, body: PhoneTaxBody) {
  return apiRequest<InvoiceBuyerProfile>(`/api/invoices/phone-tax/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
  });
}

export function deletePhoneTax(id: string) {
  return apiRequest<void>(`/api/invoices/phone-tax/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Tra lại MST khi tự điền. API lỗi thì dùng tên/địa chỉ đã lưu trên hóa đơn đã xuất. */
export async function resolveBuyerCompany(profile: InvoiceBuyerProfile) {
  const tax = compactTaxCode(profile.taxCode);
  if (isValidVietnamTaxCode(tax)) {
    try {
      const found = await lookupTaxCode(tax);
      if (found.ok && found.companyName) {
        return { companyName: found.companyName, address: found.address ?? "" };
      }
    } catch {
      /* giữ thông tin hóa đơn đã xuất */
    }
  }
  return { companyName: profile.companyName ?? "", address: profile.address ?? "" };
}

/** Thông tin HĐ công ty lần gần nhất của SĐT người gửi hoặc người nhận; không có → null. */
export async function invoiceBuyerProfile(phone: string): Promise<InvoiceBuyerProfile | null> {
  const res = await apiRequest<InvoiceBuyerProfile | null | "">(
    `/api/invoices/buyer-profile?phone=${encodeURIComponent(phone)}`,
  );
  return res && typeof res === "object" && res.taxCode ? res : null;
}

/** MST đang gắn với SĐT này (mới nhất trước, tối đa 5). */
export async function invoiceBuyerProfiles(phone: string): Promise<InvoiceBuyerProfile[]> {
  const res = await apiRequest<InvoiceBuyerProfile[] | null>(
    `/api/invoices/buyer-profiles?phone=${encodeURIComponent(phone)}`,
  );
  return Array.isArray(res) ? res.filter((p) => p?.taxCode) : [];
}

export async function orderInvoiceViewLink(code: string) {
  const res = await apiRequest<{ url: string }>(
    `/api/orders/${encodeURIComponent(code)}/invoice/view`,
    {
      method: "POST",
    },
  );
  return res.url;
}

export async function logOrderEventApi(code: string, action: string, detail?: string) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/events`, {
      method: "POST",
      body: { action, detail },
    }),
  );
}

export async function pickupStart(code: string) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/pickup-start`, {
      method: "POST",
    }),
  );
}

export async function warehouseReceive(code: string) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/warehouse-receive`, {
      method: "POST",
    }),
  );
}

export async function advanceLeg(code: string) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/advance-leg`, {
      method: "POST",
    }),
  );
}

/** BE PodRequest.photos — data-URL JPEG từ app (LONGTEXT). */
export function compactPodPhotos(photos: string[]): string[] {
  return photos.slice(0, 3).map((p) => (p.length > 1_500_000 ? p.slice(0, 1_500_000) : p));
}

export async function trackOrder(code: string, phone: string) {
  return apiRequest<{
    found: boolean;
    orderCode?: string;
    draftCode?: string;
    status?: OrderStatus;
    /** Tên tab vận hành (Chờ lấy hàng / Nhập kho gửi / …). */
    statusLabel?: string;
    fromOfficeCode?: string;
    toOfficeCode?: string;
    receiverName?: string;
    receiverPhone?: string;
    deliveryAddress?: string;
    goodsType?: string;
    note?: string;
    homeDelivery?: boolean;
    homePickup?: boolean;
    fareAmount?: number;
    goodsFareAmount?: number;
    deliveryFeeAmount?: number;
    pickupFeeAmount?: number;
    events?: Array<{ at: string; action: string }>;
    fromOfficeName?: string;
    toOfficeName?: string;
    routeLabel?: string;
    itineraryLabel?: string;
    journey?: Array<{ key: string; label: string; at?: string | null }>;
    invoiceState?: "NONE" | "REQUESTED" | "ISSUED" | "OFFICE";
    invoiceNo?: string;
  }>("/api/orders/track", { method: "POST", auth: false, body: { code, phone } });
}

/** Trang tra cứu: người trả cước tra MST (xác thực bằng mã đơn + 4 số cuối SĐT). */
/** Trang khách tạo đơn: tên người gửi ở đơn gần nhất của SĐT (chỉ tên, BE giới hạn theo IP). */
export function guestSenderName(phone: string) {
  return apiRequest<{ found: boolean; name?: string }>("/api/orders/guest/sender-name", {
    method: "POST",
    auth: false,
    body: { phone },
  });
}

export function trackInvoiceTaxLookup(code: string, phone: string, taxCode: string) {
  return apiRequest<TaxCodeLookupResult>("/api/orders/track/invoice/tax-lookup", {
    method: "POST",
    auth: false,
    body: { code, phone, taxCode },
  });
}

/** Trang tra cứu: khách yêu cầu HĐ công ty — SAVED (tự xuất sau) / ISSUED / FAILED. */
export function trackInvoiceSubmit(code: string, phone: string, taxCode: string, email: string) {
  return apiRequest<{ action: "SAVED" | "ISSUED" | "FAILED"; invoiceNo?: string; email?: string; message: string }>(
    "/api/orders/track/invoice",
    { method: "POST", auth: false, body: { code, phone, taxCode, email } },
  );
}

export async function transitionOrderApi(
  code: string,
  toStatus: OrderStatus,
  action: string,
  detail?: string,
) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/transition`, {
    method: "POST",
    body: { toStatus, action, detail },
  });
}

export async function podOrder(code: string, body: Record<string, unknown>) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/pod`, { method: "POST", body });
}

export async function failDelivery(code: string, reason: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/fail-delivery`, {
    method: "POST",
    body: { reason },
  });
}

export async function assignShipper(code: string, body: Record<string, unknown> = {}) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/assign-shipper`, {
    method: "POST",
    body,
  });
}

/** Gọi Ahamove giao tận nơi (đơn đã thu đủ cước, không COD) → OUT_FOR_DELIVERY. */
export async function ahamoveDispatch(
  code: string,
  body: { lat?: number; lng?: number; address?: string; remarks?: string },
) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/ahamove/dispatch`, {
    method: "POST",
    body,
  });
}

/** NV quầy xác nhận đã nhận tiền mặt tài xế Ahamove ứng (ghi khoản thu, người thu = NV). */
export async function ahamoveAdvanceIn(code: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/ahamove/advance-in`, { method: "POST" });
}

/** Trả lại tiền ứng cho tài xế khi giao không được → đơn quay lại còn nợ. */
export async function ahamoveAdvanceRefund(code: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/ahamove/advance-refund`, { method: "POST" });
}

/** Hủy đơn Ahamove khi tài xế chưa lấy hàng → FAILED_DELIVERY. */
export async function ahamoveCancel(code: string, reason?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/ahamove/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export async function listTrips(params?: { officeCode?: string; size?: number; keyword?: string }) {
  const q = new URLSearchParams();
  if (params?.officeCode && params.officeCode !== "ALL") q.set("officeCode", params.officeCode);
  if (params?.keyword) q.set("keyword", params.keyword);
  q.set("size", String(params?.size ?? 100));
  const page = await apiRequest<ListPage<TripSummary>>(`/api/trips?${q}`);
  return (page.content ?? []).map(mapTrip);
}

export async function getTrip(code: string) {
  return mapTrip(await apiRequest<TripSummary>(`/api/trips/${encodeURIComponent(code)}`));
}

export async function createTrip(body: Record<string, unknown>) {
  return mapTrip(await apiRequest<TripSummary>("/api/trips", { method: "POST", body }));
}

export type AvailableTrip = {
  externalTripId: string;
  vehiclePlate?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  routeLabel?: string | null;
  itineraryCode?: string | null;
  timeSlot?: string | null;
  departAt: string;
  endAt?: string | null;
  vehicleType?: string | null;
  seatTotal?: number | null;
  seatAvailable?: number | null;
  usedKg?: number | null;
  usedOrderCount?: number | null;
  assignVehiclePlate?: string | null;
  assignDriverName?: string | null;
};

/** Xe khả dụng từ CRM VTHK (proxy BE). Cửa sổ giờ do BE cố định: now → now+60 phút (VN). */
export async function searchAvailableTrips(params: {
  itineraryCode: string;
  date?: string;
  lfid?: string;
  ltid?: string;
  timeSlot?: string;
}): Promise<AvailableTrip[]> {
  const q = new URLSearchParams();
  q.set("itineraryCode", params.itineraryCode);
  if (params.date) q.set("date", params.date);
  if (params.lfid) q.set("lfid", params.lfid);
  if (params.ltid) q.set("ltid", params.ltid);
  if (params.timeSlot && params.timeSlot !== "all") q.set("timeSlot", params.timeSlot);
  const items = await apiRequest<AvailableTrip[]>(`/api/trips/available?${q}`);
  return (items ?? []).map((t) => ({
    ...t,
    externalTripId: String(t.externalTripId ?? ""),
  }));
}

export async function transitionTripApi(code: string, toStatus: TripStatus) {
  return apiRequest(`/api/trips/${encodeURIComponent(code)}/transition`, {
    method: "POST",
    body: { toStatus },
  });
}

export async function scanOut(tripCode: string, orderCode: string, mode: "ADD" | "REMOVE" = "ADD") {
  return apiRequest(`/api/trips/${encodeURIComponent(tripCode)}/scan-out`, {
    method: "POST",
    body: { orderCode, mode },
  });
}

export async function scanIn(body: Record<string, unknown>, tripCode?: string) {
  const path = tripCode
    ? `/api/trips/${encodeURIComponent(tripCode)}/scan-in`
    : "/api/trips/scan-in";
  return apiRequest(path, { method: "POST", body });
}

export async function assignOrdersToTrip(
  tripCode: string,
  orderCodes: string[],
  itineraryLabel?: string,
  driverName?: string,
) {
  const drv = driverName?.trim();
  return apiRequest("/api/trips/assign-orders", {
    method: "POST",
    body: {
      tripCode,
      orderCodes,
      ...(itineraryLabel ? { itineraryLabel } : {}),
      ...(drv && !/^chưa gán/i.test(drv) ? { driverName: drv } : {}),
    },
  });
}

export async function removeOrderFromTrip(tripCode: string, orderCode: string) {
  return apiRequest(
    `/api/trips/${encodeURIComponent(tripCode)}/scan-out/${encodeURIComponent(orderCode)}`,
    { method: "DELETE" },
  );
}

export async function assignOrderToTrip(orderCode: string, tripCode: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/assign-trip`, {
    method: "POST",
    body: { tripCode },
  });
}

export async function restoreOrder(orderCode: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/restore`, { method: "POST" });
}

export async function returnStart(orderCode: string, reason?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/return-start`, {
    method: "POST",
    body: { reason },
  });
}

/** Admin: huỷ hoàn khi đơn còn ở nhập kho gửi chiều hoàn. */
export async function returnCancel(orderCode: string, reason?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/return-cancel`, {
    method: "POST",
    body: { reason },
  });
}

export async function returnStage(orderCode: string, returnStage: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/return-stage`, {
    method: "POST",
    body: { returnStage },
  });
}

export async function returnComplete(
  orderCode: string,
  body: { photos: string[]; actualRecipientName?: string; actualRecipientPhone?: string },
) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/return-complete`, {
    method: "POST",
    body: {
      photos: compactPodPhotos(body.photos ?? []),
      ...(body.actualRecipientName ? { actualRecipientName: body.actualRecipientName } : {}),
      ...(body.actualRecipientPhone ? { actualRecipientPhone: body.actualRecipientPhone } : {}),
    },
  });
}

export async function listOrderIssues(orderCode: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/issues`);
}

export async function openIssue(
  orderCode: string,
  issueType: string,
  reason?: string,
  photos?: string[],
) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/issues`, {
    method: "POST",
    body: {
      issueType,
      reason,
      photos: photos?.length ? compactPodPhotos(photos) : undefined,
    },
  });
}

export async function approveCancelRequest(orderCode: string, note?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/cancel-request/approve`, {
    method: "POST",
    body: { note },
  });
}

export async function rejectCancelRequest(orderCode: string, note?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/cancel-request/reject`, {
    method: "POST",
    body: { note },
  });
}

export async function resolveIssue(orderCode: string, resolutionNote?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/issues/resolve`, {
    method: "POST",
    body: { resolutionNote },
  });
}

export async function forwardStage(orderCode: string, forwardStage: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/forward-stage`, {
    method: "POST",
    body: { forwardStage },
  });
}

export type OfficeDTO = {
  id: number;
  code: string;
  name: string;
  isHub?: boolean;
  sourceId?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  itineraryPoint?: string | null;
  active?: boolean;
};
export type VehicleDTO = {
  id: number;
  plateNumber: string;
  capacityKg: number;
  vehicleType?: string | null;
  volumeM3?: number | null;
  note?: string | null;
  active?: boolean;
  office?: { id?: number; code?: string; name?: string } | null;
  defaultDriver?: { id?: number; driverCode?: string; fullName?: string } | null;
};

export type VehicleMaster = {
  id: number;
  bks: string;
  capacity: number;
  vehicleType?: string;
  volumeM3?: number;
  note?: string;
  officeCode?: string;
  driverName?: string;
  active: boolean;
};

export function mapVehicleDto(v: VehicleDTO): VehicleMaster {
  return {
    id: v.id,
    bks: v.plateNumber,
    capacity: Number(v.capacityKg) || 0,
    vehicleType: v.vehicleType ?? undefined,
    volumeM3: v.volumeM3 != null ? Number(v.volumeM3) : undefined,
    note: v.note ?? undefined,
    officeCode: v.office?.code,
    driverName: v.defaultDriver?.fullName ?? undefined,
    active: v.active !== false,
  };
}

function vehicleWriteBody(v: {
  id?: number;
  bks: string;
  capacity: number;
  vehicleType?: string;
  volumeM3?: number;
  note?: string;
  officeCode?: string;
  driverName?: string;
  active?: boolean;
}) {
  return {
    ...(v.id != null ? { id: v.id } : {}),
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

export async function fetchVehicles() {
  return apiRequest<VehicleDTO[]>("/api/vehicles?size=100");
}

export async function listVehiclesMaster(): Promise<VehicleMaster[]> {
  const raw = await fetchVehicles();
  return asArray(raw).map(mapVehicleDto);
}

export async function createVehicleApi(input: {
  bks: string;
  capacity: number;
  vehicleType?: string;
  driverName?: string;
  active?: boolean;
}): Promise<VehicleMaster> {
  const saved = await apiRequest<VehicleDTO>("/api/vehicles", {
    method: "POST",
    body: vehicleWriteBody(input),
  });
  return mapVehicleDto(saved);
}

export async function updateVehicleApi(
  id: number,
  input: {
    bks: string;
    capacity: number;
    vehicleType?: string;
    driverName?: string;
    active?: boolean;
  },
): Promise<VehicleMaster> {
  const saved = await apiRequest<VehicleDTO>(`/api/vehicles/${id}`, {
    method: "PUT",
    body: vehicleWriteBody({ ...input, id }),
  });
  return mapVehicleDto(saved);
}

export async function deleteVehicleApi(id: number): Promise<void> {
  await apiRequest(`/api/vehicles/${id}`, { method: "DELETE" });
}

/** Shipper nội bộ (Danh mục). busyCount = số đơn Đang giao shipper đang giữ. */
export type ShipperDTO = {
  id: number;
  fullName: string;
  phone?: string | null;
  officeCode?: string | null;
  officeName?: string | null;
  active?: boolean;
  note?: string | null;
  busyCount?: number;
};

export type ShipperInput = {
  fullName: string;
  phone?: string;
  officeCode: string;
  note?: string;
  active?: boolean;
};

export async function listShippers(opts: { officeCode?: string; includeInactive?: boolean } = {}) {
  const q = new URLSearchParams();
  if (opts.officeCode) q.set("officeCode", opts.officeCode);
  if (opts.includeInactive) q.set("includeInactive", "true");
  const qs = q.toString();
  return asArray(await apiRequest<ShipperDTO[]>(`/api/shippers${qs ? `?${qs}` : ""}`)) as ShipperDTO[];
}

export async function createShipper(input: ShipperInput) {
  return apiRequest<ShipperDTO>("/api/shippers", { method: "POST", body: input });
}

export async function updateShipper(id: number, input: ShipperInput) {
  return apiRequest<ShipperDTO>(`/api/shippers/${id}`, { method: "PUT", body: input });
}

export async function deactivateShipper(id: number) {
  await apiRequest(`/api/shippers/${id}`, { method: "DELETE" });
}
export type DriverDTO = { id: number; driverCode: string; fullName: string; active?: boolean };
export type RouteDTO = { id: number; code: string; name: string; active?: boolean };
/** Master Tuyến (distinct from office→office Route). */
export type BranchDTO = { id: number; code: string; name: string; active?: boolean };
/** Master Lộ trình under a Branch. */
export type ItineraryDTO = {
  id: number;
  code: string;
  name: string;
  active?: boolean;
  branch?: { id?: number; code?: string; name?: string };
  departurePoint?: string;
  destinationPoint?: string;
  routeDirection?: string;
  price?: number;
};

export async function fetchOffices() {
  return apiRequest<OfficeDTO[]>("/api/offices?size=100", { auth: false });
}
export async function fetchDrivers() {
  return apiRequest<DriverDTO[]>("/api/drivers?size=100");
}
export async function fetchRoutes() {
  return apiRequest<RouteDTO[]>("/api/routes?size=100");
}
export async function fetchBranches(activeOnly = true) {
  return apiRequest<BranchDTO[]>(`/api/branches?activeOnly=${activeOnly}`, { auth: false });
}
export async function fetchItineraries(opts?: { branchId?: number; activeOnly?: boolean }) {
  const q = new URLSearchParams();
  if (opts?.branchId != null) q.set("branchId", String(opts.branchId));
  q.set("activeOnly", String(opts?.activeOnly ?? true));
  return apiRequest<ItineraryDTO[]>(`/api/itineraries?${q.toString()}`, { auth: false });
}

/** JHipster sometimes returns bare array or page — normalize */
export function asArray<T>(data: T[] | { content?: T[] } | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.content ?? [];
}
