import { apiRequest } from "@/lib/api/client";
import {
  OFFICE_ITINERARY_POINTS,
  findOfficeByToken,
  foldOfficeKey,
  splitItineraryPoints,
  type OfficeRec,
} from "@/lib/mock-data";

export type TransitHubPolicy = {
  groupPoints: string;
  groupHubOfficeCode?: string | null;
  defaultHubOfficeCode?: string | null;
};

export const DEFAULT_TRANSIT_POLICY: TransitHubPolicy = {
  groupPoints: "NB,ND,TB",
  groupHubOfficeCode: "",
  defaultHubOfficeCode: "",
};

const PROVINCE = new Set<string>(OFFICE_ITINERARY_POINTS.province.map((p) => p.value));
const HANOI = new Set<string>(OFFICE_ITINERARY_POINTS.hanoi.map((p) => p.value));

/** VP tỉnh: có điểm lộ trình tỉnh và không kiêm điểm Hà Nội. */
export function isProvinceOffice(office?: OfficeRec | null): boolean {
  const points = splitItineraryPoints(office?.itineraryPoint);
  if (!points.length) return false;
  return points.some((p) => PROVINCE.has(p)) && !points.some((p) => HANOI.has(p));
}

let cached: TransitHubPolicy | null = null;
let loading: Promise<TransitHubPolicy> | null = null;

export function loadTransitHubPolicy(): Promise<TransitHubPolicy> {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  loading = apiRequest<TransitHubPolicy>("/api/transit-hub-policy", { auth: false })
    .then((row) => {
      cached = {
        groupPoints: row?.groupPoints?.trim() || DEFAULT_TRANSIT_POLICY.groupPoints,
        groupHubOfficeCode: row?.groupHubOfficeCode ?? "",
        defaultHubOfficeCode: row?.defaultHubOfficeCode ?? "",
      };
      return cached;
    })
    .catch(() => {
      cached = DEFAULT_TRANSIT_POLICY;
      return cached;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function rememberTransitHubPolicy(policy: TransitHubPolicy) {
  cached = policy;
}

export type ProvinceTransit = {
  hub: OfficeRec;
  fromName: string;
  toName: string;
  hubName: string;
};

function officeByHint(offices: OfficeRec[], code: string | null | undefined, hints: string[]): OfficeRec | undefined {
  const byCode = code?.trim() ? findOfficeByToken(code, offices) : undefined;
  if (byCode) return byCode;
  const needles = hints.map((h) => foldOfficeKey(h));
  return offices.find((o) => {
    const blob = foldOfficeKey(`${o.name} ${o.address ?? ""} ${o.code}`);
    return needles.every((n) => blob.includes(n));
  });
}

function inPointGroup(office: OfficeRec, group: Set<string>): boolean {
  const points = splitItineraryPoints(office.itineraryPoint).filter((p) => PROVINCE.has(p));
  return points.length > 0 && points.every((p) => group.has(p));
}

/** Cặp tỉnh–tỉnh: nhóm NB/NĐ/TB dùng hub nhóm, còn lại dùng hub mặc định. */
export function resolveProvinceTransit(
  from: OfficeRec | null | undefined,
  to: OfficeRec | null | undefined,
  offices: OfficeRec[],
  policy: TransitHubPolicy,
): ProvinceTransit | null {
  if (!from || !to || from.code === to.code) return null;
  if (!isProvinceOffice(from) || !isProvinceOffice(to)) return null;
  const group = new Set(
    (policy.groupPoints || DEFAULT_TRANSIT_POLICY.groupPoints)
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  const grouped = inPointGroup(from, group) && inPointGroup(to, group);
  const hub = grouped
    ? officeByHint(offices, policy.groupHubOfficeCode, ["72", "trannhantong"])
    : officeByHint(offices, policy.defaultHubOfficeCode, ["31a", "nguyenquoctri"]);
  if (!hub || hub.code === from.code || hub.code === to.code) return null;
  return {
    hub,
    fromName: from.name,
    toName: to.name,
    hubName: hub.name,
  };
}
