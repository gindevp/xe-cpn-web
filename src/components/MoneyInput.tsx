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
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, suffix = "VNĐ", disabled, readOnly, ...rest }, ref) => {
    const showSuffix = Boolean(suffix);
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
          value={formatVndInput(value)}
          placeholder="0"
          onChange={(e) => onChange(parseVndInput(e.target.value))}
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
