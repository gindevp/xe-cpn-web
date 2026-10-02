import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupTaxCode } from "@/lib/api/domain-api";
import { cn } from "@/lib/utils";
import { compactTaxCode, isValidVietnamTaxCode } from "@/lib/vn-tax-code";

const AUTO_LOOKUP_DELAY_MS = 500;
export const HOTLINE = "1900 1155";
const LOOKUP_FAILED_TEXT = `Tra cứu MST đang lỗi. Báo khách: MST lỗi, vui lòng báo cho tổng đài ${HOTLINE} để được hỗ trợ.`;

/**
 * Ô MST: gõ xong MST hợp lệ thì tự tra tên + địa chỉ công ty. Tên / địa chỉ chỉ lấy theo MST (không nhập tay),
 * nên đổi MST là xoá thông tin cũ (onFound với chuỗi rỗng) cho tới khi tra lại được.
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
        setNote({ ok: true, text: "Đã điền tên, địa chỉ theo MST" });
      } else if (r.code === "NOT_FOUND") {
        setNote({ ok: false, text: "Không tìm thấy doanh nghiệp với MST này — kiểm tra lại MST với khách" });
      } else {
        setNote({ ok: false, text: LOOKUP_FAILED_TEXT });
      }
    } catch {
      if (id === seq.current) setNote({ ok: false, text: LOOKUP_FAILED_TEXT });
    } finally {
      if (id === seq.current) setLoading(false);
    }
  };

  const handleChange = (v: string) => {
    onChange(v);
    onFoundRef.current({ companyName: "", address: "" });
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
        <div className={cn("text-[11px]", note.ok ? "text-emerald-700" : "font-medium text-red-700")}>
          {note.text}
        </div>
      ) : null}
    </div>
  );
}
