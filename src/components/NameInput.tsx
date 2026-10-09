import * as React from "react";
import { Input } from "@/components/ui/input";
import { isPersonNameText, normalizePersonName, stripNameChars } from "@/lib/vn-name";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Giữ nguyên hoa/thường (tên nhân viên, tài xế). Mặc định chữ hoa khi blur. */
  preserveCase?: boolean;
};

/**
 * Ô nhập tên người — chỉ chữ và khoảng trắng, an toàn với bộ gõ tiếng Việt.
 *
 * Không viết lại chuỗi chữ trong lúc gõ (mất dấu Unikey). Số/ký hiệu bị từ chối
 * ở beforeinput; dán thì chỉ giữ phần chữ. Chuẩn hoá khoảng trắng khi blur.
 */
export const NameInput = React.forwardRef<HTMLInputElement, Props>(
  (
    { value, onChange, onBlur, onPaste, onBeforeInput, className, preserveCase = false, ...rest },
    ref,
  ) => (
    <Input
      ref={ref}
      value={value}
      autoComplete="off"
      autoCapitalize={preserveCase ? "off" : "characters"}
      spellCheck={false}
      className={cn(!preserveCase && "uppercase placeholder:normal-case", className)}
      onBeforeInput={(e) => {
        onBeforeInput?.(e);
        if (e.defaultPrevented) return;
        const data = e.nativeEvent.data;
        if (data == null || data === "") return;
        const inputType = e.nativeEvent.inputType;
        if (inputType === "insertFromPaste" || inputType === "insertFromDrop") return;
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
        const next = e.target.value;
        onChange(isPersonNameText(next) ? next : stripNameChars(next));
      }}
      onBlur={(e) => {
        onChange(normalizePersonName(e.currentTarget.value, !preserveCase));
        onBlur?.(e);
      }}
      {...rest}
    />
  ),
);
NameInput.displayName = "NameInput";
