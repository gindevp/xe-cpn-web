import { isApiEnabled, setToken } from "./client";
import * as domain from "./domain-api";
import * as fin from "./finance-config-api";
import { useStore } from "../store";
import { foldOfficeKey, officesMatchingPoint, preferredOfficeCodesForPoint, setOfficeDirectory } from "../mock-data";
import { clearRuntimePermissions } from "../rbac";
import { assignedOfficeCode, resolveViewOffice } from "../office-scope";

export async function syncMasterFromApi() {
  if (!isApiEnabled()) return;
  const [officesRaw, vehiclesRaw, driversRaw, routesRaw] = await Promise.all([
    domain.fetchOffices(),
    domain.fetchVehicles().catch(() => []),
    domain.fetchDrivers().catch(() => []),
    domain.fetchRoutes().catch(() => []),
  ]);
  const offices = domain.asArray(officesRaw).map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    isHub: Boolean(o.isHub),
    sourceId: o.sourceId ?? undefined,
    address: o.address ?? undefined,
    latitude: o.latitude != null ? Number(o.latitude) : undefined,
    longitude: o.longitude != null ? Number(o.longitude) : undefined,
  }));
  const vehicles = domain.asArray(vehiclesRaw).map((v) => ({
    id: v.id,
    bks: v.plateNumber,
    capacity: Number(v.capacityKg),
    vehicleType: v.vehicleType ?? undefined,
    volumeM3: v.volumeM3 != null ? Number(v.volumeM3) : undefined,
    note: v.note ?? undefined,
    officeCode: v.office?.code,
    driverName: v.defaultDriver?.fullName,
    active: v.active !== false,
  }));
  const drivers = domain.asArray(driversRaw).map((d) => d.fullName);
  const routes = domain
    .asArray(routesRaw)
    .filter((r) => r.active !== false)
    .map((r) => r.name || r.code);
  setOfficeDirectory(offices);
  useStore.setState({
    offices,
    vehicles,
    drivers,
    routes,
  });
  await syncStaffFromApi().catch(() => undefined);
}

export async function syncStaffFromApi() {
  if (!isApiEnabled()) return;
  const { listStaffUsers } = await import("./staff-admin-api");
  const rows = await listStaffUsers();
  if (!Array.isArray(rows) || !rows.length) return;
  useStore.setState({
    users: rows.map((r) => ({
      username: r.username,
      role: (r.roleCode as any) || "DH",
      office: r.officeCode || "",
      officeId: r.officeId ?? undefined,
      active: r.active !== false,
      roleGroup: r.roleGroupCode || undefined,
    })),
  });
}

export async function syncOrdersFromApi() {
  if (!isApiEnabled()) return;
  const st = useStore.getState();
  const officeCode = assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice));
  const query = { size: 500, sort: "id,desc" as const };

  let remote: Awaited<ReturnType<typeof domain.listOrders>>;
  if (!officeCode) {
    remote = await domain.listOrders(query);
  } else {
    // VP vừa gửi vừa nhận — không lọc chỉ fromOffice (quay.hn/GP sẽ mất hết đơn đến).
    // inbound: ưu tiên receiverOffice (finalTo || to) để khớp tab Nhập kho giao / Đang giao.
    const [outbound, inboundTo, inboundReceiver] = await Promise.all([
      domain.listOrders({ ...query, fromOfficeCode: officeCode }),
      domain.listOrders({ ...query, toOfficeCode: officeCode }),
      domain.listOrders({ ...query, receiverOfficeCode: officeCode }),
    ]);
    const byCode = new Map<string, (typeof outbound)[number]>();
    for (const row of [...outbound, ...inboundTo, ...inboundReceiver]) {
      if (row.code) byCode.set(row.code, row);
    }
    remote = [...byCode.values()];
  }

  // Merge — không replace toàn bộ: tránh poll đè mất chuyển stage/returnStage mới local.
  useStore.setState((s) => {
    const byCode = new Map(s.orders.map((o) => [o.code, o]));
    for (const r of remote) {
      if (!r.code) continue;
      const prev = byCode.get(r.code);
      if (!prev) {
        byCode.set(r.code, r);
        continue;
      }
      const localT = Date.parse(prev.updatedAt || "") || 0;
      const remoteT = Date.parse(r.updatedAt || "") || 0;
      if (localT > remoteT) {
        // Optimistic local còn mới hơn BE — giữ status/stage/returnStage local.
        byCode.set(r.code, {
          ...r,
          ...prev,
          events: prev.events?.length ? prev.events : r.events,
        });
        continue;
      }
      const terminal = ["DELIVERED", "CANCELLED", "RETURNED"].includes(r.status);
      const mergedIssue =
        r.issue != null
          ? {
              ...r.issue,
              photos:
                r.issue.photos?.length
                  ? r.issue.photos
                  : prev.issue &&
                      !prev.issue.resolvedAt &&
                      prev.issue.type === r.issue.type &&
                      prev.issue.photos?.length
                    ? prev.issue.photos
                    : r.issue.photos,
            }
          : undefined;
      byCode.set(r.code, {
        ...prev,
        ...r,
        issue: mergedIssue,
        events: r.events?.length ? r.events : prev.events,
        stage:
          r.stage != null
            ? r.stage
            : terminal
              ? undefined
              : prev.stage,
        returnStage:
          r.returnStage != null
            ? r.returnStage
            : r.status === "RETURNING" || r.status === "RETURNED"
              ? prev.returnStage
              : terminal
                ? undefined
                : prev.returnStage,
      });
    }
    return { orders: [...byCode.values()] };
  });
}

