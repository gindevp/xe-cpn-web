import { isApiEnabled, setToken } from "./client";
import * as domain from "./domain-api";
import * as fin from "./finance-config-api";
import { useStore } from "../store";
import { foldOfficeKey, officesMatchingPoint, setOfficeDirectory } from "../mock-data";
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
    code: o.code,
    name: o.name,
    isHub: Boolean(o.isHub),
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
  const routes = domain.asArray(routesRaw).map((r) => r.name || r.code);
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
      active: r.active !== false,
      roleGroup: r.roleGroupCode || undefined,
    })),
  });
}

export async function syncOrdersFromApi() {
  if (!isApiEnabled()) return;
  const st = useStore.getState();
  const officeCode = assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice));
  const query = { size: 200, sort: "id,desc" as const };
  if (!officeCode) {
    useStore.setState({ orders: await domain.listOrders(query) });
    return;
  }
  // VP vừa gửi vừa nhận — không lọc chỉ fromOffice (quay.hn/GP sẽ mất hết đơn đến).
  const [outbound, inbound] = await Promise.all([
    domain.listOrders({ ...query, fromOfficeCode: officeCode }),
    domain.listOrders({ ...query, toOfficeCode: officeCode }),
  ]);
  const byCode = new Map<string, (typeof outbound)[number]>();
  for (const row of [...outbound, ...inbound]) {
    if (row.code) byCode.set(row.code, row);
  }
  useStore.setState({ orders: [...byCode.values()] });
}

export async function syncTripsFromApi() {
  if (!isApiEnabled()) return;
  const office = useStore.getState().session?.office;
  const trips = await domain.listTrips({
    officeCode: office && office !== "ALL" ? office : undefined,
    size: 100,
  });
  useStore.setState({ trips });
}

export async function syncFinanceFromApi() {
  if (!isApiEnabled()) return;
  const office = useStore.getState().session?.office;
  const receipts = await fin.listReceipts({
    officeCode: office && office !== "ALL" ? office : undefined,
    size: 100,
  });
  useStore.setState({ receipts });
}

export async function syncConfigFromApi() {
  if (!isApiEnabled()) return;
  const [surcharges, integrations, pricingRules, doorFees, productPricing] = await Promise.all([
    fin.fetchSurchargePolicy().catch(() => useStore.getState().surcharges),
    fin.fetchIntegrationConfig().catch(() => useStore.getState().integrations),
    fin.fetchPricingRules().catch(() => useStore.getState().pricingRules),
    fin.fetchDoorFeeRules().catch(() => useStore.getState().doorFees),
    fin.fetchProductPriceRules().catch(() => useStore.getState().productPricing),
  ]);
  useStore.setState({
    surcharges,
    integrations,
    pricingRules,
    doorFees,
    productPricing,
  });
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

  const byCode = offices.find((o) => o.code === raw);
  if (byCode) return byCode.code;

  const byExactName = offices.find((o) => o.name === raw);
  if (byExactName) return byExactName.code;

  const matched = officesMatchingPoint(offices, raw);
  if (matched.length === 1) return matched[0].code;
  if (matched.length > 1) {
    const exact = matched.find((o) => o.name === raw);
    return (exact ?? matched[0]).code;
  }

  const folded = foldOfficeKey(raw);
  if (folded) {
    const byFold = offices.find((o) => foldOfficeKey(o.name) === folded || foldOfficeKey(o.code) === folded);
    if (byFold) return byFold.code;
  }

  return null;
}
