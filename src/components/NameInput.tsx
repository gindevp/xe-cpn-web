import * as React from "react";
import { Input } from "@/components/ui/input";
import { toUpperName } from "@/lib/vn-name";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Ô nhập tên người gửi/nhận — an toàn với mọi bộ gõ tiếng Việt (Unikey/EVKey/IME Windows).
 *
 * Nguyên tắc: **không được viết lại giá trị input trong lúc gõ**. Bộ gõ kiểu Unikey gửi
 * backspace + ký tự thay thế (không có composition event); nếu onChange biến đổi chuỗi
 * (chữ hoa/lọc ký tự) thì React ghi đè `input.value` xen giữa chuỗi phím đó → mất dấu
 * (NGUYỄN thành NGUYÊN). Vì vậy lúc gõ giữ nguyên giá trị thô, chữ hoa chỉ là hiển thị
 * bằng CSS `text-transform: uppercase`; chuẩn hoá thật (toUpperName) khi blur / submit.
 */
export const NameInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onBlur, className, ...rest }, ref) => (
    <Input
      ref={ref}
      value={value}
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      className={cn("uppercase placeholder:normal-case", className)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        onChange(toUpperName(e.currentTarget.value));
        onBlur?.(e);
      }}
      {...rest}
    />
  ),
);
NameInput.displayName = "NameInput";
