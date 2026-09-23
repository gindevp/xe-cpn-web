import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStore, type OrderX } from "@/lib/store";
import { ORDER_STATUS_LABEL, officeName, orderReceiverOffice } from "@/lib/mock-data";
import { isApiEnabled } from "@/lib/api/client";
import { getOrder, listOrders } from "@/lib/api/domain-api";
import { orderMatchesQuery, rankOrderMatch } from "@/lib/order-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canRead, useRbacVersion } from "@/lib/rbac";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";

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

/** Ô tìm đơn — đặt giữa header cạnh title. */
export function GlobalHeaderSearch() {
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
        /* navigate anyway */
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
    <div className="relative w-[min(92vw,32rem)] sm:w-[28rem] md:w-[32rem]" ref={wrapRef}>
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
        placeholder="Tìm mã đơn, SĐT…"
        className="h-9 border-slate-200/90 bg-slate-50/80 pl-8 pr-8 shadow-none focus-visible:bg-white"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {loading ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}

      {open && q.trim().length >= 2 ? (
        <div className="absolute left-1/2 top-[calc(100%+4px)] z-50 w-full max-h-80 -translate-x-1/2 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
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
  );
}

/** Lối tắt hoạt động — nút đậm (primary / outline), rõ hơn tab màn. */
export function GlobalTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  useRbacVersion();
  const storeOrders = useStore((s) => s.orders);
  const admin = hasAllOfficeScope(session);
  const handoverCount = pendingHandoverOrders(storeOrders, {
    allOffices: admin,
    office: session?.office,
  }).length;

  const quickNav = ACTIVITY_TOP_NAV.filter((i) => canRead(session?.role, i.screen));
  const navBadges: Record<string, number> = {
    "/cho-ban-giao": handoverCount,
  };

  if (!quickNav.length) return null;

  return (
    <nav
      className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2.5 md:gap-2.5 md:px-6"
      aria-label="Lối tắt hoạt động"
    >
      {quickNav.map((i) => {
        const active =
          pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(`${i.to}/`));
        const badge = navBadges[i.to] ?? 0;
        const label = i.shortLabel ?? i.label;
        return (
          <Link
            key={i.to}
            to={i.to}
            title={i.label}
            className={cn(
              "inline-flex h-9 max-w-full items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium shadow-sm transition-colors sm:h-10 sm:px-3.5 sm:text-sm md:h-11 md:px-4 md:text-[15px]",
              active
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className="min-w-0 text-left leading-snug">{label}</span>
            {badge > 0 ? (
              <span
                className={cn(
                  "inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-5",
                  active
                    ? "bg-primary-foreground/25 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
