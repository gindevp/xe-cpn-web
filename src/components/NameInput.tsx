import * as React from "react";
import { Input } from "@/components/ui/input";
import { isPersonNameText, normalizePersonName, stripNameChars } from "@/lib/vn-name";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Giữ nguyên hoa/thường (tên nhân viên, tài xế). Mặc định hoa khi rời ô. */
  preserveCase?: boolean;
};

/**
 * Ô tên dùng chung cho cả dự án.
 * Không gắn `value` lúc đang gõ: ô điều khiển bị React ghi đè từng phím,
 * bộ gõ tiếng Việt mất chữ (VIỆT → ỆT) ở mọi màn tạo đơn / sửa đơn / nhân viên.
 * Chữ hoa khi rời ô.
 */
export const NameInput = React.forwardRef<HTMLInputElement, Props>(
  (
    { value, onChange, onBlur, onPaste, onBeforeInput, onFocus, className, preserveCase = false, ...rest },
    ref,
  ) => {
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
        className={className}
        onFocus={onFocus}
        onBeforeInput={(e) => {
          onBeforeInput?.(e);
          if (e.defaultPrevented || e.nativeEvent.isComposing) return;
          const data = e.nativeEvent.data;
          if (data == null || data === "") return;
          const inputType = e.nativeEvent.inputType;
          if (
            inputType === "insertFromPaste" ||
            inputType === "insertFromDrop" ||
            inputType?.startsWith("insertComposition")
          ) {
            return;
          }
          if (!isPersonNameText(data)) e.preventDefault();
        }}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          const text = e.clipboardData.getData("text");
          if (isPersonNameText(text)) return;
          e.preventDefault();
          const el = e.currentTarget;
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? start;
          const merged = el.value.slice(0, start) + stripNameChars(text) + el.value.slice(end);
          el.value = merged;
          const pos = start + stripNameChars(text).length;
          el.setSelectionRange(pos, pos);
          emit(merged);
        }}
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
