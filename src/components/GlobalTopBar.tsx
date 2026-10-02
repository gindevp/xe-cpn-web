import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { FileText, Search, Loader2, MapPin, Package, Phone, User } from "lucide-react";
import { useOrderHistoryOptional } from "@/components/OrderHistoryDialog";
import { realVehiclePlate } from "@/components/AssignVehiclePicker";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStore, type OrderX } from "@/lib/store";
import { formatVND, officeName, orderReceiverOffice } from "@/lib/mock-data";
import { orderTabStatusLabel } from "@/lib/customer-track-status";
import { orderGoodsLabel } from "@/lib/package-label";
import { isApiEnabled } from "@/lib/api/client";
import { listOrders } from "@/lib/api/domain-api";
import { compareSearchResults, orderMatchesQuery } from "@/lib/order-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canRead, useRbacVersion } from "@/lib/rbac";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";
import { useActivityFilters } from "@/lib/activity-filters";
import { StageTabFilters } from "@/components/StageTabs";

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

const REMOTE_SIZE = 30;
const REMOTE_DEBOUNCE_MS = 400;
const REMOTE_CACHE_MS = 60_000;

/** Ô tìm đơn — đặt giữa header cạnh title. */
export function GlobalHeaderSearch() {
  const orderHistory = useOrderHistoryOptional();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OrderX[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);
  /** keyword (lower) → kết quả server; đủ (< REMOTE_SIZE) thì từ khoá dài hơn lọc tại chỗ, không gọi lại. */
  const remoteCache = useRef(new Map<string, { rows: OrderX[]; at: number }>());

  const cachedRemote = useCallback((s: string): OrderX[] | null => {
    const key = s.toLocaleLowerCase("vi-VN");
    const now = Date.now();
    for (const [k, v] of remoteCache.current) {
      if (now - v.at > REMOTE_CACHE_MS) {
        remoteCache.current.delete(k);
        continue;
      }
      if (k === key) return v.rows;
      if (key.startsWith(k) && v.rows.length < REMOTE_SIZE) return v.rows.filter((o) => orderMatchesQuery(o, s));
    }
    return null;
  }, []);

  const showMerged = useCallback((s: string, remote: OrderX[]) => {
    const local = useStore.getState().orders.filter((o) => orderMatchesQuery(o, s));
    const byCode = new Map<string, OrderX>();
    for (const o of [...remote, ...local]) {
      if (!byCode.has(o.code)) byCode.set(o.code, o);
    }
    const merged = [...byCode.values()]
      .filter((o) => orderMatchesQuery(o, s))
      .sort(compareSearchResults)
      .slice(0, 20);
    setResults(merged);
    setActiveIdx(0);
    return merged;
  }, []);

  const fetchRemote = useCallback(async (s: string): Promise<OrderX[]> => {
    const hit = cachedRemote(s);
    if (hit || !isApiEnabled()) return hit ?? [];
    try {
      const rows = await listOrders({ keyword: s, size: REMOTE_SIZE });
      remoteCache.current.set(s.toLocaleLowerCase("vi-VN"), { rows, at: Date.now() });
      if (rows.length) mergeOrdersIntoStore(rows);
      return rows;
    } catch {
      return [];
    }
  }, [cachedRemote]);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      reqSeq.current++;
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const seq = ++reqSeq.current;
    setOpen(true);
    const hit = cachedRemote(s);
    showMerged(s, hit ?? []);
    if (hit || !isApiEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      void fetchRemote(s).then((remote) => {
        if (seq !== reqSeq.current) return;
        showMerged(s, remote);
        setLoading(false);
      });
    }, REMOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, cachedRemote, showMerged, fetchRemote]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const openOrder = (code: string) => {
    setOpen(false);
    orderHistory?.openOrderHistory(code);
  };

  const onSearch = async () => {
    const s = q.trim();
    if (!s) return;

    let pool = results;
    if (!pool.length) {
      setLoading(true);
      pool = showMerged(s, await fetchRemote(s));
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
        <div className="absolute left-1/2 top-[calc(100%+6px)] z-50 w-[min(96vw,40rem)] max-h-[32rem] -translate-x-1/2 overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Đang tìm…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Không có kết quả</div>
          ) : (
            <ul className="divide-y divide-slate-200 px-2 py-1">
              {results.map((o, i) => (
                <SearchResultItem
                  key={o.code}
                  order={o}
                  query={q.trim()}
                  active={i === activeIdx}
                  onHover={() => setActiveIdx(i)}
                  onOpen={() => void openOrder(o.code)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Tô phần khớp từ khoá (không phân biệt hoa thường). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const idx = text.toLocaleLowerCase("vi-VN").indexOf(q.toLocaleLowerCase("vi-VN"));
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-amber-400 px-0.5 text-foreground">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/** "HH:mm dd/MM" */
function shortDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

function SearchResultItem({
  order: o,
  query,
  active,
  onHover,
  onOpen,
}: {
  order: OrderX;
  query: string;
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const fare = Math.max(0, o.fare ?? 0);
  const paid = Math.max(0, o.paidAmount ?? 0);
  const due = Math.max(0, fare - paid);
  const assignedAt = shortDateTime(o.tripAssignedAt);
  const plate = realVehiclePlate(o.vehiclePlate);
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-slate-50",
          active && "bg-slate-50",
        )}
        onMouseEnter={onHover}
        onClick={onOpen}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-semibold">
              <Highlight text={o.code} query={query} />
            </span>
            {o.invoiceStatus === "ISSUED" || o.invoiceStatus === "DUPLICATE" ? (
              <span title="Đã xuất hoá đơn" className="shrink-0">
                <FileText className="h-4 w-4 text-emerald-600" aria-label="Đã xuất hoá đơn" />
              </span>
            ) : null}
            <span className="truncate rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {orderTabStatusLabel(o)}
            </span>
            {assignedAt ? (
              <span className="shrink-0 text-xs text-muted-foreground" title="Thời điểm gán chờ lên xe">
                Gán xe {assignedAt}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end">
            {due > 0 ? (
              <span className="text-sm font-medium text-orange-600">Chưa thu: {formatVND(due)}</span>
            ) : (
              <span className="text-sm font-medium text-emerald-600">Đã thu: {formatVND(paid || fare)}</span>
            )}
            {plate ? (
              <span className="text-xs font-semibold tracking-wide text-slate-600" title="Biển kiểm soát">
                BKS {plate}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold">
            <Highlight text={o.receiverName || "—"} query={query} />
            {o.receiverPhone ? (
              <>
                {" • "}
                <Highlight text={o.receiverPhone} query={query} />
              </>
            ) : null}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Package className="h-4 w-4 shrink-0" />
          <span className="truncate">{orderGoodsLabel(o)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {officeName(o.fromOffice)} <span className="mx-1">⟶</span> {officeName(orderReceiverOffice(o))}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Phone className="h-4 w-4" />
            <span>
              Gửi: <span className="text-foreground"><Highlight text={o.senderPhone || "—"} query={query} /></span>
            </span>
          </div>
        </div>
      </button>
    </li>
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
  const filters = useActivityFilters();
  const onActivityScreen = ACTIVITY_TOP_NAV.some((i) => pathname === i.to);

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
      {onActivityScreen ? (
        <StageTabFilters
          from={filters.from}
          to={filters.to}
          q={filters.q}
          onFrom={filters.setFrom}
          onTo={filters.setTo}
          onQ={filters.setQ}
          placeholder="Lọc mã đơn, SĐT, tên khách…"
        />
      ) : null}
    </nav>
  );
}
