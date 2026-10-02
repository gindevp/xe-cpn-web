import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentProps } from "react";

/**
 * Ô nhập API key / token. Không dùng type="password": Chrome bỏ qua autoComplete="off" với ô mật khẩu
 * và tự điền mật khẩu đăng nhập đã lưu vào đây.
 */
export const SecretInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          className={cn("pr-9", !show && "[-webkit-text-security:disc]", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ẩn" : "Hiện"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
SecretInput.displayName = "SecretInput";
