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
    const focused = React.useRef(false);
    const setRef = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el || focused.current) return;
      if (el.value !== value) el.value = value ?? "";
    }, [value]);

    return (
      <Input
        ref={setRef}
        defaultValue={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={className}
        onFocus={(e) => {
          focused.current = true;
          onFocus?.(e);
        }}
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
          onChange(merged);
        }}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={(e) => {
          focused.current = false;
          const next = normalizePersonName(e.currentTarget.value, !preserveCase);
          e.currentTarget.value = next;
          onChange(next);
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
NameInput.displayName = "NameInput";
