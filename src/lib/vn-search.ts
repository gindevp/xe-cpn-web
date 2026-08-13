/** Vietnamese-aware search helpers for combobox filtering. */

/** Lowercase + strip combining marks (ả→a, đ→d). */
export function normalizeVn(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

/** True if haystack matches query (case/diacritic insensitive, substring). */
export function vnIncludes(haystack: string, query: string): boolean {
  const q = normalizeVn(query);
  if (!q) return true;
  return normalizeVn(haystack).includes(q);
}

/**
 * cmdk-compatible filter: value + keywords vs search.
 * Returns 1 = match, 0 = no match.
 */
export function vnCmdkFilter(value: string, search: string, keywords?: string[]): number {
  const hay = [value, ...(keywords ?? [])].join(" ");
  return vnIncludes(hay, search) ? 1 : 0;
}
