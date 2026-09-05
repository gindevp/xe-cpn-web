import { formatVND } from "./mock-data";

/** Build short Vietnamese change lines for order history (max ~255 on BE). */
export function summarizeChanges(
  lines: Array<{ label: string; from: string | number | null | undefined; to: string | number | null | undefined }>,
): string {
  const parts: string[] = [];
  for (const { label, from, to } of lines) {
    const a = normalize(from);
    const b = normalize(to);
    if (a === b) continue;
    parts.push(`${label} ${a || "—"}→${b || "—"}`);
  }
  return parts.join("; ").slice(0, 240);
}

function normalize(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    // Money-like integers stay as VND when caller passes already-formatted; raw numbers as string.
    return String(v);
  }
  return String(v).trim();
}

export function formatKg(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  return `${Number(n).toFixed(3).replace(/\.?0+$/, "")}kg`;
}

export function formatMoney(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  return formatVND(n);
}
