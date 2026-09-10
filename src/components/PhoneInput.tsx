import * as React from "react";
import { Input } from "@/components/ui/input";
import { isValidVNPhone } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode" | "maxLength"> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Ô nhập SĐT dùng chung (tạo đơn KH + nhân viên): chỉ nhận chữ số, tối đa 10 số,
 * validate ngay khi gõ — sai định dạng VN (03/05/07/08/09 + 8 số) thì viền đỏ + báo lỗi.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, ...rest }, ref) => {
    const invalid = value.trim() !== "" && !isValidVNPhone(value);
    return (
      <div className="w-full">
        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={10}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D+/g, "").slice(0, 10))}
          aria-invalid={invalid || undefined}
          className={cn(
            className,
            invalid && "ring-1 ring-destructive focus-visible:ring-destructive",
          )}
          {...rest}
        />
        {invalid && (
          <p className="mt-1 text-xs text-destructive">
            SĐT không hợp lệ — cần 10 số, đầu 03/05/07/08/09
          </p>
        )}
      </div>
    );
  },
);
PhoneInput.displayName = "PhoneInput";
