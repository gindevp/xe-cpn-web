import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizePersonName } from "@/lib/vn-name";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Giữ nguyên hoa/thường (tên nhân viên, tài xế). Mặc định hiện hoa khi gõ, lưu hoa khi rời ô. */
  preserveCase?: boolean;
};

/**
 * Ô tên dùng chung cho cả dự án.
 * Không sửa/chặn ký tự lúc đang gõ: Unikey/EVKey gửi ký tự ẩn + backspace để đặt dấu,
 * chặn hay ghi đè bất kỳ phím nào sẽ xóa nhầm chữ trước (VIỆT → ỆT).
 * Chữ hoa lúc gõ chỉ là CSS; lọc ký tự lạ và viết hoa thật khi rời ô.
 */
export const NameInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onBlur, className, preserveCase = false, ...rest }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const emitted = React.useRef(value ?? "");
    const setRef = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };
    const emit = (next: string) => {
      emitted.current = next;
      onChange(next);
    };

    // Chỉ ghi DOM khi giá trị đổi từ ngoài (tra SĐT, chọn danh bạ, reset form).
    React.useEffect(() => {
      const el = innerRef.current;
      const next = value ?? "";
      if (!el || next === emitted.current) return;
      emitted.current = next;
      if (el.value !== next) el.value = next;
    }, [value]);

    return (
      <Input
        ref={setRef}
        defaultValue={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(!preserveCase && "uppercase placeholder:normal-case", className)}
        onChange={(e) => {
          emit(e.target.value);
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          const next = normalizePersonName(el.value, !preserveCase);
          if (el.value !== next) el.value = next;
          if (next !== emitted.current) emit(next);
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
NameInput.displayName = "NameInput";
