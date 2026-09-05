import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode"> & {
  value: number;
  onChange: (value: number) => void;
  /** Cho phép thập phân (cân nặng, định mức…). Mặc định false = số nguyên. */
  decimal?: boolean;
};

function sanitizeRaw(raw: string, decimal: boolean): string {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "").replace(/,/g, ".");
  if (!decimal) return s.replace(/\./g, "");
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
}

/** "" / "." → null (ô trống). */
function parseDisplay(raw: string, decimal: boolean): number | null {
  const s = sanitizeRaw(raw, decimal).trim();
  if (!s || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatCommitted(n: number, decimal: boolean): string {
  if (!Number.isFinite(n)) return "";
  if (!decimal) return String(Math.round(n));
  const t = String(n);
  if (!t.includes(".")) return t;
  return t.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/** Bỏ 0 đầu kiểu 05/01; giữ "" và "0." khi đang gõ. */
function normalizeDraft(raw: string, decimal: boolean): string {
  const s = sanitizeRaw(raw, decimal);
  if (s === "") return "";
  if (decimal && (s.endsWith(".") || s === "0.")) return s;
  const n = parseDisplay(s, decimal);
  if (n == null) return s;
  return formatCommitted(n, decimal);
}

/**
 * Ô số toàn dự án: text + inputMode, không mũi tên spin,
 * xóa được hết trên UI, không kẹt kiểu 05/01 khi gõ.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(
  (
    { value, onChange, className, decimal = false, disabled, readOnly, onBlur, onFocus, min, ...rest },
    ref,
  ) => {
    const [draft, setDraft] = React.useState<string | null>(null);
    const minN = min != null && min !== "" ? Number(min) : undefined;

    const clamp = (n: number) => {
      if (minN != null && Number.isFinite(minN) && n < minN) return minN;
      return n;
    };

    const commit = (raw: string) => {
      const parsed = parseDisplay(raw, decimal);
      const n = clamp(parsed ?? 0);
      onChange(n);
      setDraft(null);
    };

    const shown = draft !== null ? draft : formatCommitted(Number(value) || 0, decimal);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        className={cn("tabular-nums", className)}
        value={shown}
        placeholder="0"
        onFocus={(e) => {
          setDraft(formatCommitted(Number(value) || 0, decimal));
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = normalizeDraft(e.target.value, decimal);
          setDraft(next);
          const parsed = parseDisplay(next, decimal);
          onChange(clamp(parsed ?? 0));
        }}
        onBlur={(e) => {
          commit(draft ?? e.target.value);
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
