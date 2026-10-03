import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaxCodeInput } from "@/components/TaxCodeInput";
import { trackInvoiceSubmit, trackInvoiceTaxLookup } from "@/lib/api/domain-api";
import { compactTaxCode, isValidVietnamTaxCode } from "@/lib/vn-tax-code";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TrackInvoiceState = "NONE" | "REQUESTED" | "ISSUED" | "OFFICE";

/**
 * Trang tra cứu: người trả cước tự yêu cầu HĐĐT công ty. BE quyết định lưu (chờ tự xuất khi giao)
 * hay xuất MISA ngay; tên / địa chỉ công ty luôn lấy theo MST.
 */
export function TrackInvoiceBox({
  code,
  phone,
  state,
  invoiceNo,
  onChanged,
}: {
  code: string;
  phone: string;
  state: TrackInvoiceState;
  invoiceNo?: string;
  onChanged: (next: { state: TrackInvoiceState; invoiceNo?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [taxCode, setTaxCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (state === "ISSUED") {
    return (
      <div className="mt-3 rounded-2xl bg-white p-4 text-sm shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-emerald-700">
          <FileText className="h-4 w-4" />
          Đã xuất hoá đơn{invoiceNo ? ` số ${invoiceNo}` : ""}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Hoá đơn điện tử đã được gửi về email đăng ký.</p>
      </div>
    );
  }
  if (state === "OFFICE") {
    return (
      <div className="mt-3 rounded-2xl bg-white p-4 text-sm text-muted-foreground shadow-sm">
        Hoá đơn của đơn này đang được văn phòng xử lý.
      </div>
    );
  }

  const valid = () => {
    if (!isValidVietnamTaxCode(taxCode.trim())) return "Mã số thuế không hợp lệ";
    if (!companyName) return "Chưa tra được tên công ty — bấm Tra sau khi nhập MST";
    if (!EMAIL_RE.test(email.trim())) return "Email nhận hoá đơn không hợp lệ";
    return null;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await trackInvoiceSubmit(code, phone, compactTaxCode(taxCode.trim()), email.trim());
      if (r.action === "ISSUED") {
        toast.success(r.message);
        onChanged({ state: "ISSUED", invoiceNo: r.invoiceNo });
      } else if (r.action === "SAVED") {
        toast.success(r.message);
        onChanged({ state: "REQUESTED" });
      } else {
        toast.message(r.message);
        onChanged({ state: "OFFICE" });
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gửi được yêu cầu hoá đơn");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        {state === "REQUESTED" ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Đã lưu yêu cầu hoá đơn công ty — hệ thống sẽ tự xuất và gửi email khi đơn đủ điều kiện.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full rounded-xl border-primary/40 bg-white text-base font-semibold"
          onClick={() => {
            setConfirming(false);
            setOpen(true);
          }}
        >
          <FileText className="mr-2 h-5 w-5" />
          {state === "REQUESTED" ? "Sửa / xuất hoá đơn công ty" : "Xuất hoá đơn"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Xuất hoá đơn công ty</DialogTitle>
          </DialogHeader>

          {!confirming ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Chỉ người thanh toán cước được yêu cầu. Hoá đơn gửi về email bạn nhập; yêu cầu trong vòng 3 tiếng kể từ khi
                thanh toán.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Mã số thuế *</Label>
                <TaxCodeInput
                  className="h-11"
                  value={taxCode}
                  disabled={busy}
                  onChange={setTaxCode}
                  onFound={(info) => {
                    setCompanyName(info.companyName);
                    setAddress(info.address);
                  }}
                  lookupFn={(mst) => trackInvoiceTaxLookup(code, phone, mst)}
                  forCustomer
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tên công ty</Label>
                <Input className="h-11 bg-muted" placeholder="Tự điền theo MST" value={companyName} readOnly tabIndex={-1} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Địa chỉ</Label>
                <Input className="h-11 bg-muted" placeholder="Tự điền theo MST" value={address} readOnly tabIndex={-1} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email nhận hoá đơn *</Label>
                <Input
                  className="h-11"
                  type="email"
                  inputMode="email"
                  placeholder="email@congty.vn"
                  value={email}
                  maxLength={120}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className="h-12 w-full rounded-xl text-base font-semibold"
                onClick={() => {
                  const err = valid();
                  if (err) {
                    toast.error(err);
                    return;
                  }
                  setConfirming(true);
                }}
              >
                Tiếp tục
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="font-medium">Kiểm tra lại thông tin trước khi gửi:</p>
              <div className="space-y-1.5 rounded-xl bg-muted/60 p-3">
                <div>
                  <span className="text-muted-foreground">MST: </span>
                  <b>{compactTaxCode(taxCode.trim())}</b>
                </div>
                <div>
                  <span className="text-muted-foreground">Công ty: </span>
                  <b>{companyName}</b>
                </div>
                <div>
                  <span className="text-muted-foreground">Địa chỉ: </span>
                  {address || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  <b>{email.trim()}</b>
                </div>
              </div>
              <p className="text-xs text-amber-700">
                Hoá đơn đã phát hành không sửa / huỷ được. Nếu đơn đã thanh toán, hoá đơn sẽ được xuất ngay.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Sửa lại
                </Button>
                <Button
                  type="button"
                  className="h-12 rounded-xl text-base font-semibold"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Gửi xuất HĐ
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
