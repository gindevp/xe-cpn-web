import { Section } from "@/components/PageBits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, isApiEnabled } from "@/lib/api/client";
import { formatDateTime } from "@/lib/mock-data";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type AutoCallView = {
  id: number;
  callType: "giao" | "hoan";
  status: string;
  result?: string | null;
  phone?: string | null;
  attemptCount?: number | null;
  firstCallAt?: string | null;
  answeredAt?: string | null;
  finishedAt?: string | null;
  durationSec?: number | null;
  recordingUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sandbox?: boolean | null;
  createdAt: string;
  retryNo?: number | null;
  retryDay?: number | null;
  nextRetryAt?: string | null;
};

const FINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"]);
/** Đang đổ chuông (CALLING) thì HHVN không huỷ được. */
const CANCELLABLE = new Set(["PENDING", "ERROR", "QUEUED", "RETRYING"]);

function statusBadge(c: AutoCallView) {
  switch (c.status) {
    case "COMPLETED":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Nghe máy</Badge>;
    case "FAILED":
      return (
        <Badge variant="destructive">
          {c.result === "error"
            ? "Lỗi tổng đài"
            : c.result === "send_error"
              ? "Gửi lỗi"
              : "Không nghe máy"}
        </Badge>
      );
    case "CANCELLED":
      return <Badge variant="outline">Đã huỷ</Badge>;
    case "SKIPPED":
      return <Badge variant="outline">Không gọi</Badge>;
    case "ERROR":
      return <Badge variant="destructive">Gửi lỗi</Badge>;
    case "RETRYING":
      return <Badge variant="secondary">Chờ gọi lại</Badge>;
    case "CALLING":
      return <Badge variant="secondary">Đang gọi</Badge>;
    default:
      return (
        <Badge variant="secondary">
          {c.status === "PENDING" && c.nextRetryAt ? "Chờ khung giờ" : "Chờ gọi"}
        </Badge>
      );
  }
}

function phoneKey(p?: string | null) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.startsWith("84") ? `0${d.slice(2)}` : d;
}

