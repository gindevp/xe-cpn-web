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
import { AUTO_CALL_ERROR_EVENT, type AutoCallErrorPayload } from "@/lib/use-realtime-sync";

const MAX_ITEMS = 20;
const MUTE_KEY_PREFIX = "cpn:autocall-alert-muted:";

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
 * Popup khi Auto Call lỗi tổng đài / gửi lỗi — gom nhiều lỗi vào 1 popup đến khi admin đóng.
 * Admin đã đóng thì không báo lại trong ngày (theo tài khoản, trên trình duyệt đó).
 */
export function AutoCallErrorAlert() {
  const navigate = useNavigate();
  const username = useAuth().session?.username ?? "";
  const [items, setItems] = useState<AutoCallErrorPayload[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<AutoCallErrorPayload>).detail;
      if (!detail || !username || mutedToday(username)) return;
      setItems((prev) => {
        const key = `${detail.kind}:${detail.refId ?? detail.callId ?? ""}`;
        const rest = prev.filter((x) => `${x.kind}:${x.refId ?? x.callId ?? ""}` !== key);
        return [detail, ...rest].slice(0, MAX_ITEMS);
      });
      setOpen(true);
    };
    window.addEventListener(AUTO_CALL_ERROR_EVENT, onError);
    return () => window.removeEventListener(AUTO_CALL_ERROR_EVENT, onError);
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
          <DialogTitle className="text-destructive">Auto Call đang có lỗi</DialogTitle>
          <DialogDescription>
            {items.length} cuộc gọi tự động bị lỗi. Kiểm tra kết nối tổng đài HHVN (API key, IP
            whitelist) hoặc liên hệ HHVN nếu lỗi lặp lại.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {items.map((x, i) => (
            <li
              key={`${x.refId ?? x.callId ?? ""}-${x.kind}-${i}`}
              className="rounded-md border p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {x.sandbox ? "[Sandbox] " : ""}
                  {x.kind === "send" ? "Gửi sang tổng đài lỗi" : "Lỗi tổng đài / nhà mạng"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {x.at ? formatDateTime(x.at) : ""}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {x.orderCode ? <span className="font-mono">{x.orderCode}</span> : null}
                {x.orderCode && x.phone ? " · " : null}
                {x.phone ? <span className="font-mono">{x.phone}</span> : null}
              </div>
              {x.message && x.kind === "send" ? (
                <div className="mt-1 text-xs">{x.message}</div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Đóng popup thì hôm nay sẽ không báo lại — lỗi mới vẫn xem được ở Auto Call → Cuộc gọi (lọc
          “Lỗi tổng đài”).
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button
            type="button"
            onClick={() => {
              close();
              void navigate({ to: "/tich-hop", search: { tab: "autocall" } });
            }}
          >
            Xem Auto Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
