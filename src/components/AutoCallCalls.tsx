import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { TablePagination } from "@/components/TablePagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AutoCallType, HhvnCall, HhvnCallStatus } from "@/lib/api/finance-config-api";
import { formatDateTime } from "@/lib/mock-data";
import type { Pager } from "@/lib/use-paged-rows";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const FINAL: HhvnCallStatus[] = ["completed", "failed", "cancelled"];
/** HHVN giới hạn 60 request/phút — chỉ tự tra kết quả gọi thử trong 5 phút sau lần gửi gần nhất. */
const POLL_INTERVAL_MS = 10_000;
const POLL_WINDOW_MS = 5 * 60_000;
const CANCELLABLE: HhvnCallStatus[] = ["queued", "retrying"];
type ResultFilter = "" | "answered" | "not_answered" | "error";
const RESULT_OPTIONS: Array<{ value: ResultFilter; label: string }> = [
  { value: "", label: "Tất cả" },
  { value: "answered", label: "Nghe máy" },
  { value: "not_answered", label: "Không nghe / Huỷ" },
  { value: "error", label: "Lỗi tổng đài" },
];
const ATTEMPT_RESULT: Record<string, string> = {
  answered: "Nghe máy",
  not_answered: "Không nghe",
  error: "Lỗi tổng đài",
  cancelled: "Huỷ",
};

function dateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmt(iso?: string | null) {
  return iso ? formatDateTime(iso) : "—";
}

export function HhvnStatusBadge({
  status,
  result,
}: {
  status: HhvnCallStatus;
  result?: string | null;
}) {
  switch (status) {
    case "completed":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Nghe máy</Badge>;
    case "failed":
      return (
        <Badge variant="destructive">
          {result === "error"
            ? "Lỗi tổng đài"
            : result === "send_error"
              ? "Gửi lỗi"
              : "Không nghe máy"}
        </Badge>
      );
    case "cancelled":
      return <Badge variant="outline">Đã huỷ</Badge>;
    case "calling":
      return <Badge variant="secondary">Đang gọi</Badge>;
    case "retrying":
      return <Badge variant="secondary">Chờ gọi lại</Badge>;
    default:
      return <Badge variant="secondary">Chờ gọi</Badge>;
  }
}

function OrderLink({ code }: { code?: string }) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return <OrderCodeLink code={code} className="font-mono" />;
}

function useCancelCall(onDone: (call?: HhvnCall) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const cancel = (call: HhvnCall) => {
    if (!window.confirm(`Huỷ cuộc gọi tới ${call.phone}? Tổng đài sẽ không gọi số này nữa.`))
      return;
    setBusy(call.callId);
    void (async () => {
      try {
        const { cancelAutoCall } = await import("@/lib/api/finance-config-api");
        const r = await cancelAutoCall(call.callId);
        if (!r.ok) {
          toast.error(r.message ?? "Huỷ cuộc gọi thất bại");
        } else {
          toast.success("Đã huỷ cuộc gọi");
        }
        onDone(r.call);
      } catch (e: any) {
        toast.error(e?.message ?? "Huỷ cuộc gọi thất bại");
      } finally {
        setBusy(null);
      }
    })();
  };
  return { busy, cancel };
}

