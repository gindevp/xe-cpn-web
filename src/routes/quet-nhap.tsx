import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { officeName, type Order, type Role } from "@/lib/mock-data";
import { packageCode, packageCount, parsePackageScan, packageNameOf, warehouseInSeqs, embedWarehouseInSeqs, isPackageWarehouseIn } from "@/lib/package-label";
import { resolveAssignedOffice } from "@/lib/office-scope";
import { findOrderForScan, normalizeScanRaw, validateUnloadPackage, sameOffice, unloadDestOffice } from "@/lib/unload-scan";
import { ApiError, isApiEnabled } from "@/lib/api/client";
import { getOrder, listOrders } from "@/lib/api/domain-api";
import { fetchAccount, officeFromAccount } from "@/lib/api/auth-api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Box, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quet-nhap")({
  head: () => ({ meta: [{ title: "Xuống hàng — X.E" }] }),
  component: () => (
    <ProtectedPage title="Xuống hàng" screen="quet-nhap" hideGlobalTopBarOnMobile>
      <Page />
    </ProtectedPage>
  ),
});

type PendingPkg = {
  orderCode: string;
  seq: number;
  scannedAt: string;
};

type TabKey = "partial" | "complete";

function isNativeWebView() {
  return typeof window !== "undefined" && !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;
}

function postScanInline(active: boolean) {
  const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
  w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "SCAN_INLINE", active }));
}

function upsertOrder(order: Order) {
  const orders = useStore.getState().orders;
  const i = orders.findIndex((o) => o.code === order.code);
  if (i >= 0) {
    const next = orders.slice();
    next[i] = { ...orders[i], ...order };
    useStore.setState({ orders: next });
  } else {
    useStore.setState({ orders: [order, ...orders] });
  }
}

function currentScannerOffice() {
  const st = useStore.getState();
  return resolveAssignedOffice({
    sessionOffice: st.session?.office,
    viewOffice: st.viewOffice,
    nativeOffice: typeof window !== "undefined" ? window.__XE_NATIVE_OFFICE__ : "",
    userOffice: st.users.find((u) => u.username === st.session?.username)?.office,
  });
}

async function ensureScannerOffice(): Promise<string> {
  let office = currentScannerOffice();
  if (office || !isApiEnabled()) return office;
  try {
    const account = await fetchAccount();
    const fromApi = officeFromAccount(account);
    if (!fromApi) return office;
    const st = useStore.getState();
    useStore.setState({
      session: {
        username: account.login || st.session?.username || "",
        role: (account.roleCode || st.session?.role || "DH") as Role,
        office: fromApi,
      },
      viewOffice: st.viewOffice || fromApi,
    });
    office = currentScannerOffice() || fromApi;
  } catch {
    /* keep empty */
  }
  return office;
}

