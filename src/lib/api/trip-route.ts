import { asArray, fetchRoutes, type RouteDTO } from "./domain-api";
import { resolveOfficeCodeStrict } from "./sync";

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
 * Uses live Route catalog only (name/code / from-to of orders). No hub/GP map.
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
  }

  if (pool[0]?.code) return pool[0].code;
  if (catalog[0]?.code) return catalog[0].code;

  throw new Error("Chưa có tuyến master trên hệ thống — thêm tuyến ở Master dữ liệu rồi thử lại");
}

/** Match a VTHK branch name to a local route label; no hardcoded hub codes. */
export function tripRouteCodeForBranch(branchName: string, localRoutes: string[] = []): string {
  const needle = branchName.trim().toLowerCase();
  const byName = localRoutes.find((r) => {
    const s = r.toLowerCase();
    return s === needle || s.includes(needle) || needle.includes(s);
  });
  return byName ?? localRoutes[0] ?? "";
}
