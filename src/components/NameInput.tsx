import * as React from "react";
import { Input } from "@/components/ui/input";
import { isPersonNameText, normalizePersonName, stripNameChars } from "@/lib/vn-name";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Giữ nguyên hoa/thường (tên nhân viên, tài xế). Mặc định chữ hoa khi blur. */
  preserveCase?: boolean;
};

/**
 * Ô nhập tên người — chỉ chữ và khoảng trắng, an toàn với bộ gõ tiếng Việt.
 *
 * Không ép hoa bằng CSS hay toUpperCase trong lúc gõ: Unikey/EVKey sửa chữ đã gõ
 * bằng backspace, text-transform:uppercase làm trình duyệt nuốt chữ phía trước
 * (VIỆT → ỆT). Số/ký hiệu bị từ chối ở beforeinput; dán thì chỉ giữ phần chữ.
 * Chữ hoa và gộp khoảng trắng chỉ khi blur.
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
          onChange(e.currentTarget.value);
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
          onChange(value.slice(0, start) + stripNameChars(text) + value.slice(end));
        }}
        onChange={(e) => {
          if (composing.current || e.nativeEvent.isComposing) {
            onChange(e.target.value);
            return;
          }
          const next = e.target.value;
          onChange(isPersonNameText(next) ? next : stripNameChars(next));
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
