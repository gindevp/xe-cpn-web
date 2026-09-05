import { asArray, fetchRoutes, type RouteDTO } from "./domain-api";
import { resolveOfficeCodeStrict } from "./sync";

/** Branch (Tuyến VTHK) display name → master Route.code */
const BRANCH_TO_ROUTE: Record<string, string> = {
  "Nam Định": "GP-ND",
  "Ninh Bình": "GP-NB",
  "Việt Trì": "GP-VT",
  "Thái Bình": "NB-TB",
  "Phú Thọ": "GP-VT",
  "Yên Bái": "GP-ND",
};

function normalizeRouteKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+to\s+/gi, "-")
    .replace(/\s*[→\-–—>]+\s*/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function matchRoute(catalog: RouteDTO[], hint: string): RouteDTO | undefined {
  const raw = hint.trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  const norm = normalizeRouteKey(raw);
  return (
    catalog.find((r) => r.code?.toUpperCase() === upper) ||
    catalog.find((r) => r.code?.toUpperCase() === norm) ||
    catalog.find((r) => (r.name || "").toLowerCase() === raw.toLowerCase()) ||
    catalog.find((r) => r.name && normalizeRouteKey(r.name) === norm)
  );
}

/**
 * Resolve a master Route.code for trip create when gán hàng lên xe.
 * Prefer branch map → hint (name/code) → from/to of orders → first active route.
 */
export async function resolveTripRouteCode(opts: {
  branchName?: string;
  routeHint?: string;
  orders?: Array<{ fromOffice?: string; toOffice?: string; hubOffice?: string }>;
}): Promise<string> {
  const catalog = asArray(await fetchRoutes().catch(() => [] as RouteDTO[]));
  const active = catalog.filter((r) => r.active !== false);
  const pool = active.length ? active : catalog;

  const tryHint = (hint?: string | null): string | null => {
    if (!hint?.trim()) return null;
    const hit = matchRoute(pool, hint) || matchRoute(catalog, hint);
    return hit?.code ?? null;
  };

  const mapped = opts.branchName ? BRANCH_TO_ROUTE[opts.branchName.trim()] : undefined;
  if (mapped) {
    const hit = tryHint(mapped);
    if (hit) return hit;
    // Code may exist but inactive — BE resolveRoute still finds by code
    if (catalog.some((r) => r.code?.toUpperCase() === mapped.toUpperCase()) || mapped.includes("-")) {
      return mapped;
    }
  }

  for (const hint of [opts.routeHint, opts.branchName]) {
    const hit = tryHint(hint);
    if (hit) return hit;
  }

  const counts = new Map<string, number>();
  for (const o of opts.orders ?? []) {
    const from = o.fromOffice ? resolveOfficeCodeStrict(o.fromOffice) : null;
    const to =
      (o.toOffice ? resolveOfficeCodeStrict(o.toOffice) : null) ||
      (o.hubOffice ? resolveOfficeCodeStrict(o.hubOffice) : null);
    if (!from || !to || from === to) continue;
    const code = `${from}-${to}`.toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code] of ranked) {
    const hit = tryHint(code);
    if (hit) return hit;
    // Invented from/to pair — BE can resolve via office pair if route exists
    return code;
  }

  if (pool[0]?.code) return pool[0].code;
  if (catalog[0]?.code) return catalog[0].code;

  throw new Error("Chưa có tuyến master trên hệ thống — thêm tuyến ở Master dữ liệu rồi thử lại");
}

/** Sync helper for UI that still has local branch→code map. */
export function tripRouteCodeForBranch(branchName: string, localRoutes: string[] = []): string {
  const mapped = BRANCH_TO_ROUTE[branchName.trim()];
  if (mapped) return mapped;
  const needle = branchName.trim().toLowerCase();
  const byName = localRoutes.find((r) => {
    const s = r.toLowerCase();
    return s === needle || s.includes(needle) || needle.includes(s);
  });
  return byName ?? localRoutes[0] ?? "";
}
