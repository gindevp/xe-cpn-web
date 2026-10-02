import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  invoiceBackfillStatus,
  startInvoiceBackfill,
  type InvoiceBackfillStatus,
} from "@/lib/api/domain-api";

const RESULT_LABEL: Record<string, string> = {
  ISSUED: "đã xuất",
  DUPLICATE: "đã có sẵn trên MISA",
  FAILED: "lỗi MISA",
  ERROR: "lỗi hệ thống",
  ALREADY: "đã xuất / bỏ xuất tự động từ trước",
  NOT_PAID_YET: "chưa tới mốc thanh toán",
  UNPAID_RESIDUE: "còn nợ cước",
  RETURNING: "đơn huỷ giao / hoàn",
  SKIPPED: "bỏ qua (cước 0đ)",
  NOT_FOUND: "không tìm thấy",
};

function summary(s: InvoiceBackfillStatus) {
  return Object.entries(s.results)
    .map(([k, n]) => `${n} ${RESULT_LABEL[k] ?? k}`)
    .join(" · ");
}

/**
 * Xuất bù HĐĐT cho danh sách đơn (DN nếu đơn có yêu cầu kèm MST, còn lại cá nhân). BE chạy nền một luồng;
 * nút tự theo dõi tiến độ tới khi xong rồi gọi {@code onDone}.
 */
export function InvoiceBackfillButton({
  orderCodes,
  lateCount = 0,
  label,
  onDone,
  size = "sm",
}: {
  orderCodes: string[];
  lateCount?: number;
  label?: string;
  onDone: () => void;
  size?: "sm" | "default";
}) {
  const [status, setStatus] = useState<InvoiceBackfillStatus | null>(null);
  const timer = useRef<number | null>(null);

  const stopPolling = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => stopPolling, []);

  const poll = () => {
    timer.current = window.setTimeout(async () => {
      try {
        const s = await invoiceBackfillStatus();
        setStatus(s);
        if (s.running) {
          poll();
          return;
        }
        stopPolling();
        setStatus(null);
        const failed = s.failedCodes.length ? `\nĐơn lỗi: ${s.failedCodes.slice(0, 20).join(", ")}` : "";
        (s.results.FAILED || s.results.ERROR ? toast.error : toast.success)(`Xuất bù xong: ${summary(s)}${failed}`, {
          duration: 12000,
        });
        onDone();
      } catch (e) {
        stopPolling();
        setStatus(null);
        toast.error(e instanceof Error ? e.message : "Không theo dõi được tiến độ xuất bù");
      }
    }, 2000);
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Số đơn lúc mở popup — danh sách có thể đổi khi popup đang mở (tải lại, chọn thêm). */
  const [confirmCodes, setConfirmCodes] = useState<string[]>([]);

  const askConfirm = () => {
    if (!orderCodes.length) {
      toast.message("Không có đơn nào chưa xuất hoá đơn");
      return;
    }
    setConfirmCodes(orderCodes);
    setConfirmOpen(true);
  };

  const start = async () => {
    setConfirmOpen(false);
    try {
      const s = await startInvoiceBackfill(confirmCodes);
      setStatus(s);
      poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không bắt đầu được xuất bù");
    }
  };

  const running = status?.running;
  return (
    <>
      <Button size={size} onClick={askConfirm} disabled={running || !orderCodes.length}>
        {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
        {running ? `Đang xuất ${status!.done}/${status!.total}…` : (label ?? `Xuất bù HĐ (${orderCodes.length})`)}
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xuất bù hoá đơn cho {confirmCodes.length} đơn?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Hệ thống sẽ xuất hoá đơn điện tử <b>thật</b> qua MISA cho{" "}
                  <b>{confirmCodes.length} đơn chưa xuất</b>:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Đơn có yêu cầu HĐ công ty (kèm MST) → xuất HĐ doanh nghiệp.</li>
                  <li>Còn lại → xuất HĐ cá nhân theo tên + SĐT người trả cước, hình thức tiền mặt.</li>
                </ul>
                {lateCount > 0 ? (
                  <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                    {lateCount} đơn đã quá 3 tiếng kể từ thanh toán — sẽ là xuất muộn.
                  </p>
                ) : null}
                <p className="font-medium text-destructive">
                  Hoá đơn đã phát hành không huỷ được trên hệ thống này.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => void start()}>
              Xác nhận xuất {confirmCodes.length} HĐ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
