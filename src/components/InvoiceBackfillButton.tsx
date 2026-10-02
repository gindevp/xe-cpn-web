import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  ALREADY: "đã xuất/tích từ trước",
  NOT_PAID_YET: "chưa tới mốc thanh toán",
  UNPAID_RESIDUE: "còn nợ cước",
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

  const start = async () => {
    if (!orderCodes.length) {
      toast.message("Không có đơn nào chưa xuất hoá đơn");
      return;
    }
    const ok = window.confirm(
      `Xuất hoá đơn điện tử THẬT qua MISA cho ${orderCodes.length} đơn chưa xuất?\n\n` +
        "• Đơn có yêu cầu HĐ công ty (kèm MST) → xuất HĐ doanh nghiệp.\n" +
        "• Còn lại → xuất HĐ cá nhân theo tên + SĐT người trả cước, hình thức tiền mặt.\n" +
        (lateCount > 0 ? `\n⚠ ${lateCount} đơn đã quá 3 tiếng kể từ thanh toán — sẽ là xuất muộn.\n` : "") +
        "\nHoá đơn đã phát hành không huỷ được trên hệ thống này.",
    );
    if (!ok) return;
    try {
      const s = await startInvoiceBackfill(orderCodes);
      setStatus(s);
      poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không bắt đầu được xuất bù");
    }
  };

  const running = status?.running;
  return (
    <Button size={size} onClick={() => void start()} disabled={running || !orderCodes.length}>
      {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
      {running ? `Đang xuất ${status!.done}/${status!.total}…` : (label ?? `Xuất bù HĐ (${orderCodes.length})`)}
    </Button>
  );
}
