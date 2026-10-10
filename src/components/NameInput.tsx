import * as React from "react";
import { Input } from "@/components/ui/input";
import { isPersonNameText, normalizePersonName, stripNameChars, upperExceptLastGrapheme } from "@/lib/vn-name";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Giữ nguyên hoa/thường (tên nhân viên, tài xế). Mặc định hoa ngay khi gõ, trừ ký tự đang sửa dấu. */
  preserveCase?: boolean;
};

/**
 * Ô nhập tên người — chỉ chữ và khoảng trắng, an toàn với bộ gõ tiếng Việt.
 *
 * Không dùng CSS uppercase và không hoa ký tự cuối trong lúc gõ: Unikey sửa chữ đó
 * bằng backspace, viết lại cả chuỗi làm mất chữ phía trước (VIỆT → ỆT).
 * Chữ đã gõ xong thì hoa ngay. Số/ký hiệu bị từ chối ở beforeinput.
 */
export const NameInput = React.forwardRef<HTMLInputElement, Props>(
  (
    { value, onChange, onBlur, onPaste, onBeforeInput, className, preserveCase = false, ...rest },
    ref,
  ) => {
    const composing = React.useRef(false);
    return (
      <Input
        ref={ref}
        value={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={className}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          const raw = e.currentTarget.value;
          onChange(preserveCase ? raw : raw.toLocaleUpperCase("vi-VN"));
        }}
        onBeforeInput={(e) => {
          onBeforeInput?.(e);
          if (e.defaultPrevented || composing.current) return;
          const data = e.nativeEvent.data;
          if (data == null || data === "") return;
          const inputType = e.nativeEvent.inputType;
          if (
            inputType === "insertFromPaste" ||
            inputType === "insertFromDrop" ||
            inputType?.startsWith("insertComposition") ||
            e.nativeEvent.isComposing
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
          const start = el.selectionStart ?? value.length;
          const end = el.selectionEnd ?? start;
          const merged = value.slice(0, start) + stripNameChars(text) + value.slice(end);
        onChange(preserveCase ? merged : merged.toLocaleUpperCase("vi-VN"));
        }}
        onChange={(e) => {
          if (composing.current || e.nativeEvent.isComposing) {
            onChange(e.target.value);
            return;
          }
          const raw = e.target.value;
          const cleaned = isPersonNameText(raw) ? raw : stripNameChars(raw);
          const next = preserveCase ? cleaned : upperExceptLastGrapheme(cleaned);
          const el = e.target;
          const start = el.selectionStart ?? next.length;
          const end = el.selectionEnd ?? start;
          onChange(next);
          if (next !== raw) {
            const delta = next.length - raw.length;
            requestAnimationFrame(() => {
              const pos = Math.max(0, Math.min(next.length, start + delta));
              el.setSelectionRange(pos, Math.max(0, Math.min(next.length, end + delta)));
            });
          }
        }}
        onBlur={(e) => {
          if (composing.current) return;
          onChange(normalizePersonName(e.currentTarget.value, !preserveCase));
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
NameInput.displayName = "NameInput";
