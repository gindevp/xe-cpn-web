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
  placeholder = "MST công ty / CCCD chủ hộ kinh doanh",
  className,
  lookupFn = lookupTaxCode,
  forCustomer = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onFound: (info: { companyName: string; address: string }) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  lookupFn?: typeof lookupTaxCode;
  /** Trang khách tự tra: lời nhắn nói với khách thay vì nhân viên. */
  forCustomer?: boolean;
}) {
  const failedText = forCustomer
    ? `Chưa tra được MST. Vui lòng thử lại hoặc gọi tổng đài ${HOTLINE} để được hỗ trợ.`
    : LOOKUP_FAILED_TEXT;
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string; warn?: boolean } | null>(null);
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
      const r = await lookupFn(compactTaxCode(raw));
      if (id !== seq.current) return;
      if (r.ok && r.companyName) {
        onFoundRef.current({ companyName: r.companyName, address: r.address ?? "" });
        const kind = r.orgType && /hộ kinh doanh|cá nhân/i.test(r.orgType) ? ` (${r.orgType})` : "";
        setNote(
          r.active === false && !forCustomer
            ? {
                ok: true,
                warn: true,
                text: `Đã điền theo MST${kind} — trạng thái: ${r.status}. Kiểm tra lại với khách trước khi xuất HĐ.`,
              }
            : { ok: true, text: `Đã điền tên, địa chỉ theo MST${kind}` },
        );
      } else if (r.code === "NOT_FOUND" || (forCustomer && r.message)) {
        setNote({
          ok: false,
          text: forCustomer
            ? r.message || "Không tìm thấy doanh nghiệp với MST này — vui lòng kiểm tra lại"
            : "Không tìm thấy doanh nghiệp với MST này — kiểm tra lại MST với khách",
        });
      } else {
        setNote({ ok: false, text: failedText });
      }
    } catch (e) {
      if (id === seq.current)
        setNote({ ok: false, text: forCustomer && e instanceof Error && e.message ? e.message : failedText });
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
        <div
          className={cn(
            "text-[11px]",
            note.warn ? "font-medium text-amber-700" : note.ok ? "text-emerald-700" : "font-medium text-red-700",
          )}
        >
          {note.text}
        </div>
      ) : null}
    </div>
  );
}
