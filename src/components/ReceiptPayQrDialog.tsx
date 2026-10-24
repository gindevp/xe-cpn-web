import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, Copy, Loader2, X } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchReceiptTransferQr, type ReceiptTransferQr } from "@/lib/api/finance-config-api";
import { formatVND } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Props = {
  receiptCode: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function remainLabel(expiresAt?: string | null): string {
  if (!expiresAt) return "—";
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return "—";
  const ms = Math.max(0, end - Date.now());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function moneyLabel(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatVND(n).replace(/\s*VNĐ$/i, "").trim()} VNĐ`;
}

/** Sau tạo phiếu thu: hiện QR chuyển khoản; KT xác nhận thu → màn thành công. */
export function ReceiptPayQrDialog({ receiptCode, open, onOpenChange }: Props) {
  const [pay, setPay] = useState<ReceiptTransferQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null);

  const paid = Boolean(pay?.confirmedAt);
  const onePay = Boolean(pay?.transfer?.qrData?.trim());

  useEffect(() => {
    if (!open || !receiptCode) {
      setPay(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const r = await fetchReceiptTransferQr(receiptCode);
        if (!cancelled) setPay(r);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Không tải được QR thu");
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, receiptCode, onOpenChange]);

  // Đếm ngược + poll trạng thái (KT confirm hoặc OnePay IPN tự xác nhận).
  useEffect(() => {
    if (!open || !receiptCode || paid) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      void fetchReceiptTransferQr(receiptCode)
        .then((r) => setPay(r))
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, receiptCode, paid]);

  useEffect(() => {
    const data = pay?.transfer?.qrData?.trim();
    if (!data) {
      setQrImg(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(data, { margin: 1, width: 280, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setQrImg(url);
      })
      .catch(() => {
        if (!cancelled) setQrImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pay?.transfer?.qrData]);

  const remain = useMemo(() => remainLabel(pay?.expiresAt), [pay?.expiresAt, tick]);
  const qrSrc = qrImg || pay?.transfer?.qrUrl || null;

  const copyAccount = async () => {
    const no = pay?.transfer?.accountNo?.trim();
    if (!no) return;
    try {
      await navigator.clipboard.writeText(no.replace(/\s+/g, ""));
      setCopied(true);
      toast.success("Đã chép số tài khoản");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không chép được số tài khoản");
    }
  };

  const transfer = pay?.transfer;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden border-0 p-0 shadow-xl sm:rounded-2xl",
          paid ? "max-w-md" : "max-w-2xl",
          "[&>button.absolute]:hidden",
        )}
      >
        <DialogTitle className="sr-only">
          {paid ? "Thanh toán thành công" : "Quét QR để thanh toán"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {paid ? `Phiếu thu ${receiptCode}` : `QR chuyển khoản phiếu ${receiptCode}`}
        </DialogDescription>

        {paid ? (
          <div className="relative px-6 pb-6 pt-8 text-center">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" strokeWidth={2.25} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Thanh toán thành công</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Phiếu thu <span className="font-semibold text-foreground">{pay?.receiptCode ?? receiptCode}</span> đã
              được tạo và ghi nhận.
            </p>
            <div className="mt-5 space-y-2.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Số tiền</span>
                <span className="font-bold tabular-nums text-orange-500">{moneyLabel(pay?.amount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Trạng thái</span>
                <span className="font-semibold text-emerald-600">Đã thanh toán</span>
              </div>
            </div>
            <Button className="mt-6 h-11 w-full text-base" onClick={() => onOpenChange(false)}>
              Hoàn tất
            </Button>
          </div>
        ) : (
          <div className="relative px-5 pb-5 pt-5 sm:px-6">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pr-8">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Quét QR để thanh toán</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Phiếu thu <span className="font-medium text-foreground">{receiptCode}</span>
              </p>
            </div>

            {loading && !pay ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Đang tạo mã QR…
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-start">
                  <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                    {qrSrc ? (
                      <img src={qrSrc} alt={`QR ${receiptCode}`} className="h-full w-full object-contain" />
                    ) : (
                      <p className="px-2 text-center text-xs text-amber-800">
                        {onePay
                          ? "OnePay chưa trả mã QR. Thử lại hoặc kiểm tra cấu hình thu hộ."
                          : "Chưa cấu hình tài khoản nhận tiền nộp (Bảo trì → TK nộp tiền) hoặc chưa bật thu hộ phiếu thu. Phiếu đã tạo."}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Số tiền chuyển khoản
                      </div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-orange-500 sm:text-3xl">
                        {moneyLabel(pay?.amount)}
                      </div>
                    </div>
                    <dl className="space-y-2.5 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Ngân hàng</dt>
                        <dd className="font-medium text-right">
                          {transfer?.bankName || transfer?.bankBin || "—"}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Số tài khoản</dt>
                        <dd className="flex items-center gap-1.5 font-mono font-semibold">
                          {transfer?.accountNo || "—"}
                          {transfer?.accountNo ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-sky-600 hover:bg-sky-50"
                              onClick={() => void copyAccount()}
                              title="Chép số tài khoản"
                            >
                              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Nội dung</dt>
                        <dd className="max-w-[70%] break-all text-right font-mono font-semibold">
                          {transfer?.content || receiptCode || "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 text-sm text-orange-600">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    Mã QR có hiệu lực trong <span className="font-semibold tabular-nums">{remain}</span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {onePay
                    ? "Sau khi chuyển khoản đúng số tiền, hệ thống thu hộ tự xác nhận đã thu — màn này sẽ chuyển sang thành công."
                    : "Sau khi chuyển khoản, kế toán xác nhận thu trên Danh sách phiếu thu — màn này sẽ tự chuyển sang thành công."}
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
