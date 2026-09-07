import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Bell, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStore, type OrderX } from "@/lib/store";
import { ORDER_STATUS_LABEL, officeName, orderReceiverOffice } from "@/lib/mock-data";
import { isApiEnabled } from "@/lib/api/client";
import { getOrder, listOrders } from "@/lib/api/domain-api";
import { orderMatchesQuery, rankOrderMatch } from "@/lib/order-search";
import { cn } from "@/lib/utils";

type Notif = { id: string; title: string; desc: string; time: string };

const NOTIFS: Notif[] = [];

function mergeOrdersIntoStore(rows: OrderX[]) {
  if (!rows.length) return;
  useStore.setState((st) => {
    const byCode = new Map(st.orders.map((o) => [o.code, o]));
    for (const r of rows) {
      const prev = byCode.get(r.code);
      byCode.set(r.code, prev ? { ...prev, ...r, events: r.events?.length ? r.events : prev.events } : r);
    }
    return { orders: [...byCode.values()] };
  });
}

export function GlobalTopBar() {
  const navigate = useNavigate();
  const storeOrders = useStore((s) => s.orders);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OrderX[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  const runSearch = useCallback(
    async (raw: string) => {
      const s = raw.trim();
      if (s.length < 2) {
        setResults([]);
        setOpen(false);
        setLoading(false);
        return;
      }
      const seq = ++reqSeq.current;
      setLoading(true);
      setOpen(true);

      const local = storeOrders
        .filter((o) => orderMatchesQuery(o, s))
        .sort((a, b) => rankOrderMatch(b, s) - rankOrderMatch(a, s));

      let remote: OrderX[] = [];
      if (isApiEnabled()) {
        try {
          remote = await listOrders({ keyword: s, size: 30 });
        } catch {
          /* keep local */
        }
      }
      if (seq !== reqSeq.current) return;

      const byCode = new Map<string, OrderX>();
      for (const o of [...remote, ...local]) {
        if (!byCode.has(o.code)) byCode.set(o.code, o);
      }
      // API LIKE có thể rộng hơn — lọc lại bằng matcher local (4 số cuối / mã gần đúng)
      const merged = [...byCode.values()]
        .filter((o) => orderMatchesQuery(o, s))
        .sort((a, b) => rankOrderMatch(b, s) - rankOrderMatch(a, s))
        .slice(0, 20);

      if (remote.length) mergeOrdersIntoStore(remote);
      setResults(merged);
      setActiveIdx(0);
      setLoading(false);
    },
    [storeOrders],
  );

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = window.setTimeout(() => void runSearch(s), 280);
    return () => window.clearTimeout(t);
  }, [q, runSearch]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const openOrder = async (code: string) => {
    setOpen(false);
    let inStore = useStore.getState().orders.some((o) => o.code === code || o.draftCode === code);
    if (!inStore && isApiEnabled()) {
      try {
        const detail = await getOrder(code);
        mergeOrdersIntoStore([detail]);
        inStore = true;
      } catch {
        /* navigate anyway — detail page shows empty */
      }
    }
    navigate({ to: "/van-don/$ma", params: { ma: code } });
    if (!inStore) toast.message(`Đang mở đơn ${code}`);
  };

  const onSearch = async () => {
    const s = q.trim();
    if (!s) return;

    let pool = results;
    if (!pool.length) {
      setLoading(true);
      const local = storeOrders
        .filter((o) => orderMatchesQuery(o, s))
        .sort((a, b) => rankOrderMatch(b, s) - rankOrderMatch(a, s));
      let remote: OrderX[] = [];
      if (isApiEnabled()) {
        try {
          remote = await listOrders({ keyword: s, size: 30 });
          mergeOrdersIntoStore(remote);
        } catch {
          /* local only */
        }
      }
      const byCode = new Map<string, OrderX>();
      for (const o of [...remote, ...local]) byCode.set(o.code, o);
      pool = [...byCode.values()]
        .sort((a, b) => rankOrderMatch(b, s) - rankOrderMatch(a, s))
        .slice(0, 20);
      setResults(pool);
      setLoading(false);
    }

    if (!pool.length) {
      toast.error("Không tìm thấy đơn khớp");
      setOpen(true);
      return;
    }

    const qLower = s.toLocaleLowerCase("vi-VN");
    const exact = pool.find(
      (o) => o.code.toLocaleLowerCase("vi-VN") === qLower || o.draftCode?.toLocaleLowerCase("vi-VN") === qLower,
    );
    if (exact) {
      await openOrder(exact.code);
      return;
    }
    if (pool.length === 1) {
      await openOrder(pool[0].code);
      return;
    }
    setOpen(true);
    setActiveIdx(0);
  };

  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative w-full max-w-md" ref={wrapRef}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => {
              if (q.trim().length >= 2 && results.length) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (open && results.length > 1) {
                  const pick = results[activeIdx] ?? results[0];
                  if (pick) void openOrder(pick.code);
                } else {
                  void onSearch();
                }
              }
            }}
            placeholder="Tìm mã đơn (gần đúng), SĐT hoặc 4 số cuối…"
            className="h-9 pl-8 pr-8"
            aria-autocomplete="list"
            aria-expanded={open}
          />
          {loading ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}

          {open && q.trim().length >= 2 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
              {loading && results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">Đang tìm…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">Không có kết quả</div>
              ) : (
                <ul className="py-1">
                  {results.map((o, i) => (
                    <li key={o.code}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent",
                          i === activeIdx && "bg-accent",
                        )}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => void openOrder(o.code)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium font-mono">{o.code}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {ORDER_STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {o.receiverName || "—"}
                          {o.receiverPhone ? ` · ${o.receiverPhone}` : ""}
                          {" · "}
                          {officeName(o.fromOffice)} → {officeName(orderReceiverOffice(o))}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Thông báo">
              <Bell className="h-4 w-4" />
              {NOTIFS.length > 0 && (
                <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                  {NOTIFS.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Thông báo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NOTIFS.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                Không có thông báo
              </DropdownMenuItem>
            ) : (
              NOTIFS.map((n) => (
                <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.desc}</div>
                  <div className="text-[10px] text-muted-foreground">{n.time} trước</div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