/** Chi tiết 1 cuộc gọi: từng lần gọi, đầu số, ghi âm; huỷ nếu còn chờ (chỉ HHVN). */
export function CallDetailDialog({
  call,
  onOpenChange,
  onChanged,
  canCancel = true,
}: {
  call: HhvnCall | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: (call: HhvnCall) => void;
  canCancel?: boolean;
}) {
  const { busy, cancel } = useCancelCall((c) => {
    if (c) onChanged?.(c);
  });
  return (
    <Dialog open={call != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết cuộc gọi</DialogTitle>
        </DialogHeader>
        {call ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <HhvnStatusBadge status={call.status} result={call.result} />
              <span className="font-medium">Gọi {call.type === "hoan" ? "hoàn" : "giao"}</span>
              <span className="font-mono">{call.phone}</span>
            </div>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Vận đơn</dt>
              <dd>
                <OrderLink code={call.orderCode} />
              </dd>
              <dt className="text-muted-foreground">callId</dt>
              <dd className="select-all font-mono">{call.callId}</dd>
              <dt className="text-muted-foreground">refId</dt>
              <dd className="select-all font-mono">{call.refId}</dd>
              <dt className="text-muted-foreground">Tạo lúc</dt>
              <dd>{fmt(call.createdAt)}</dd>
              <dt className="text-muted-foreground">Gọi lần đầu</dt>
              <dd>{fmt(call.firstCallAt)}</dd>
              <dt className="text-muted-foreground">Nghe máy lúc</dt>
              <dd>{fmt(call.answeredAt)}</dd>
              <dt className="text-muted-foreground">Kết thúc</dt>
              <dd>{fmt(call.finishedAt)}</dd>
              <dt className="text-muted-foreground">Số lần gọi</dt>
              <dd>
                {call.attemptCount ?? 0}
                {call.maxAttempts ? ` / ${call.maxAttempts}` : ""}
                {call.duration ? ` · nghe ${call.duration}s` : ""}
              </dd>
            </dl>
            {call.attempts && call.attempts.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Lần</th>
                      <th className="px-2 py-1.5 text-left font-medium">Đầu số gọi</th>
                      <th className="px-2 py-1.5 text-left font-medium">Bắt đầu</th>
                      <th className="px-2 py-1.5 text-left font-medium">Kết quả</th>
                      <th className="px-2 py-1.5 text-right font-medium">Nghe (s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {call.attempts.map((a) => (
                      <tr key={a.attempt} className="border-t">
                        <td className="px-2 py-1.5">{a.attempt}</td>
                        <td className="px-2 py-1.5 font-mono">{a.callerId ?? "—"}</td>
                        <td className="px-2 py-1.5">{fmt(a.startTime)}</td>
                        <td className="px-2 py-1.5">
                          {a.result ? (ATTEMPT_RESULT[a.result] ?? a.result) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">{a.duration ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {call.errorMessage ? (
              <div className="text-xs text-destructive">{call.errorMessage}</div>
            ) : null}
            {call.recordingUrl ? (
              <audio controls preload="none" src={call.recordingUrl} className="h-8 w-full" />
            ) : null}
            {canCancel && CANCELLABLE.includes(call.status) ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy === call.callId}
                  onClick={() => cancel(call)}
                >
                  {busy === call.callId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {busy === call.callId ? "Đang huỷ…" : "Huỷ cuộc gọi"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Đối soát: HHVN lấy trực tiếp GET /calls; Vtech không có API danh sách nên đọc cuộc gọi đã lưu phía CPN. */
export function AutoCallCallsPanel({ provider = "HHVN" }: { provider?: "HHVN" | "VTECH" }) {
  const vtech = provider === "VTECH";
  const today = new Date();
  const [from, setFrom] = useState(dateInput(new Date(today.getTime() - 6 * 86400000)));
  const [to, setTo] = useState(dateInput(today));
  const [type, setType] = useState<"" | AutoCallType>("");
  const [result, setResult] = useState<ResultFilter>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<HhvnCall[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [detail, setDetail] = useState<HhvnCall | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fetchAutoCallCalls } = await import("@/lib/api/finance-config-api");
      const r = await fetchAutoCallCalls({ from, to, type, result, phone, page, limit });
      if (!r.ok) {
        setRows([]);
        setTotal(0);
        setError(r.message ?? "Không tải được danh sách cuộc gọi");
        return;
      }
      setRows(r.data ?? []);
      setTotal(r.pagination?.total ?? r.data?.length ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Không tải được danh sách cuộc gọi");
    } finally {
      setLoading(false);
    }
  }, [from, to, type, result, phone, page, limit]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const { busy, cancel } = useCancelCall(() => {
    load().catch(() => undefined);
  });

  const searchPhone = () => {
    const p = phoneInput.trim();
    if (p && p.replace(/\D/g, "").length < 3) return toast.error("Nhập ít nhất 3 số điện thoại");
    setPhone(p);
    setPage(1);
  };

  const clearPhone = () => {
    setPhoneInput("");
    setPhone("");
    setPage(1);
  };

  const pager: Pager = {
    page,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    pageSize: limit,
    total,
    start: (page - 1) * limit,
    setPage,
    setPageSize: (n) => {
      setLimit(n);
      setPage(1);
    },
  };

  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => filter(setFrom)(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => filter(setTo)(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Loại</Label>
          <select
            className={SELECT_CLASS}
            value={type}
            onChange={(e) => filter(setType)(e.target.value as "" | AutoCallType)}
          >
            <option value="">Tất cả</option>
            <option value="giao">Gọi giao</option>
            <option value="hoan">Gọi hoàn</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Kết quả</Label>
          <select
            className={SELECT_CLASS}
            value={result}
            onChange={(e) => filter(setResult)(e.target.value as ResultFilter)}
          >
            {RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Đang tải…" : "Tải lại"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label className="text-xs">Tìm theo SĐT</Label>
          <Input
            value={phoneInput}
            inputMode="tel"
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchPhone();
            }}
            placeholder="0912345678 hoặc vài số cuối"
          />
        </div>
        <Button type="button" variant="secondary" onClick={searchPhone} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Tìm
        </Button>
        {phone ? (
          <Button type="button" variant="ghost" onClick={clearPhone}>
            Bỏ lọc
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="relative overflow-x-auto rounded-md border" aria-busy={loading}>
        {loading && rows.length > 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tạo lúc</th>
              <th className="px-3 py-2 text-left font-medium">Loại</th>
              <th className="px-3 py-2 text-left font-medium">SĐT</th>
              <th className="px-3 py-2 text-left font-medium">Vận đơn</th>
              <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-2 text-right font-medium">Lần gọi</th>
              <th className="px-3 py-2 text-right font-medium">Nghe (s)</th>
              <th className="px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      {vtech ? "Đang tải danh sách…" : "Đang tải danh sách từ HHVN…"}
                    </span>
                  ) : phone ? (
                    `Không có cuộc gọi tới SĐT chứa “${phone}” trong khoảng này`
                  ) : (
                    "Không có cuộc gọi trong khoảng này"
                  )}
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr
                  key={c.callId}
                  className="cursor-pointer border-t hover:bg-muted/40"
                  onClick={() => setDetail(c)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(c.createdAt)}</td>
                  <td className="px-3 py-2">{c.type === "hoan" ? "Hoàn" : "Giao"}</td>
                  <td className="px-3 py-2 font-mono">{c.phone}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <OrderLink code={c.orderCode} />
                  </td>
                  <td className="px-3 py-2">
                    <HhvnStatusBadge status={c.status} result={c.result} />
                  </td>
                  <td className="px-3 py-2 text-right">{c.attemptCount ?? 0}</td>
                  <td className="px-3 py-2 text-right">{c.duration ?? "—"}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {!vtech && CANCELLABLE.includes(c.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy === c.callId}
                        onClick={() => cancel(c)}
                      >
                        {busy === c.callId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {busy === c.callId ? "Đang huỷ…" : "Huỷ"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination pager={pager} />
      <p className="text-xs text-muted-foreground">
        {vtech
          ? "Cuộc gọi CPN đã gửi sang Vtech, kết quả cập nhật khi Vtech gọi webhook. Khoảng ngày tối đa 31 ngày. Bấm vào dòng để xem chi tiết."
          : "Dữ liệu lấy trực tiếp từ HHVN Tech. Khoảng ngày tối đa 31 ngày. Bấm vào dòng để xem từng lần gọi."}
      </p>

      <CallDetailDialog
        call={detail}
        canCancel={!vtech}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onChanged={(c) => {
          setDetail(c);
          load().catch(() => undefined);
        }}
      />
    </div>
  );
}

type TestCall = {
  callId: string;
  refId: string;
  phone: string;
  type: AutoCallType;
  sandbox: boolean;
  call?: HhvnCall;
};

/** Gọi thử 1 số — không gắn vận đơn. Key live gọi thật nên phải xác nhận. */
export function AutoCallTestPanel({
  mode,
  provider = "HHVN",
}: {
  mode?: "SANDBOX" | "LIVE" | "UNKNOWN";
  provider?: "HHVN" | "VTECH";
}) {
  const vtech = provider === "VTECH";
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<AutoCallType>("giao");
  const [sending, setSending] = useState(false);
  const [calls, setCalls] = useState<TestCall[]>([]);
  const [detail, setDetail] = useState<HhvnCall | null>(null);
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const live = mode !== "SANDBOX";

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    const pending = callsRef.current.filter((c) => !c.call || !FINAL.includes(c.call.status));
    if (pending.length === 0) return;
    setRefreshing(true);
    try {
      const { lookupAutoCall } = await import("@/lib/api/finance-config-api");
      const updates = await Promise.all(
        pending.map((c) => lookupAutoCall(c.callId).catch(() => null)),
      );
      setCalls((prev) =>
        prev.map((c) => {
          const u = updates.find((x) => x?.call?.callId === c.callId);
          return u?.call ? { ...c, call: u.call } : c;
        }),
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  const hasPending = calls.some((c) => !c.call || !FINAL.includes(c.call.status));
  const [pollUntil, setPollUntil] = useState(0);
  const [polling, setPolling] = useState(false);
  useEffect(() => {
    if (!hasPending || pollUntil === 0) return;
    setPolling(true);
    const t = window.setInterval(() => {
      if (Date.now() > pollUntil) {
        window.clearInterval(t);
        setPolling(false);
        return;
      }
      refresh().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(t);
      setPolling(false);
    };
  }, [hasPending, pollUntil, refresh]);

  const send = () => {
    const p = phone.trim();
    if (!p) return toast.error("Nhập SĐT cần gọi thử");
    if (
      live &&
      !window.confirm(
        vtech
          ? `Vtech sẽ GỌI THẬT tới ${p} theo kịch bản chiến dịch và tính phí.\n\nTiếp tục gọi thử?`
          : `Key đang dùng là LIVE: tổng đài sẽ GỌI THẬT tới ${p} và tính phí.\n\nTiếp tục gọi thử "${type === "hoan" ? "Gọi hoàn" : "Gọi giao"}"?`,
      )
    ) {
      return;
    }
    setSending(true);
    void (async () => {
      try {
        const { sendAutoCallTest } = await import("@/lib/api/finance-config-api");
        const r = await sendAutoCallTest({ phone: p, type, confirmLive: live });
        if (!r.ok || !r.callId) {
          toast.error(r.message ?? "Gửi cuộc gọi thử thất bại");
          return;
        }
        toast.success(r.sandbox ? "Đã gửi (sandbox, không gọi thật)" : "Đã gửi — tổng đài sẽ gọi");
        setCalls((prev) => [
          {
            callId: r.callId!,
            refId: r.refId ?? "",
            phone: r.phone ?? p,
            type,
            sandbox: r.sandbox === true,
          },
          ...prev,
        ]);
        setPollUntil(Date.now() + POLL_WINDOW_MS);
      } catch (e: any) {
        toast.error(e?.message ?? "Gửi cuộc gọi thử thất bại");
      } finally {
        setSending(false);
      }
    })();
  };

  return (
    <div className="space-y-3">
      {vtech ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Vtech: cuộc gọi thử gọi thật theo kịch bản chiến dịch (biến ten_san_pham = “Hàng hoá”,
          diem_nhan = “Văn phòng CPN”) và tính phí. Kết quả về khi Vtech gọi webhook.
        </div>
      ) : live ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          Key LIVE: cuộc gọi thử sẽ gọi thật tới số điện thoại và tính phí.
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Key sandbox không gọi thật. Kết quả giả lập theo số cuối SĐT: 1 nghe máy · 2 nghe máy ở
          lần 2 · 3 không nghe (3 lần) · 4 lỗi tổng đài · số khác nghe máy. Kết quả về sau khoảng
          5–15 giây.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1.5">
          <Label className="text-xs">SĐT</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="0912345671"
            inputMode="tel"
          />
        </div>
        {vtech ? null : (
          <div className="w-40 space-y-1.5">
            <Label className="text-xs">Loại</Label>
            <select
              className={SELECT_CLASS}
              value={type}
              onChange={(e) => setType(e.target.value as AutoCallType)}
            >
              <option value="giao">Gọi giao</option>
              <option value="hoan">Gọi hoàn</option>
            </select>
          </div>
        )}
        <Button
          type="button"
          onClick={send}
          disabled={sending}
          variant={live ? "destructive" : "default"}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {sending ? "Đang gửi…" : live ? "Gọi thật" : "Gọi thử"}
        </Button>
      </div>

      {calls.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">SĐT</th>
                <th className="px-3 py-2 text-left font-medium">Loại</th>
                <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                <th className="px-3 py-2 text-right font-medium">Lần gọi</th>
                <th className="px-3 py-2 text-left font-medium">callId</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr
                  key={c.callId}
                  className={`border-t ${c.call ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  onClick={() => c.call && setDetail(c.call)}
                >
                  <td className="px-3 py-2 font-mono">
                    {c.phone}
                    {c.sandbox ? (
                      <Badge variant="outline" className="ml-2">
                        Sandbox
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{c.type === "hoan" ? "Hoàn" : "Giao"}</td>
                  <td className="px-3 py-2">
                    {c.call ? (
                      <HhvnStatusBadge status={c.call.status} result={c.call.result} />
                    ) : (
                      <Badge variant="secondary">Chờ gọi</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{c.call?.attemptCount ?? 0}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.callId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {hasPending ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {polling ? (
            <span>Đang theo dõi kết quả… (tự cập nhật mỗi 10 giây trong 5 phút)</span>
          ) : (
            <span>Còn cuộc gọi chưa có kết quả.</span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => refresh().catch(() => undefined)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cập nhật
          </Button>
        </div>
      ) : null}

      <CallDetailDialog
        call={detail}
        canCancel={!vtech}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onChanged={(c) => {
          setDetail(c);
          setCalls((prev) => prev.map((x) => (x.callId === c.callId ? { ...x, call: c } : x)));
        }}
      />
    </div>
  );
}