/** Cuộc Auto Call gần nhất của đơn, tách theo người bị gọi (gọi giao → người nhận, gọi hoàn → người gửi). */
export function useLatestAutoCalls(
  orderCode: string | null | undefined,
  senderPhone?: string | null,
  receiverPhone?: string | null,
) {
  const [calls, setCalls] = useState<AutoCallView[]>([]);
  useEffect(() => {
    if (!isApiEnabled() || !orderCode) {
      setCalls([]);
      return;
    }
    let alive = true;
    apiRequest<AutoCallView[]>(`/api/orders/${encodeURIComponent(orderCode)}/auto-calls`)
      .then((list) => alive && setCalls(list ?? []))
      .catch(() => alive && setCalls([]));
    return () => {
      alive = false;
    };
  }, [orderCode]);

  const sender = phoneKey(senderPhone);
  const receiver = phoneKey(receiverPhone);
  const latest = (side: "sender" | "receiver") =>
    calls
      .filter((c) => {
        const p = phoneKey(c.phone);
        if (p && p === sender && p !== receiver) return side === "sender";
        if (p && p === receiver && p !== sender) return side === "receiver";
        return (c.callType === "hoan") === (side === "sender");
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return { sender: latest("sender"), receiver: latest("receiver") };
}

/** Dòng trạng thái Auto Call thu gọn dưới thông tin người gửi / nhận. */
export function AutoCallMini({ call }: { call?: AutoCallView }) {
  if (!call) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground [&_.inline-flex]:px-1.5 [&_.inline-flex]:py-0 [&_.inline-flex]:text-[10px]">
      <span className="font-medium text-foreground">Auto Call</span>
      {statusBadge(call)}
      <span>{formatDateTime(call.answeredAt ?? call.finishedAt ?? call.createdAt)}</span>
      {call.nextRetryAt ? <span>· hẹn gọi {formatDateTime(call.nextRetryAt)}</span> : null}
    </div>
  );
}

/** Cuộc gọi Auto Call (HHVN) của đơn — chỉ hiện khi đơn đã có cuộc gọi. */
export function OrderAutoCalls({ orderCode }: { orderCode: string }) {
  const [calls, setCalls] = useState<AutoCallView[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const load = useCallback(async () => {
    const list = await apiRequest<AutoCallView[]>(
      `/api/orders/${encodeURIComponent(orderCode)}/auto-calls`,
    );
    setCalls(list ?? []);
  }, [orderCode]);

  useEffect(() => {
    if (!isApiEnabled() || !orderCode) return;
    load().catch(() => setCalls([]));
  }, [orderCode, load]);

  if (calls.length === 0) return null;

  const sync = () => {
    setSyncing(true);
    void (async () => {
      try {
        const list = await apiRequest<AutoCallView[]>(
          `/api/orders/${encodeURIComponent(orderCode)}/auto-calls/sync`,
          {
            method: "POST",
            body: {},
          },
        );
        setCalls(list ?? []);
        toast.success("Đã cập nhật kết quả Auto Call");
      } catch (e: any) {
        toast.error(e?.message ?? "Cập nhật Auto Call thất bại");
      } finally {
        setSyncing(false);
      }
    })();
  };

  const cancel = (c: AutoCallView) => {
    if (
      !window.confirm(
        `Huỷ cuộc gọi tới ${c.phone ?? "người nhận"}? Tổng đài sẽ không gọi số này nữa.`,
      )
    )
      return;
    setCancelling(c.id);
    void (async () => {
      try {
        const list = await apiRequest<AutoCallView[]>(
          `/api/orders/${encodeURIComponent(orderCode)}/auto-calls/${c.id}/cancel`,
          { method: "POST", body: {} },
        );
        setCalls(list ?? []);
        toast.success("Đã huỷ cuộc gọi");
      } catch (e: any) {
        toast.error(e?.message ?? "Huỷ cuộc gọi thất bại");
      } finally {
        setCancelling(null);
      }
    })();
  };

  const stopRetry = (c: AutoCallView) => {
    if (!window.confirm("Dừng gọi lại cho đơn này?")) return;
    setCancelling(c.id);
    void (async () => {
      try {
        const list = await apiRequest<AutoCallView[]>(
          `/api/orders/${encodeURIComponent(orderCode)}/auto-calls/${c.id}/stop-retry`,
          { method: "POST", body: {} },
        );
        setCalls(list ?? []);
        toast.success("Đã dừng gọi lại");
      } catch (e: any) {
        toast.error(e?.message ?? "Dừng gọi lại thất bại");
      } finally {
        setCancelling(null);
      }
    })();
  };

  const pending = calls.some((c) => !FINAL.has(c.status));

  return (
    <Section
      title={`Auto Call (${calls.length})`}
      right={
        pending ? (
          <Button type="button" size="sm" variant="outline" onClick={sync} disabled={syncing}>
            {syncing ? "Đang cập nhật…" : "Cập nhật"}
          </Button>
        ) : null
      }
    >
      <ul className="space-y-3">
        {calls.map((c) => (
          <li key={c.id} className="rounded-md border p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(c)}
              <span className="font-medium">
                Gọi {c.callType === "hoan" ? "hoàn" : "giao"}
                {c.retryDay ? ` · ngày ${c.retryDay + 1}` : ""}
                {c.retryNo ? ` · gọi lại lần ${c.retryNo}` : ""}
              </span>
              <span className="font-mono text-xs">{c.phone ?? "—"}</span>
              {c.sandbox ? <Badge variant="outline">Sandbox</Badge> : null}
              {CANCELLABLE.has(c.status) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2 text-xs"
                  disabled={cancelling === c.id}
                  onClick={() => cancel(c)}
                >
                  {cancelling === c.id ? "Đang huỷ…" : "Huỷ"}
                </Button>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(c.createdAt)}
              {c.attemptCount ? ` · ${c.attemptCount} lần gọi` : ""}
              {c.durationSec != null && c.status === "COMPLETED" ? ` · nghe ${c.durationSec}s` : ""}
              {c.answeredAt ? ` · nghe máy lúc ${formatDateTime(c.answeredAt)}` : ""}
            </div>
            {c.nextRetryAt && c.status === "PENDING" ? (
              <div className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Ngoài khung giờ gọi — sẽ gọi lúc {formatDateTime(c.nextRetryAt)}
              </div>
            ) : c.nextRetryAt ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                <span>Hẹn gọi lại lúc {formatDateTime(c.nextRetryAt)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 px-2 text-xs"
                  disabled={cancelling === c.id}
                  onClick={() => stopRetry(c)}
                >
                  Dừng gọi lại
                </Button>
              </div>
            ) : null}
            {c.errorMessage && (c.status === "ERROR" || c.status === "SKIPPED") ? (
              <div className="mt-1 text-xs text-destructive">{c.errorMessage}</div>
            ) : null}
            {c.recordingUrl ? (
              <audio controls preload="none" src={c.recordingUrl} className="mt-2 h-8 w-full" />
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
