import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatVND } from "@/lib/mock-data";
import type { OrderX } from "@/lib/store";
import {
  invoiceBuyerProfiles,
  type InvoiceBuyerProfile,
  issueOrderInvoice,
  orderInvoiceViewLink,
  saveOrderInvoiceInfo,
} from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { isValidVietnamTaxCode, normalizeTaxCode } from "@/lib/vn-tax-code";
import {
  INVOICE_TYPE_LABEL,
  invoiceDeadlineOf,
  isPastDeadline,
  orderPaidAt,
  paidAtWarehouseIn,
  payerPhoneOf,
} from "@/lib/invoice-policy";
import { TaxCodeInput } from "@/components/TaxCodeInput";
import { BuyerProfileChips } from "@/components/BuyerProfileChips";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ISSUED: { text: "Đã xuất", cls: "bg-emerald-100 text-emerald-800" },
  DUPLICATE: { text: "Đã xuất (trùng RefID)", cls: "bg-emerald-100 text-emerald-800" },
  MANUAL: { text: "Kế toán bỏ xuất tự động", cls: "bg-indigo-100 text-indigo-800" },
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

/**
 * Thông tin xuất HĐĐT công ty: nhập / sửa ở mọi trạng thái (khoá khi đã xuất hoặc kế toán đã tích). Đã tới mốc
 * thanh toán (gửi trả: nhập kho gửi; còn lại: giao thành công) thì xuất MISA ngay được; quá 3 tiếng là xuất muộn.
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
  const marked = status === "MANUAL";
  const badge = STATUS_LABEL[status];
  const paidAt = orderPaidAt(order);
  const deadline = invoiceDeadlineOf(order);
  const late = isPastDeadline(deadline);
  const issueMode = paidAt != null && canIssue;
  // Đơn đã tích bỏ xuất tự động: chỉ còn xuất DN bằng tay (không lưu / bỏ yêu cầu).
  const editable = !issued && (marked ? issueMode : issueMode || canEditInfo);
  const showForm = editable && expanded;
  const payerPhone = payerPhoneOf(order);
  const profilePhones = [payerPhone, order.senderPhone, order.receiverPhone]
    .map((p) => (p ?? "").replace(/\D/g, ""))
    .filter((p, i, all) => p.length >= 9 && all.indexOf(p) === i);

  useEffect(() => {
    setExpanded(false);
  }, [order.code]);

  // Thông tin HĐ công ty lưu theo SĐT người gửi hoặc người nhận: mở form thì điền lại lần gần nhất.
  const [profiles, setProfiles] = useState<InvoiceBuyerProfile[]>([]);
  const profilePhoneKey = profilePhones.join("|");
  useEffect(() => {
    setProfiles([]);
    if (!showForm || !profilePhoneKey || !isApiEnabled()) return;
    let cancelled = false;
    (async () => {
      let source = "";
      let list: InvoiceBuyerProfile[] = [];
      for (const phone of profilePhoneKey.split("|")) {
        list = await invoiceBuyerProfiles(phone).catch(() => []);
        if (list.length) {
          source = phone;
          break;
        }
      }
      if (cancelled || !list.length) return;
      setProfiles(list);
      if (order.invoiceTaxCode) return;
      const p = list[0];
      setTaxCode((cur) => cur || p.taxCode || "");
      setCompanyName((cur) => cur || p.companyName || "");
      setAddress((cur) => cur || p.address || "");
      setEmail((cur) => cur || p.email || "");
      toast.message(
        list.length > 1
          ? `SĐT ${source} có ${list.length} MST — đã điền MST dùng gần nhất, bấm để chọn MST khác`
          : `Đã điền thông tin công ty lần gần nhất của SĐT ${source}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [showForm, order.code, order.invoiceTaxCode, profilePhoneKey]);

  const pickProfile = (p: InvoiceBuyerProfile) => {
    setTaxCode(p.taxCode ?? "");
    setCompanyName(p.companyName ?? "");
    setAddress(p.address ?? "");
    if (p.email) setEmail(p.email);
  };

  if (!issued && !marked && !editable && !order.invoiceRequested) return null;

  const validate = (): boolean => {
    const fail = (msg: string) => {
      toast.error(msg);
      return false;
    };
    const tax = taxCode.trim();
    if (!tax) return fail("Nhập mã số thuế người mua");
    if (!isValidVietnamTaxCode(tax))
      return fail("Mã số thuế không hợp lệ (sai định dạng hoặc checksum)");
    if (!companyName.trim()) return fail("Chưa có tên công ty — bấm Tra để lấy thông tin theo MST");
    if (!address.trim()) return fail("Chưa có địa chỉ công ty — bấm Tra để lấy thông tin theo MST");
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
      (late ? `⚠ XUẤT MUỘN: đã quá 3 tiếng kể từ thanh toán (hạn ${formatDateTime(deadline!.toISOString())}).\n\n` : "") +
        (marked ? "Đơn đang Bỏ xuất tự động — xuất xong sẽ chuyển sang Đã xuất DN.\n\n" : "") +
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

      {editable && late && issueMode ? (
        <div className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          Đã quá 3 tiếng kể từ thanh toán (hạn {formatDateTime(deadline!.toISOString())}) — xuất bây giờ là xuất muộn.
        </div>
      ) : null}
      {marked ? (
        <div className={cn("space-y-1 text-xs", editable && "mb-1.5")}>
          <Row label="Trạng thái" value="Không tự xuất / xuất bù" />
          <Row label="Ngày tích" value={order.invoiceIssuedAt ? formatDateTime(order.invoiceIssuedAt) : null} />
          {order.invoiceError ? (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              Lần xuất DN trước lỗi: {order.invoiceError}
            </div>
          ) : null}
        </div>
      ) : null}
      {issued ? (
        <div className="space-y-1 text-xs">
          <Row label="Loại HĐ" value={INVOICE_TYPE_LABEL[order.invoiceType ?? ""] ?? null} />
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
          {order.invoiceType === "PERSONAL" ? null : (
            <>
              <Row label="MST" value={order.invoiceTaxCode} />
              <Row label="Công ty" value={order.invoiceCompanyName} />
              <Row label="Email" value={order.invoiceEmail} />
            </>
          )}
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
      ) : editable && !expanded ? (
        <div className="space-y-1.5">
          {order.invoiceRequested && !marked ? (
            <div className="space-y-1 text-xs">
              <Row label="MST" value={order.invoiceTaxCode} />
              <Row label="Công ty" value={order.invoiceCompanyName} />
              <Row label="Email" value={order.invoiceEmail} />
            </div>
          ) : null}
          {status === "FAILED" && order.invoiceError ? (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              Lần xuất trước lỗi: {order.invoiceError}
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full gap-1.5 bg-white text-xs"
            onClick={() => setExpanded(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            {issueMode
              ? status === "FAILED"
                ? "Xuất lại hoá đơn"
                : "Xuất hoá đơn công ty"
              : order.invoiceRequested
                ? "Sửa thông tin hoá đơn"
                : "Nhập thông tin xuất hoá đơn"}
          </Button>
        </div>
      ) : editable ? (
        <div className="space-y-1.5">
          {marked ? null : !issueMode && order.status !== "CANCELLED" && order.status !== "RETURNED" ? (
            <div className="text-[11px] text-sky-800">
              Khách cần yêu cầu HĐ công ty trước hạn: 3 tiếng sau khi thanh toán (
              {paidAtWarehouseIn(order.collectForm) ? "nhập kho gửi" : "giao thành công"}) và đơn đã giao thành công.
            </div>
          ) : !late && deadline ? (
            <div className="text-[11px] text-sky-800">
              Hạn nhận yêu cầu HĐ công ty: {formatDateTime(deadline.toISOString())}
            </div>
          ) : !deadline && issueMode ? (
            <div className="text-[11px] text-sky-800">
              Hạn nhận yêu cầu HĐ công ty: khi đơn đã giao thành công và quá 3 tiếng kể từ thanh toán.
            </div>
          ) : null}
          {status === "FAILED" && order.invoiceError ? (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              Lần xuất trước lỗi: {order.invoiceError}
            </div>
          ) : null}
          <BuyerProfileChips
            phone={payerPhone}
            profiles={profiles}
            selectedTaxCode={taxCode}
            disabled={busy}
            onPick={pickProfile}
          />
          <TaxCodeInput
            className="h-8 bg-white text-xs"
            placeholder="Mã số thuế *"
            value={taxCode}
            disabled={busy}
            onChange={setTaxCode}
            onFound={(info) => {
              setCompanyName(info.companyName);
              setAddress(info.address);
            }}
          />
          <Input
            className="h-8 bg-muted text-xs"
            placeholder="Tên công ty — tự điền theo MST"
            value={companyName}
            readOnly
            tabIndex={-1}
          />
          <Input
            className="h-8 bg-muted text-xs"
            placeholder="Địa chỉ công ty — tự điền theo MST"
            value={address}
            readOnly
            tabIndex={-1}
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
          <div className="flex gap-1.5">
            {canEditInfo && !marked ? (
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
            ) : null}
            {canEditInfo && !marked && order.invoiceRequested ? (
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
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("h-8 text-xs", (!canEditInfo || marked) && "flex-1")}
              disabled={busy}
              onClick={() => setExpanded(false)}
            >
              Đóng
            </Button>
          </div>
        </div>
      ) : marked ? null : (
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
