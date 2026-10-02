import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupTaxCode } from "@/lib/api/domain-api";
import { cn } from "@/lib/utils";
import { compactTaxCode, isValidVietnamTaxCode } from "@/lib/vn-tax-code";

const AUTO_LOOKUP_DELAY_MS = 500;

/**
 * Ô MST: gõ xong MST hợp lệ thì tự tra tên + địa chỉ công ty (chỉ khi người dùng gõ — không ghi đè
 * dữ liệu đã lưu lúc mở form). Nút "Tra" để tra lại. Nhân viên vẫn sửa được các ô đã điền.
 */
export function TaxCodeInput({
  value,
  onChange,
  onFound,
  disabled,
  placeholder = "Nhập mã số thuế",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onFound: (info: { companyName: string; address: string }) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef(0);
  const seq = useRef(0);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const lookup = async (raw: string) => {
    window.clearTimeout(timer.current);
    if (!isValidVietnamTaxCode(raw)) {
      setNote({ ok: false, text: "MST không hợp lệ" });
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    setNote(null);
    try {
      const r = await lookupTaxCode(compactTaxCode(raw));
      if (id !== seq.current) return;
      if (r.ok && r.companyName) {
        onFoundRef.current({ companyName: r.companyName, address: r.address ?? "" });
        setNote({ ok: true, text: "Đã điền tên, địa chỉ theo MST — kiểm tra lại trước khi lưu" });
      } else {
        setNote({ ok: false, text: r.message ?? "Không tìm thấy doanh nghiệp — nhập tay" });
      }
    } catch {
      if (id === seq.current) setNote({ ok: false, text: "Không tra được MST — nhập tay" });
    } finally {
      if (id === seq.current) setLoading(false);
    }
  };

  const handleChange = (v: string) => {
    onChange(v);
    setNote(null);
    window.clearTimeout(timer.current);
    if (isValidVietnamTaxCode(v)) {
      timer.current = window.setTimeout(() => void lookup(v), AUTO_LOOKUP_DELAY_MS);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Input
          className={cn("flex-1", className)}
          placeholder={placeholder}
          value={value}
          inputMode="numeric"
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup(value);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className={cn("shrink-0", className)}
          disabled={disabled || loading || !value.trim()}
          onClick={() => void lookup(value)}
          title="Tra tên, địa chỉ công ty theo MST"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Tra
        </Button>
      </div>
      {loading ? (
        <div className="text-[11px] text-muted-foreground">Đang tra thông tin doanh nghiệp…</div>
      ) : note ? (
        <div className={cn("text-[11px]", note.ok ? "text-emerald-700" : "text-amber-700")}>
          {note.text}
        </div>
      ) : null}
    </div>
  );
}
