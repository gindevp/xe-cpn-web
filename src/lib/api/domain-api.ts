import { apiRequest } from "./client";
import type { LegStatus, OrderStatus, TripStatus } from "../mock-data";
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
  currentTripCode?: string;
  shelfNumber?: number;
  note?: string;
  pickingAt?: string;
  pickedUpAt?: string;
  pickupStaffUsername?: string;
  partnerCode?: string;
  partnerFeeAmount?: number;
  currentLegIndex?: number;
  codAmount?: number;
  codFeeAmount?: number;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  routeLabel?: string;
  itineraryLabel?: string;
  codExportedAt?: string;
  vehiclePlate?: string;
  driverName?: string;
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
  events?: Array<{ at: string; action: string; detail?: string; by?: string }>;
  podPhotos?: string[];
  cancelReason?: string;
  receiverActualName?: string;
  receiverActualPhone?: string;
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
  assignments?: Array<{ orderCode: string; assignmentStatus: string; scannedAt?: string; loadedAt?: string }>;
};

type ListPage<T> = { content: T[]; page: number; size: number; totalElements: number };

export function mapOrder(dto: OrderSummary): OrderX {
  const now = new Date().toISOString();
  const eventTimes = (dto.events ?? []).map((e) => e.at).filter(Boolean).sort();
  const createdAt = dto.createdAt ?? eventTimes[0] ?? dto.pickingAt ?? dto.pickedUpAt ?? now;
  const updatedAt = dto.updatedAt ?? eventTimes.at(-1) ?? dto.pickedUpAt ?? dto.pickingAt ?? createdAt;
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
    address: undefined,
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
    paidAmount: dto.paidAmount != null ? Number(dto.paidAmount) : 0,
    shelf: dto.shelfNumber,
    // Don't keep warehouse stage after terminal status — otherwise "Nhập kho giao" still lists them.
    stage: ["DELIVERED", "CANCELLED", "RETURNED", "RETURNING"].includes(dto.status)
      ? undefined
      : (dto.forwardStage as any),
    returnStage: dto.returnStage as any,
    tripCode: dto.currentTripCode,
    pickingAt: dto.pickingAt,
    pickedUpAt: dto.pickedUpAt,
    pickupStaff: dto.pickupStaffUsername,
    partnerCode: dto.partnerCode,
    partnerFee: dto.partnerFeeAmount != null ? Number(dto.partnerFeeAmount) : undefined,
    codAmount: dto.codAmount != null ? Number(dto.codAmount) : undefined,
    codFee: dto.codFeeAmount != null ? Number(dto.codFeeAmount) : undefined,
    bankName: dto.bankName,
    bankAccountNo: dto.bankAccountNo,
    bankAccountName: dto.bankAccountName,
    route: dto.routeLabel,
    itinerary: dto.itineraryLabel,
    codExportedAt: dto.codExportedAt,
    vehiclePlate: dto.vehiclePlate,
    driverName: dto.driverName,
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
    podPhotos: (dto.podPhotos ?? []).map((url, i) => ({
      at: now,
      by: "system",
      url: typeof url === "string" ? url : `pod-${i + 1}`,
    })),
    events: (dto.events ?? []).map((e) => ({
      at: typeof e.at === "string" ? e.at : new Date(e.at as any).toISOString(),
      by: e.by ?? "system",
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
    .filter((a) => a.scannedAt || a.assignmentStatus === "LOADED" || a.assignmentStatus === "SCANNED")
    .map((a) => a.orderCode);
  const loaded = (dto.assignments ?? []).filter((a) => a.assignmentStatus === "LOADED").map((a) => a.orderCode);
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

export async function listOrders(params?: {
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
}) {
  const q = new URLSearchParams();
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
  return rows.map(mapOrder);
}

export async function markCodExported(orderCodes: string[]) {
  return apiRequest<{ updated: number }>("/api/orders/cod/mark-exported", {
    method: "POST",
    body: { orderCodes },
  });
}

export async function getOrder(code: string) {
  const dto = await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}`);
  return mapOrder(dto);
}

export async function createDraft(body: Record<string, unknown>) {
  return apiRequest<{ draftCode: string; orderCode: string; status: string; fareAmount: number }>(
    "/api/orders/drafts",
    { method: "POST", auth: false, body },
  );
}

export async function createOrder(body: Record<string, unknown>) {
  return mapOrder(await apiRequest<OrderSummary>("/api/orders", { method: "POST", body }));
}

export async function patchOrder(code: string, body: Record<string, unknown>) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}`, { method: "PATCH", body }),
  );
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
  return mapOrder(await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/pickup-start`, { method: "POST" }));
}

export async function warehouseReceive(code: string) {
  return mapOrder(
    await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/warehouse-receive`, { method: "POST" }),
  );
}

