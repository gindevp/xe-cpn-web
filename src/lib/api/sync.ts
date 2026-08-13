import { isApiEnabled, setToken } from "./client";
import * as domain from "./domain-api";
import * as fin from "./finance-config-api";
import { useStore } from "../store";

export async function syncMasterFromApi() {
  if (!isApiEnabled()) return;
  const [officesRaw, vehiclesRaw, driversRaw, routesRaw] = await Promise.all([
    domain.fetchOffices(),
    domain.fetchVehicles(),
    domain.fetchDrivers(),
    domain.fetchRoutes(),
  ]);
  const offices = domain.asArray(officesRaw).map((o) => ({ code: o.code, name: o.name }));
  const vehicles = domain.asArray(vehiclesRaw).map((v) => ({
    bks: v.plateNumber,
    capacity: Number(v.capacityKg),
  }));
  const drivers = domain.asArray(driversRaw).map((d) => d.fullName);
  const routes = domain.asArray(routesRaw).map((r) => r.name || r.code);
  useStore.setState({
    offices: offices.length ? offices : useStore.getState().offices,
    vehicles: vehicles.length ? vehicles : useStore.getState().vehicles,
    drivers: drivers.length ? drivers : useStore.getState().drivers,
    routes: routes.length ? routes : useStore.getState().routes,
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
      role: (r.roleCode as any) || "Q",
      office: r.officeCode || "GP",
      active: r.active !== false,
    })),
  });
}

export async function syncOrdersFromApi() {
  if (!isApiEnabled()) return;
  // Cap page size — do not request 10000; FE search still filters client-side (TASK-019)
  const orders = await domain.listOrders({ size: 200, sort: "id,desc" });
  useStore.setState({ orders });
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
    pricingRules: pricingRules.length ? pricingRules : useStore.getState().pricingRules,
    doorFees: doorFees.length ? doorFees : useStore.getState().doorFees,
    // Giá theo sản phẩm: luôn theo API/DB (kể cả mảng rỗng — không giữ seed local)
    productPricing,
  });
}

export async function syncAllFromApi() {
  if (!isApiEnabled()) return;
  await Promise.all([
    syncMasterFromApi(),
    syncOrdersFromApi(),
    syncTripsFromApi(),
    syncFinanceFromApi(),
    syncConfigFromApi(),
  ]);
}

export function clearApiSession() {
  setToken(null);
}

/** Resolve FE office name/code to BE office code */
export function resolveOfficeCode(nameOrCode: string | undefined): string {
  if (!nameOrCode) return "GP";
  const offices = useStore.getState().offices;
  const byCode = offices.find((o) => o.code === nameOrCode);
  if (byCode) return byCode.code;
  const byName = offices.find((o) => o.name === nameOrCode || o.name.includes(nameOrCode) || nameOrCode.includes(o.code));
  if (byName) return byName.code;
  // common hub aliases
  if (/giải phóng|giai phong|hub|hn_hub/i.test(nameOrCode)) return "GP";
  return nameOrCode.length <= 5 ? nameOrCode.toUpperCase() : "GP";
}
