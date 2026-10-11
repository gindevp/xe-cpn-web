import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/mock-data";
import { INVOICE_ERROR_EVENT, type InvoiceErrorPayload } from "@/lib/use-realtime-sync";

const MAX_ITEMS = 20;
const MUTE_KEY_PREFIX = "cpn:invoice-alert-muted:";

function todayVn() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function mutedToday(username: string) {
  try {
    return localStorage.getItem(MUTE_KEY_PREFIX + username) === todayVn();
  } catch {
    return false;
  }
}

function muteToday(username: string) {
  try {
    localStorage.setItem(MUTE_KEY_PREFIX + username, todayVn());
  } catch {
    /* trình duyệt chặn localStorage — popup sẽ hiện lại, chấp nhận được */
  }
}

/**
 * Popup khi xuất HĐ MISA hết 3 lần hoặc thiếu dữ liệu — cùng nhóm người nhận với lỗi Auto Call.
 * Đóng popup thì không báo lại trong ngày (theo tài khoản, trên trình duyệt đó).
 */
export function InvoiceErrorAlert() {
  const navigate = useNavigate();
  const username = useAuth().session?.username ?? "";
  const [items, setItems] = useState<InvoiceErrorPayload[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<InvoiceErrorPayload>).detail;
      if (!detail?.orderCode || !username || mutedToday(username)) return;
      setItems((prev) => {
        const rest = prev.filter((x) => x.orderCode !== detail.orderCode);
        return [detail, ...rest].slice(0, MAX_ITEMS);
      });
      setOpen(true);
    };
    window.addEventListener(INVOICE_ERROR_EVENT, onError);
    return () => window.removeEventListener(INVOICE_ERROR_EVENT, onError);
  }, [username]);

  const close = () => {
    if (username) muteToday(username);
    setOpen(false);
    setItems([]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Xuất hoá đơn đang lỗi</DialogTitle>
          <DialogDescription>
            {items.length} đơn không xuất được hoá đơn điện tử. Job đã thử đủ 3 lần, hoặc đơn thiếu dữ liệu hoá đơn.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {items.map((x) => (
            <li key={x.orderCode} className="rounded-md border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-medium">{x.orderCode}</span>
                <span className="text-xs text-muted-foreground">{x.at ? formatDateTime(x.at) : ""}</span>
              </div>
              {x.message ? <div className="mt-1 text-xs">{x.message}</div> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Đóng popup thì hôm nay sẽ không báo lại. Đơn lỗi vẫn nằm ở Quản lý hoá đơn, lọc “Lỗi”.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button
            type="button"
            onClick={() => {
              close();
              void navigate({ to: "/quan-ly-hoa-don" });
            }}
          >
            Xem hoá đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