function formatShort(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} ${day}/${month}`;
}

function Page() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const online = useStore((s) => s.online);
  const orders = useStore((s) => s.orders);
  const viewOffice = useStore((s) => s.viewOffice);
  const users = useStore((s) => s.users);
  const scannerOffice = resolveAssignedOffice({
    sessionOffice: session?.office,
    viewOffice,
    nativeOffice: typeof window !== "undefined" ? window.__XE_NATIVE_OFFICE__ : "",
    userOffice: users.find((u) => u.username === session?.username)?.office,
  });
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<TabKey>("partial");
  const [pending, setPending] = useState<PendingPkg[]>([]);
  const [replayKey, setReplayKey] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const scanningRef = useRef(false);

  const orderByCode = useMemo(() => {
    const m = new Map<string, Order>();
    for (const o of orders) m.set(o.code, o);
    return m;
  }, [orders]);

  const inboundWhinPkgs = useMemo(() => {
    const list: { order: Order; seq: number }[] = [];
    for (const o of orders) {
      if (!sameOffice(scannerOffice, o.toOffice) && !sameOffice(scannerOffice, unloadDestOffice(o))) continue;
      for (const seq of warehouseInSeqs(o)) list.push({ order: o, seq });
    }
    return list;
  }, [orders, scannerOffice]);

  const pendingPkgs = useMemo(() => {
    return pending
      .map((p) => {
        const order = orderByCode.get(p.orderCode);
        if (!order) return null;
        if (isPackageWarehouseIn(order, p.seq)) return null;
        return { ...p, order };
      })
      .filter((x): x is PendingPkg & { order: Order } => x != null);
  }, [pending, orderByCode]);

  const completePkgs = inboundWhinPkgs;
  const visiblePending = tab === "partial" ? pendingPkgs : [];
  const visibleComplete = tab === "complete" ? completePkgs : [];
  const pendingCount = pendingPkgs.length;
  const completeCount = completePkgs.length;

  /** Store chỉ sync đơn VP gửi — xuống hàng cần đơn inbound (VP nhận). */
  const refreshInbound = useCallback(async () => {
    if (!isApiEnabled() || !scannerOffice) return;
    try {
      // IN_TRANSIT = còn trên xe; AT_DEST = đã nhập kho giao (giữ tab Đã xuống đủ đúng).
      const [inTransit, atDest] = await Promise.all([
        listOrders({ toOfficeCode: scannerOffice, status: "IN_TRANSIT", size: 200 }),
        listOrders({ toOfficeCode: scannerOffice, status: "AT_DEST", size: 200 }).catch(
          () => [] as Order[],
        ),
      ]);
      const inbound = [...inTransit, ...atDest];
      if (!inbound.length) return;
      const map = new Map(useStore.getState().orders.map((o) => [o.code, o]));
      for (const o of inbound) map.set(o.code, { ...map.get(o.code), ...o });
      useStore.setState({ orders: [...map.values()] });
    } catch {
      /* giữ dữ liệu hiện tại */
    }
  }, [scannerOffice]);

  useEffect(() => {
    void refreshInbound();
  }, [refreshInbound]);

  // Realtime nhẹ: máy khác quét / nhập kho giao thì màn này cũng cập nhật.
  useEffect(() => {
    if (!isApiEnabled() || !scannerOffice) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refreshInbound();
    }, 8000);
    const onVisible = () => {
      if (!document.hidden) void refreshInbound();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshInbound, scannerOffice]);

  const applyScan = useCallback(
    async (rawInput?: string) => {
      const raw = normalizeScanRaw(rawInput || code || inputRef.current?.value || "");
      if (!raw || scanningRef.current) return;
      scanningRef.current = true;
      setCode(raw);
      try {
        const st = useStore.getState();
        let hit = findOrderForScan(st.orders, raw);
        if (!hit && isApiEnabled()) {
          const parsed = parsePackageScan(raw);
          try {
            const order = await getOrder(parsed.orderCode);
            upsertOrder(order);
            hit = findOrderForScan([order], raw);
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
              try {
                const listed = await listOrders({ keyword: parsed.orderCode, size: 10 });
                const fromList = findOrderForScan(listed, raw);
                if (fromList) {
                  upsertOrder(fromList.order);
                  hit = fromList;
                }
              } catch {
                /* keep 404 */
              }
            } else {
              const msg = e instanceof Error ? e.message : "lỗi mạng";
              toast.error(`Không gọi được máy chủ (${msg})`);
              return;
            }
          }
        }
        if (!hit) {
          toast.error(`Không tồn tại kiện / đơn ${raw}`);
          return;
        }
        const { order } = hit;
        const seq = hit.seq;
        if (seq == null) {
          toast.error(`Đơn ${order.code} có ${packageCount(order)} kiện — quét mã kiện (mã đơn_STT)`);
          return;
        }

        const pkg = packageCode(order.code, seq);
        const alreadyIn = isPackageWarehouseIn(order, seq);
        const scannerOfficeNow = await ensureScannerOffice();
        const check = validateUnloadPackage({
          order,
          seq,
          scannerOffice: scannerOfficeNow,
          alreadyWarehouseIn: alreadyIn,
        });
        if (!check.ok) {
          toast.error(check.error);
          return;
        }

        if (alreadyIn) {
          setReplayKey(`${order.code}:${seq}`);
          setTab("complete");
          setCode("");
          toast.info(`Kiện ${pkg} đã nhập kho giao rồi`);
          return;
        }

        const dup = pendingRef.current.some((p) => p.orderCode === order.code && p.seq === seq);
        if (dup) {
          toast.error(`Kiện ${pkg} đã quét`);
          return;
        }

        if (!online) {
          st.enqueueOffline({ kind: "SCAN_IN", payload: { code: order.code, office: scannerOfficeNow } });
          toast.info("Offline: đã lưu vào hàng đợi");
          setCode("");
          return;
        }

        const now = new Date().toISOString();
        const total = packageCount(order);
        setPending((prev) => [...prev, { orderCode: order.code, seq, scannedAt: now }]);

        if (order.tripCode) {
          const trip = st.trips.find((t) => t.code === order.tripCode);
          if (trip && trip.status === "DEPARTED") {
            st.transitionTrip(trip.code, "UNLOADING");
          }
        }

        const scannedNow = new Set([
          ...warehouseInSeqs(order),
          ...pendingRef.current.filter((p) => p.orderCode === order.code).map((p) => p.seq),
          seq,
        ]).size;
        const remain = Math.max(0, total - scannedNow);
        setCode("");
        setTab("partial");
        if (total > 1) {
          toast.success(`Đã quét ${pkg} · còn ${remain} kiện chưa xuống đủ (${scannedNow}/${total})`);
        } else {
          toast.success(`Đã quét ${pkg}`);
        }
      } finally {
        scanningRef.current = false;
      }
    },
    [code, online],
  );

  const applyScanRef = useRef(applyScan);
  applyScanRef.current = applyScan;

  useEffect(() => {
    window.__xeApplyScan = (c: string) => {
      void applyScanRef.current(c);
    };
    return () => {
      delete window.__xeApplyScan;
    };
  }, []);

  useEffect(() => {
    if (!isNativeWebView()) return;
    postScanInline(true);
    return () => postScanInline(false);
  }, []);

  const doScan = () => {
    void applyScan();
  };

  const warehouseIn = () => {
    if (!pendingPkgs.length) {
      toast.error("Chưa có kiện chờ nhập kho giao");
      return;
    }
    const st = useStore.getState();
    const office = scannerOffice;
    const byOrder = new Map<string, number[]>();
    for (const p of pendingPkgs) {
      const cur = byOrder.get(p.orderCode) ?? [];
      cur.push(p.seq);
      byOrder.set(p.orderCode, cur);
    }
    let pkgOk = 0;
    let orderDone = 0;
    for (const [orderCode, seqs] of byOrder) {
      const order = st.orders.find((o) => o.code === orderCode);
      if (!order) continue;
      const merged = [...new Set([...warehouseInSeqs(order), ...seqs])].sort((a, b) => a - b);
      const total = packageCount(order);
      st.updateOrder(orderCode, { note: embedWarehouseInSeqs(order.note, merged) });
      pkgOk += seqs.length;
      if (merged.length >= total) {
        const t = st.transitionOrder(orderCode, "AT_DEST", "SCAN_IN", `VP ${office}`);
        if (!t.ok) {
          toast.error(`${orderCode}: ${t.error}`);
          continue;
        }
        st.updateOrder(orderCode, { stage: "DEST_WH_IN" });
        orderDone += 1;
      }
    }
    setPending((prev) =>
      prev.filter((p) => !pendingPkgs.some((x) => x.orderCode === p.orderCode && x.seq === p.seq)),
    );
    setTab("complete");
    toast.success(`Nhập kho giao · ${pkgOk} kiện${orderDone ? ` · ${orderDone} đơn đủ kiện` : ""}`);
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col bg-background">
      <div
        className={cn(
          "flex h-12 shrink-0 items-center gap-1 border-b px-1",
          isNativeWebView() && "hidden",
        )}
        style={isNativeWebView() ? undefined : { paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Quay lại"
          onClick={() => navigate({ to: "/tac-vu" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Xuống hàng</h1>
      </div>

      {!isNativeWebView() ? (
        <div className="relative flex aspect-square max-h-[227px] w-full max-w-[227px] shrink-0 items-center justify-center self-center overflow-hidden bg-black">
          <Camera className="h-14 w-14 text-white/50" />
          <div className="pointer-events-none absolute inset-0 m-auto aspect-square w-[72%] max-w-[72%] rounded-sm border-2 border-white/85" />
          <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/80">
            Đưa mã kiện vào khung · VP <b>{officeName(scannerOffice) || "—"}</b>
          </span>
        </div>
      ) : null}

      <form
        className="flex gap-2 border-b bg-background px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          doScan();
        }}
      >
        <Input
          ref={inputRef}
          data-scan-input="quet-nhap"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Nhập mã kiện"
          className="h-10"
        />
        <Button type="submit" className="h-10 px-5">
          Quét
        </Button>
      </form>

      <div className="flex border-b bg-background px-2">
        <button
          type="button"
          className={cn(
            "flex-1 py-3 text-center text-sm font-medium",
            tab === "partial" ? "border-b-2 border-primary text-primary" : "text-muted-foreground",
          )}
          onClick={() => setTab("partial")}
        >
          Chưa xuống đủ ({pendingCount})
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 py-3 text-center text-sm font-medium",
            tab === "complete" ? "border-b-2 border-primary text-primary" : "text-muted-foreground",
          )}
          onClick={() => setTab("complete")}
        >
          Đã xuống đủ ({completeCount})
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 px-3 py-3">
        {tab === "partial" && visiblePending.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Quét mã kiện trên tem. Đơn phải đang ở Hàng trên xe và bạn thuộc VP nhận.
          </p>
        ) : null}
        {tab === "complete" && visibleComplete.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có kiện nhập kho giao. Quét kiện rồi ấn Nhập kho giao.
          </p>
        ) : null}
        {tab === "partial"
          ? visiblePending.map((p) => {
              const total = packageCount(p.order);
              const scannedNow = new Set([
                ...warehouseInSeqs(p.order),
                ...pendingPkgs.filter((x) => x.orderCode === p.orderCode).map((x) => x.seq),
              ]).size;
              return (
                <UnloadCard
                  key={`${p.orderCode}:${p.seq}`}
                  order={p.order}
                  seq={p.seq}
                  scannedAt={p.scannedAt}
                  rate={`${scannedNow}/${total}`}
                  remain={Math.max(0, total - scannedNow)}
                />
              );
            })
          : visibleComplete.map(({ order, seq }) => {
              const total = packageCount(order);
              const inCount = warehouseInSeqs(order).length;
              const key = `${order.code}:${seq}`;
              return (
                <UnloadCard
                  key={key}
                  order={order}
                  seq={seq}
                  scannedAt=""
                  rate={`${inCount}/${total}`}
                  remain={Math.max(0, total - inCount)}
                  alreadyIn
                  highlight={replayKey === key}
                />
              );
            })}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-background px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Box className="h-5 w-5 text-muted-foreground" />
          <span>
            {pendingCount} chờ nhập • {completeCount} đã nhập
          </span>
        </div>
        <Button className="h-11 min-w-[148px] rounded-md px-5 text-base" onClick={warehouseIn} disabled={!pendingCount}>
          Nhập kho giao
        </Button>
      </div>
    </div>
  );
}

function UnloadCard({
  order,
  seq,
  scannedAt,
  rate,
  remain,
  alreadyIn,
  highlight,
}: {
  order: Order;
  seq: number;
  scannedAt: string;
  rate: string;
  remain: number;
  alreadyIn?: boolean;
  highlight?: boolean;
}) {
  const name = packageNameOf(order, seq);
  const pkg = packageCode(order.code, seq);
  const total = packageCount(order);
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-3 py-3 shadow-sm",
        alreadyIn && "opacity-70",
        highlight && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold font-mono">{pkg}</div>
        <div className="shrink-0 text-xs font-medium">{rate} kiện</div>
      </div>
      {scannedAt ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{formatShort(scannedAt)}</div>
      ) : null}
      <div className="mt-1 text-sm text-muted-foreground">
        {officeName(order.toOffice)} • {order.receiverPhone || "—"}
        {order.receiverName ? ` • ${order.receiverName}` : ""}
      </div>
      <div className="mt-2 text-sm">
        Loại hàng: <span className="font-medium">{name}</span>
      </div>
      {!alreadyIn && total > 1 ? (
        <div className="mt-1 text-sm text-muted-foreground">Còn {remain} kiện chưa xuống đủ</div>
      ) : null}
      {alreadyIn ? (
        <div className="mt-1 text-xs font-medium text-info">Đã nhập kho giao</div>
      ) : null}
    </div>
  );
}
