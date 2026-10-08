import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiRequest, isApiEnabled } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/lay-hang")({
  head: () => ({
    meta: [
      { title: "Lấy hàng — X.E" },
      { name: "description", content: "Tra cứu đơn đến lấy tại văn phòng sau khi quét mã QR." },
    ],
  }),
  component: PickupPage,
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === "string" ? search.t : "",
  }),
});

type PickupOrder = {
  orderCode: string;
  goodsLabel?: string;
  senderPhone?: string;
  receiverPhone?: string;
  fromOfficeName?: string;
};

function customerDeviceId() {
  const key = "xe.trackDeviceId";
  try {
    const cur = localStorage.getItem(key);
    if (cur && /^[A-Za-z0-9._-]{8,80}$/.test(cur)) return cur;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `web-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return "web-no-storage";
  }
}

function PickupPage() {
  const { t } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<PickupOrder[] | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!t) {
      toast.error("Quét mã QR trên màn hình tại văn phòng");
      return;
    }
    if (!q) {
      toast.error("Nhập mã đơn hoặc số điện thoại người nhận");
      return;
    }
    if (!isApiEnabled()) {
      toast.error("Chưa cấu hình máy chủ");
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ orders: PickupOrder[] }>("/api/public/office-screen/lookup", {
        method: "POST",
        auth: false,
        headers: { "X-Device-Id": customerDeviceId() },
        body: { token: t, query: q },
      });
      setOrders(res.orders ?? []);
    } catch (e) {
      setOrders(null);
      toast.error(e instanceof ApiError ? e.message : "Không tra cứu được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-8">
      <div className="text-sm font-semibold text-primary">X.E VIỆT NAM</div>
      <h1 className="mt-1 text-2xl font-bold">Tra cứu đơn lấy hàng</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nhập mã đơn hoặc số điện thoại người nhận. Mã QR hết hạn thì quét lại trên màn hình văn phòng.
      </p>
      {!t ? (
        <div className="mt-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          Hãy quét mã QR đang chiếu tại quầy. Mở lại link cũ sẽ không vào được.
        </div>
      ) : (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mã đơn hoặc SĐT người nhận"
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Đang tìm…" : "Tra cứu"}
          </Button>
        </form>
      )}
      {orders && orders.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Không thấy đơn đang chờ lấy tại văn phòng này.</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {orders?.map((o) => (
          <div key={o.orderCode} className="rounded-xl border px-4 py-3 text-sm">
            <div className="text-lg font-bold">{o.orderCode}</div>
            <div className="mt-1">{o.goodsLabel || "Hàng hoá"}</div>
            <div className="mt-2 text-muted-foreground">SĐT người gửi: {o.senderPhone || "—"}</div>
            <div className="text-muted-foreground">SĐT người nhận: {o.receiverPhone || "—"}</div>
            <div className="text-muted-foreground">VP gửi: {o.fromOfficeName || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
