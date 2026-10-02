import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatVND } from "@/lib/mock-data";
import type { OrderX } from "@/lib/store";
import {
  issueOrderInvoice,
  orderInvoiceViewLink,
  saveOrderInvoiceInfo,
} from "@/lib/api/domain-api";
import { isValidVietnamTaxCode, normalizeTaxCode } from "@/lib/vn-tax-code";
import { TaxCodeInput } from "@/components/TaxCodeInput";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ISSUED: { text: "Đã xuất", cls: "bg-emerald-100 text-emerald-800" },
  DUPLICATE: { text: "Đã xuất (trùng RefID)", cls: "bg-emerald-100 text-emerald-800" },
  FAILED: { text: "Lỗi", cls: "bg-red-100 text-red-800" },
  PENDING: { text: "Đang xuất", cls: "bg-amber-100 text-amber-800" },
};

const DELIVERED_ACTIONS = new Set(["POD", "POD_QUAY", "DELIVERED", "TRANSITION_DELIVERED"]);

function vnDay(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Ngày giao thành công (giờ VN) theo sự kiện POD gần nhất; không có lịch sử thì null. */
function deliveredDay(order: OrderX): string | null {
  const ev = [...(order.events ?? [])].reverse().find((e) => DELIVERED_ACTIONS.has(String(e.action).toUpperCase()));
  return ev?.at ? vnDay(ev.at) : null;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

/**
 * Thông tin xuất HĐĐT: nhập / sửa ở mọi trạng thái (khoá khi đã xuất thành công). Đơn đã giao thì xuất MISA ngay;
 * đơn chưa giao có thông tin sẽ tự xuất khi giao thành công.
 */
export function OrderInvoicePanel({
  order,
  canIssue,
  canEditInfo,
  onChanged,
}: {
  order: OrderX;
  canIssue: boolean;
  canEditInfo: boolean;
  onChanged: () => void;
}) {
  const [taxCode, setTaxCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
  const delivered = order.status === "DELIVERED";
  // Kế toán: xuất HĐ muộn hơn ngày giao bị phạt — BE chặn cùng rule.
  const deliveryDay = delivered ? deliveredDay(order) : null;
  const dayPassed = deliveryDay != null && deliveryDay < vnDay(new Date());
  const issueMode = delivered && canIssue && !dayPassed;
  const editable = !issued && !dayPassed && (issueMode || canEditInfo);

  useEffect(() => {
    setExpanded(false);
  }, [order.code]);

  if (!issued && !editable && !order.invoiceRequested && !(dayPassed && canIssue)) return null;

  const validate = (): boolean => {
    const fail = (msg: string) => {
      toast.error(msg);
      return false;
    };
    const tax = taxCode.trim();
    if (!tax) return fail("Nhập mã số thuế người mua");
    if (!isValidVietnamTaxCode(tax))
      return fail("Mã số thuế không hợp lệ (sai định dạng hoặc checksum)");
    if (!companyName.trim()) return fail("Nhập tên công ty");
    if (!address.trim()) return fail("Nhập địa chỉ công ty");
    if (!EMAIL_RE.test(email.trim())) return fail("Email nhận hoá đơn không hợp lệ");
    return true;
  };

  const saveInfo = async (requested: boolean) => {
    if (requested && !validate()) return;
    if (!requested && !window.confirm(`Bỏ yêu cầu xuất hoá đơn của đơn ${order.code}?`)) return;
    setBusy(true);
    try {
      await saveOrderInvoiceInfo(
        order.code,
        requested
          ? {
              requested: true,
              taxCode: taxCode.trim(),
              companyName: companyName.trim(),
              address: address.trim(),
              email: email.trim(),
            }
          : { requested: false },
      );
      toast.success(requested ? "Đã lưu thông tin hoá đơn" : "Đã bỏ yêu cầu xuất hoá đơn");
      setExpanded(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được thông tin hoá đơn");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!validate()) return;
    const tax = taxCode.trim();

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
        toast.error(
          `MISA chưa xuất được hoá đơn: ${res.invoiceError || res.invoiceStatus || "không rõ lỗi"}`,
        );
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

      {!issued && dayPassed && canIssue ? (
        <div className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          Chỉ xuất hoá đơn trong ngày giao thành công ({deliveryDay!.split("-").reverse().join("/")}) — đã quá hạn.
        </div>
      ) : null}
      {issued ? (
        <div className="space-y-1 text-xs">
          <Row label="Số HĐ" value={order.invoiceNo} />
          <Row label="Ký hiệu" value={order.invoiceSeries} />
          <Row
            label="Ngày xuất"
            value={order.invoiceIssuedAt ? formatDateTime(order.invoiceIssuedAt) : null}
          />
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
              {viewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              Xem hoá đơn
            </Button>
          ) : null}
        </div>
      ) : editable && !issueMode && !order.invoiceRequested && !expanded ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full gap-1.5 bg-white text-xs"
          onClick={() => setExpanded(true)}
        >
          <FileText className="h-3.5 w-3.5" />
          Nhập thông tin xuất hoá đơn
        </Button>
      ) : editable ? (
        <div className="space-y-1.5">
          {!delivered && order.status !== "CANCELLED" && order.status !== "RETURNED" ? (
            <div className="text-[11px] text-sky-800">
              Đơn sẽ tự xuất hoá đơn khi giao thành công.
            </div>
          ) : null}
          {status === "FAILED" && order.invoiceError ? (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              Lần xuất trước lỗi: {order.invoiceError}
            </div>
          ) : null}
          <TaxCodeInput
            className="h-8 bg-white text-xs"
            placeholder="Mã số thuế *"
            value={taxCode}
            disabled={busy}
            onChange={setTaxCode}
            onFound={(info) => {
              setCompanyName(info.companyName);
              if (info.address) setAddress(info.address);
            }}
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
          {issueMode ? (
            <Button
              type="button"
              size="sm"
              className="h-8 w-full gap-1.5 text-xs"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {status === "FAILED" ? "Xuất lại hoá đơn" : "Xác nhận & xuất hoá đơn"}
            </Button>
          ) : null}
          {canEditInfo ? (
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={issueMode ? "outline" : "default"}
                className="h-8 flex-1 gap-1.5 text-xs"
                disabled={busy}
                onClick={() => void saveInfo(true)}
              >
                {busy && !issueMode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Lưu thông tin
              </Button>
              {order.invoiceRequested ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-destructive"
                  disabled={busy}
                  onClick={() => void saveInfo(false)}
                >
                  Bỏ xuất HĐ
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => setExpanded(false)}
                >
                  Đóng
                </Button>
              )}
            </div>
          ) : null}
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
