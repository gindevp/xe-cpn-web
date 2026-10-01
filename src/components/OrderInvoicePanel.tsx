import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatVND } from "@/lib/mock-data";
import type { OrderX } from "@/lib/store";
import { issueOrderInvoice, orderInvoiceViewLink } from "@/lib/api/domain-api";
import { isValidVietnamTaxCode, normalizeTaxCode } from "@/lib/vn-tax-code";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ISSUED: { text: "Đã xuất", cls: "bg-emerald-100 text-emerald-800" },
  DUPLICATE: { text: "Đã xuất (trùng RefID)", cls: "bg-emerald-100 text-emerald-800" },
  FAILED: { text: "Lỗi", cls: "bg-red-100 text-red-800" },
  PENDING: { text: "Đang xuất", cls: "bg-amber-100 text-amber-800" },
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

/** Xuất HĐĐT MISA cho đơn đã giao thành công — MISA gửi HĐ về email người mua. */
export function OrderInvoicePanel({
  order,
  canIssue,
  onChanged,
}: {
  order: OrderX;
  canIssue: boolean;
  onChanged: () => void;
}) {
  const [taxCode, setTaxCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    setTaxCode(order.invoiceTaxCode ?? "");
    setCompanyName(order.invoiceCompanyName ?? "");
    setAddress(order.invoiceCompanyAddress ?? "");
    setEmail(order.invoiceEmail ?? "");
  }, [
    order.code,
    order.invoiceTaxCode,
    order.invoiceCompanyName,
    order.invoiceCompanyAddress,
    order.invoiceEmail,
  ]);

  const status = order.invoiceStatus ?? "";
  const issued = status === "ISSUED" || status === "DUPLICATE";
  const badge = STATUS_LABEL[status];

  if (!issued && !canIssue && !order.invoiceRequested) return null;

  const submit = async () => {
    const tax = taxCode.trim();
    if (!tax) return toast.error("Nhập mã số thuế người mua");
    if (!isValidVietnamTaxCode(tax)) return toast.error("Mã số thuế không hợp lệ (sai định dạng hoặc checksum)");
    if (!companyName.trim()) return toast.error("Nhập tên công ty");
    if (!address.trim()) return toast.error("Nhập địa chỉ công ty");
    if (!EMAIL_RE.test(email.trim())) return toast.error("Email nhận hoá đơn không hợp lệ");

    const ok = window.confirm(
      `Xuất hoá đơn điện tử THẬT qua MISA cho đơn ${order.code}?\n\n` +
        `MST: ${normalizeTaxCode(tax)}\nCông ty: ${companyName.trim()}\nĐịa chỉ: ${address.trim()}\n` +
        `Gửi về email: ${email.trim()}\n\nHoá đơn đã phát hành không huỷ được trên hệ thống này.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await issueOrderInvoice(order.code, {
        taxCode: tax,
        companyName: companyName.trim(),
        address: address.trim(),
        email: email.trim(),
      });
      if (res.invoiceStatus === "ISSUED" || res.invoiceStatus === "DUPLICATE") {
        toast.success(
          `Đã xuất hoá đơn${res.invoiceNo ? ` số ${res.invoiceNo}` : ""} — MISA gửi về ${email.trim()}`,
        );
      } else {
        toast.error(`MISA chưa xuất được hoá đơn: ${res.invoiceError || res.invoiceStatus || "không rõ lỗi"}`);
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xuất được hoá đơn");
    } finally {
      setBusy(false);
    }
  };

  const view = async () => {
    const win = window.open("", "_blank");
    setViewing(true);
    try {
      const url = await orderInvoiceViewLink(order.code);
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      toast.error(e instanceof Error ? e.message : "Không mở được hoá đơn");
    } finally {
      setViewing(false);
    }
  };

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/70 p-2.5 text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-sky-800">Hoá đơn điện tử (MISA)</div>
        {badge ? (
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", badge.cls)}>
            {badge.text}
          </span>
        ) : null}
      </div>

      {issued ? (
        <div className="space-y-1 text-xs">
          <Row label="Số HĐ" value={order.invoiceNo} />
          <Row label="Ký hiệu" value={order.invoiceSeries} />
          <Row label="Ngày xuất" value={order.invoiceIssuedAt ? formatDateTime(order.invoiceIssuedAt) : null} />
          <Row
            label="Tổng tiền (gồm VAT)"
            value={order.invoiceGrossAmount != null ? formatVND(order.invoiceGrossAmount) : null}
          />
          <Row label="MST" value={order.invoiceTaxCode} />
          <Row label="Công ty" value={order.invoiceCompanyName} />
          <Row label="Email" value={order.invoiceEmail} />
          {order.invoiceTransactionId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 w-full gap-1.5 text-xs"
              disabled={viewing}
              onClick={() => void view()}
            >
              {viewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Xem hoá đơn
            </Button>
          ) : null}
        </div>
      ) : canIssue ? (
        <div className="space-y-1.5">
          {status === "FAILED" && order.invoiceError ? (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              Lần xuất trước lỗi: {order.invoiceError}
            </div>
          ) : null}
          <Input
            className="h-8 bg-white text-xs"
            placeholder="Mã số thuế *"
            value={taxCode}
            disabled={busy}
            onChange={(e) => setTaxCode(e.target.value)}
          />
          <Input
            className="h-8 bg-white text-xs"
            placeholder="Tên công ty *"
            value={companyName}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <Input
            className="h-8 bg-white text-xs"
            placeholder="Địa chỉ công ty *"
            value={address}
            maxLength={255}
            disabled={busy}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Input
            className="h-8 bg-white text-xs"
            type="email"
            placeholder="Email nhận hoá đơn *"
            value={email}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 w-full gap-1.5 text-xs"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {status === "FAILED" ? "Xuất lại hoá đơn" : "Xác nhận & xuất hoá đơn"}
          </Button>
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          <Row label="MST" value={order.invoiceTaxCode} />
          <Row label="Công ty" value={order.invoiceCompanyName} />
          <Row label="Email" value={order.invoiceEmail} />
          <Row label="Địa chỉ" value={order.invoiceCompanyAddress} />
          {status === "FAILED" && order.invoiceError ? (
            <div className="text-[11px] text-red-700">Lỗi: {order.invoiceError}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