export async function syncTripsFromApi() {
  if (!isApiEnabled()) return;
  // Không lọc office trên FE: BE đã scope theo staff VP; admin (ALL) cần đủ chuyến để map biển số.
  // VP vẫn nhận chuyến thuộc VP mình từ BE; thiếu chuyến không còn làm tab "Hàng trên xe" hiện mã chuyến thay biển (plate lấy từ order.vehiclePlate).
  const trips = await domain.listTrips({ size: 200 });
  useStore.setState({ trips });
}

export async function syncFinanceFromApi() {
  if (!isApiEnabled()) return;
  const st = useStore.getState();
  const officeCode = assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice));
  const receipts = await fin.listReceipts({
    officeCode: officeCode || undefined,
    size: 200,
  });
  useStore.setState({ receipts });
}

/** Master tối thiểu cho tạo đơn công khai: chỉ VP (không kéo xe / tài xế / tuyến / user). */
export async function syncPublicOfficesFromApi() {
  if (!isApiEnabled()) return;
  const officesRaw = await domain.fetchOffices();
  const offices = domain.asArray(officesRaw).map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    isHub: Boolean(o.isHub),
    sourceId: o.sourceId ?? undefined,
    address: o.address ?? undefined,
    latitude: o.latitude != null ? Number(o.latitude) : undefined,
    longitude: o.longitude != null ? Number(o.longitude) : undefined,
  }));
  setOfficeDirectory(offices);
  useStore.setState({ offices });
}

/** Bảng giá / phụ phí — đọc được cả khi chưa đăng nhập (tạo đơn KH tạm tính cước như NV). */
export async function syncPublicPricingFromApi() {
  if (!isApiEnabled()) return;
  const [surcharges, pricingRules, doorFees, productPricing] = await Promise.all([
    fin.fetchSurchargePolicy().catch(() => useStore.getState().surcharges),
    fin.fetchPricingRules().catch(() => useStore.getState().pricingRules),
    fin.fetchDoorFeeRules().catch(() => useStore.getState().doorFees),
    fin.fetchProductPriceRules().catch(() => useStore.getState().productPricing),
  ]);
  useStore.setState({
    surcharges,
    pricingRules,
    doorFees,
    productPricing,
  });
}

/** Tất cả dữ liệu công khai cần cho wizard tạo đơn KH. */
export async function syncPublicCreateOrderFromApi() {
  if (!isApiEnabled()) return;
  await Promise.all([syncPublicOfficesFromApi(), syncPublicPricingFromApi()]);
}

export async function syncConfigFromApi() {
  if (!isApiEnabled()) return;
  const [integrations] = await Promise.all([
    fin.fetchIntegrationConfig().catch(() => useStore.getState().integrations),
    syncPublicPricingFromApi(),
  ]);
  useStore.setState({ integrations });
}

export async function syncAllFromApi() {
  if (!isApiEnabled()) return;
  const results = await Promise.allSettled([
    syncMasterFromApi(),
    syncOrdersFromApi(),
    syncTripsFromApi(),
    syncFinanceFromApi(),
    syncConfigFromApi(),
  ]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed && failed.status === "rejected") throw failed.reason;
}

export function clearApiSession() {
  setToken(null);
  clearRuntimePermissions();
}

/** Resolve FE office name/code to BE office code (best-effort; may return raw label). */
export function resolveOfficeCode(nameOrCode: string | undefined): string {
  return resolveOfficeCodeStrict(nameOrCode) ?? nameOrCode?.trim() ?? "";
}

/** Map UI office label → BE code; null when master not loaded or no match. */
export function resolveOfficeCodeStrict(nameOrCode: string | undefined): string | null {
  const raw = nameOrCode?.trim();
  if (!raw) return null;
  const offices = useStore.getState().offices;
  if (!offices.length) return null;

  const byToken = offices.find((o) => {
    if (raw.startsWith("id:") && o.id != null) return `id:${o.id}` === raw;
    if (raw.startsWith("sid:") && o.sourceId != null) return `sid:${o.sourceId}` === raw;
    return false;
  });
  if (byToken) return byToken.code;

  const byCode = offices.find((o) => o.code === raw);
  if (byCode) return byCode.code;

  const byExactName = offices.find((o) => o.name === raw);
  if (byExactName) return byExactName.code;

  const matched = officesMatchingPoint(offices, raw);
  if (matched.length === 1) return matched[0].code;
  if (matched.length > 1) {
    const folded = foldOfficeKey(raw);
    const preferred = preferredOfficeCodesForPoint(folded);
    const byPref = preferred.map((c) => matched.find((o) => o.code.toUpperCase() === c)).find(Boolean);
    if (byPref) return byPref.code;
    const exact = matched.find((o) => o.name === raw);
    return (exact ?? matched[0]).code;
  }

  const folded = foldOfficeKey(raw);
  if (folded) {
    const byFold = offices.find((o) => foldOfficeKey(o.name) === folded || foldOfficeKey(o.code) === folded);
    if (byFold) return byFold.code;
    for (const code of preferredOfficeCodesForPoint(folded)) {
      const hit = offices.find((o) => o.code.toUpperCase() === code);
      if (hit) return hit.code;
    }
  }

  return null;
}
