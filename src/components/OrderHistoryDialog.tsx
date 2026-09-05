import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { isApiEnabled } from "@/lib/api/client";
import { getOrder } from "@/lib/api/domain-api";
import { orderEventContent } from "@/lib/finance-debt";
import { cn } from "@/lib/utils";

type HistoryCtx = {
  openOrderHistory: (code: string) => void;
};

const OrderHistoryContext = createContext<HistoryCtx | null>(null);

export function useOrderHistory() {
  const ctx = useContext(OrderHistoryContext);
  if (!ctx) {
    throw new Error("useOrderHistory must be used within OrderHistoryProvider");
  }
  return ctx;
}

/** Safe hook when provider may be missing (falls back to no-op). */
export function useOrderHistoryOptional() {
  return useContext(OrderHistoryContext);
}

export function OrderHistoryProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null);
  const openOrderHistory = useCallback((c: string) => {
    const t = c?.trim();
    if (t) setCode(t);
  }, []);
  const value = useMemo(() => ({ openOrderHistory }), [openOrderHistory]);

  return (
    <OrderHistoryContext.Provider value={value}>
      {children}
      <OrderHistoryDialog
        code={code}
        open={Boolean(code)}
        onOpenChange={(v) => {
          if (!v) setCode(null);
        }}
      />
    </OrderHistoryContext.Provider>
  );
}

/** Click mã vận đơn → popup lịch sử Người tác động (dùng toàn app). */
export function OrderCodeLink({
  code,
  className,
  children,
}: {
  code: string;
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useOrderHistoryOptional();
  const label = children ?? code;

  if (!code?.trim()) return <span className={className}>{label}</span>;

  if (!ctx) {
    return <span className={cn("font-medium text-primary", className)}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={cn(
        "font-medium text-primary underline-offset-2 hover:underline text-left",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.openOrderHistory(code);
      }}
    >
      {label}
    </button>
  );
}

export function OrderHistoryDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const storeOrder = useStore((s) =>
    code ? s.orders.find((o) => o.code === code || o.draftCode === code) : undefined,
  );
  const [events, setEvents] = useState<
    Array<{ at: string; by?: string; action: string; detail?: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !code) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isApiEnabled()) {
          const detail = await getOrder(code);
          if (!cancelled) {
            setEvents(
              [...(detail.events ?? [])].sort(
                (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
              ),
            );
          }
        } else if (!cancelled) {
          setEvents(
            [...(storeOrder?.events ?? [])].sort(
              (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setEvents(
            [...(storeOrder?.events ?? [])].sort(
              (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, code, storeOrder]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="space-y-2 border-b px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold">Thông tin đơn hàng</DialogTitle>
          {code ? (
            <span className="inline-flex w-fit rounded-full bg-sky-100 px-3 py-0.5 text-sm font-medium text-sky-800">
              {code}
            </span>
          ) : null}
          <DialogDescription className="sr-only">Lịch sử người tác động trên đơn hàng</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-2 pb-4 pt-1">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Đang tải lịch sử…</div>
          ) : events.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Chưa có lịch sử tác động
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Người tác động</th>
                  <th className="px-4 py-3 font-medium">Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={`${e.at}-${e.action}-${i}`} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDateTime(e.at)}
                    </td>
                    <td className="px-4 py-3">{e.by?.trim() || "—"}</td>
                    <td className="px-4 py-3">{orderEventContent(e.action, e.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
