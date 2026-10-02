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
import { TAX_LOOKUP_ERROR_EVENT, type TaxLookupErrorPayload } from "@/lib/use-realtime-sync";

const MAX_ITEMS = 20;
const MUTE_KEY_PREFIX = "cpn:tax-lookup-alert-muted:";

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
 * Popup khi nguồn tra cứu MST lỗi — gom nhiều lỗi vào 1 popup đến khi admin đóng.
 * Admin đã đóng thì không báo lại trong ngày (theo tài khoản, trên trình duyệt đó).
 */
export function TaxLookupErrorAlert() {
  const username = useAuth().session?.username ?? "";
  const [items, setItems] = useState<TaxLookupErrorPayload[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<TaxLookupErrorPayload>).detail;
      if (!detail?.taxCode || !username || mutedToday(username)) return;
      setItems((prev) => [detail, ...prev.filter((x) => x.taxCode !== detail.taxCode)].slice(0, MAX_ITEMS));
      setOpen(true);
    };
    window.addEventListener(TAX_LOOKUP_ERROR_EVENT, onError);
    return () => window.removeEventListener(TAX_LOOKUP_ERROR_EVENT, onError);
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
          <DialogTitle className="text-destructive">Tra cứu mã số thuế đang lỗi</DialogTitle>
          <DialogDescription>
            {items.length} lần tra MST không lấy được thông tin công ty do nguồn tra cứu (VietQR / esgoo) lỗi
            hoặc quá hạn. Nhân viên không nhập tay được tên, địa chỉ nên đơn chưa lưu được thông tin hoá đơn.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {items.map((x) => (
            <li key={x.taxCode} className="rounded-md border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-medium">MST {x.taxCode}</span>
                <span className="text-xs text-muted-foreground">{x.at ? formatDateTime(x.at) : ""}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {x.message || x.code}
                {x.by ? ` · ${x.by}` : ""}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Đóng popup thì hôm nay sẽ không báo lại.</p>
        <DialogFooter>
          <Button type="button" onClick={close}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