export async function advanceLeg(code: string) {
  return mapOrder(await apiRequest<OrderSummary>(`/api/orders/${encodeURIComponent(code)}/advance-leg`, { method: "POST" }));
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
    fromOfficeCode?: string;
    toOfficeCode?: string;
    receiverName?: string;
    events?: Array<{ at: string; action: string; detail?: string; by?: string }>;
  }>("/api/orders/track", { method: "POST", auth: false, body: { code, phone } });
}

export async function transitionOrderApi(code: string, toStatus: OrderStatus, action: string, detail?: string) {
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
  return apiRequest(`/api/orders/${encodeURIComponent(code)}/assign-shipper`, { method: "POST", body });
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

/** Xe khả dụng từ CRM VTHK (proxy BE). Cửa sổ giờ do BE: now → now+1h. */
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
  const path = tripCode ? `/api/trips/${encodeURIComponent(tripCode)}/scan-in` : "/api/trips/scan-in";
  return apiRequest(path, { method: "POST", body });
}

export async function assignOrdersToTrip(tripCode: string, orderCodes: string[], itineraryLabel?: string) {
  return apiRequest("/api/trips/assign-orders", {
    method: "POST",
    body: { tripCode, orderCodes, ...(itineraryLabel ? { itineraryLabel } : {}) },
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

export async function returnStage(orderCode: string, returnStage: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/return-stage`, {
    method: "POST",
    body: { returnStage },
  });
}

export async function returnComplete(orderCode: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/return-complete`, { method: "POST" });
}

export async function listOrderIssues(orderCode: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/issues`);
}

export async function openIssue(orderCode: string, issueType: string, reason?: string) {
  return apiRequest(`/api/orders/${encodeURIComponent(orderCode)}/issues`, {
    method: "POST",
    body: { issueType, reason },
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

export type OfficeDTO = { id: number; code: string; name: string; isHub?: boolean };
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
export type DriverDTO = { id: number; driverCode: string; fullName: string };
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
  return apiRequest<OfficeDTO[]>("/api/offices?size=100");
}
export async function fetchDrivers() {
  return apiRequest<DriverDTO[]>("/api/drivers?size=100");
}
export async function fetchRoutes() {
  return apiRequest<RouteDTO[]>("/api/routes?size=100");
}
export async function fetchBranches(activeOnly = true) {
  return apiRequest<BranchDTO[]>(`/api/branches?activeOnly=${activeOnly}`);
}
export async function fetchItineraries(opts?: { branchId?: number; activeOnly?: boolean }) {
  const q = new URLSearchParams();
  if (opts?.branchId != null) q.set("branchId", String(opts.branchId));
  q.set("activeOnly", String(opts?.activeOnly ?? true));
  return apiRequest<ItineraryDTO[]>(`/api/itineraries?${q.toString()}`);
}

/** JHipster sometimes returns bare array or page — normalize */
export function asArray<T>(data: T[] | { content?: T[] } | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.content ?? [];
}
