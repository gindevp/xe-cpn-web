import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatVndInput, parseVndInput } from "@/lib/mock-data";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode"> & {
  value: number;
  onChange: (value: number) => void;
  /** Hiện đơn vị bên phải ô — mặc định "VNĐ". Truyền "" để ẩn. */
  suffix?: string;
};

/**
 * Ô nhập tiền VNĐ: hiển thị #.###.### khi gõ, trả về số nguyên đồng.
 * Xóa hết được trên UI (không ép hiện 0 khi đang sửa); blur trống → 0.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, suffix = "VNĐ", disabled, readOnly, onBlur, onFocus, ...rest }, ref) => {
    const showSuffix = Boolean(suffix);
    const [draft, setDraft] = React.useState<string | null>(null);

    const shown = draft !== null ? draft : formatVndInput(value);

    return (
      <div className={cn("relative w-full", className)}>
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            "h-9 w-full text-right tabular-nums",
            showSuffix && "pr-12",
            (disabled || readOnly) && "bg-muted/40",
          )}
          value={shown}
          placeholder="0"
          onFocus={(e) => {
            setDraft(formatVndInput(value));
            onFocus?.(e);
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // Cho phép ô trống hoàn toàn khi xóa.
            if (!raw.trim()) {
              setDraft("");
              onChange(0);
              return;
            }
            const digits = raw.replace(/[^\d]/g, "");
            // Bỏ số 0 đầu kiểu 05 → hiển thị theo format sau khi parse.
            const n = parseVndInput(digits);
            setDraft(formatVndInput(n));
            onChange(n);
          }}
          onBlur={(e) => {
            const n = parseVndInput(draft ?? e.target.value);
            onChange(n);
            setDraft(null);
            onBlur?.(e);
          }}
          {...rest}
        />
        {showSuffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
