import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hasBlockedTypingChar, normalizePersonName, stripBlockedTypingChars } from "@/lib/vn-name";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Giữ nguyên hoa/thường (tên nhân viên, tài xế). Mặc định hiện hoa khi gõ, lưu hoa khi rời ô. */
  preserveCase?: boolean;
};

/** Đủ lâu để bộ gõ chèn + xoá xong ký tự trung gian, đủ nhanh để số gõ nhầm biến mất ngay. */
const CLEAN_DELAY_MS = 250;

/**
 * Ô tên dùng chung cho cả dự án.
 * Không chặn phím hay ghi đè value lúc đang gõ: Unikey/EVKey chèn ký tự trung gian (tùy bộ gõ,
 * có thể là dấu câu/ký hiệu) rồi backspace để đặt dấu; chặn nó thì backspace xóa nhầm chữ
 * trước (VIỆT → ỆT). Số/ký hiệu được dọn sau khi ngừng gõ; chữ hoa lúc gõ chỉ là CSS,
 * viết hoa thật khi rời ô.
 */
export const NameInput = React.forwardRef<HTMLInputElement, Props>(
  (
    { value, onChange, onBlur, onCompositionStart, onCompositionEnd, className, preserveCase = false, ...rest },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const emitted = React.useRef(value ?? "");
    const composing = React.useRef(false);
    const cleanTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const setRef = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };
    const emit = (next: string) => {
      emitted.current = next;
      onChange(next);
    };
    const cancelClean = () => {
      if (cleanTimer.current) clearTimeout(cleanTimer.current);
      cleanTimer.current = null;
    };
    const scheduleClean = () => {
      cancelClean();
      cleanTimer.current = setTimeout(() => {
        cleanTimer.current = null;
        const el = innerRef.current;
        if (!el) return;
        if (composing.current) return scheduleClean();
        if (!hasBlockedTypingChar(el.value)) return;
        const caret = el.selectionStart ?? el.value.length;
        const before = stripBlockedTypingChars(el.value.slice(0, caret));
        el.value = before + stripBlockedTypingChars(el.value.slice(caret));
        if (document.activeElement === el) el.setSelectionRange(before.length, before.length);
        emit(el.value);
      }, CLEAN_DELAY_MS);
    };

    React.useEffect(() => cancelClean, []);

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
        onCompositionStart={(e) => {
          composing.current = true;
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          onCompositionEnd?.(e);
        }}
        onChange={(e) => {
          emit(e.target.value);
          if (hasBlockedTypingChar(e.target.value)) scheduleClean();
          else cancelClean();
        }}
        onBlur={(e) => {
          cancelClean();
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
