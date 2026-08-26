import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, InfoRow, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import {
  COLLECT_FORMS, PAY_METHODS,
  formatVND, formatDateTime, officeName, orderReceiverOffice,
} from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Ban, Sliders, RotateCcw, Send, PackageCheck, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { displayOrderNote, orderGoodsLabel, packageRows } from "@/lib/package-label";
import { TaoDonDialog, type TaoDonInitial } from "@/components/TaoDonDialog";


export const Route = createFileRoute("/van-don_/$ma")({
  head: () => ({ meta: [{ title: "Chi tiết vận đơn — X.E" }] }),
  component: () => (
    <ProtectedPage title="Chi tiết vận đơn" screen="van-don">
      <Detail />
    </ProtectedPage>
  ),
});

function Detail() {
  const { ma } = useParams({ from: "/van-don_/$ma" });
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const order = orders.find((o) => o.code === ma || o.draftCode === ma);
  const [editOpen, setEditOpen] = useState(false);

  if (!order) return <EmptyState>Không tìm thấy đơn {ma}</EmptyState>;

  const goodsName = orderGoodsLabel(order);

  const formLabel = COLLECT_FORMS.find((g) => g.value === order.collectForm)?.label ?? order.collectForm;
  const routeFare = order.fare;
  const pickup = order.pickupFee ?? 0;
  const delivery = order.deliveryFee ?? 0;
  const total = routeFare + pickup + delivery;
  const paid = order.paidAmount ?? 0;

  const buttons: { label: string; icon: any; to: string; screen: any }[] = [
    { label: "Hủy", icon: Ban, to: "/duyet-huy", screen: "duyet-huy" },
    { label: "Điều chỉnh", icon: Sliders, to: "/dieu-chinh", screen: "dieu-chinh" },
    { label: "Hoàn hàng", icon: RotateCcw, to: "/hoan-hang", screen: "hoan-hang" },
    { label: "Đẩy ship", icon: Send, to: "/day-ship", screen: "day-ship" },
    { label: "POD", icon: PackageCheck, to: "/pod-quay", screen: "pod-quay" },
  ];

  const showPod = order.status === "DELIVERED" && session?.role !== "KT" && (order.podPhotos?.length ?? 0) > 0;
  const canEdit =
    canWrite(session?.role, "van-don") &&
    !["DELIVERED", "CANCELLED", "RETURNED"].includes(order.status);

  const editInitial: TaoDonInitial = {
    code: order.code,
    senderPhone: order.senderPhone,
    senderName: order.senderName ?? "",
    fromOffice: order.fromOffice,
    homePickup: !!order.homePickup,
    pickupAddr: order.homePickup ? order.address ?? "" : "",
    pickupFee: order.pickupFee ?? 0,
    receiverPhone: order.receiverPhone,
    receiverName: order.receiverName,
    toOffice: orderReceiverOffice(order),
    homeDeliver: !!order.homeDelivery,
    deliverAddr: order.homeDelivery ? order.address ?? "" : "",
    deliverFee: order.deliveryFee ?? 0,
    orderNote: displayOrderNote(order.note),
    codAmount: 0,
    items: packageRows(order).map((p) => ({
      id: `${order.code}-${p.seq}`,
      sl: p.itemQty,
      kind: p.kind,
      name: p.goodsName,
      weight: p.weightKg ?? order.weightKg ?? 0,
      dai: 0,
      rong: 0,
      cao: 0,
      value: 0,
      note: displayOrderNote(order.note),
      fare: p.fare,
    })),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{order.code}</h2>
        <OrderStatusBadge status={order.status} />
        {order.draftCode && order.code !== order.draftCode && <span className="text-sm text-muted-foreground">Mã nháp: {order.draftCode}</span>}
        {order.tripCode && <span className="text-sm">Chuyến: <b>{order.tripCode}</b></span>}
        {canEdit && (
          <Button size="sm" className="ml-auto gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Sửa đơn hàng
          </Button>
        )}
      </div>


      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Section title="Thông tin đơn">
            <InfoRow label="SĐT / Tên gửi" value={`${order.senderPhone}${order.senderName ? " · " + order.senderName : ""}`} />
            <InfoRow label="Tên / SĐT nhận" value={`${order.receiverName} · ${order.receiverPhone}`} />
            <InfoRow label="VP đi" value={officeName(order.fromOffice)} />
            <InfoRow label="VP đến / đầu mối" value={officeName(order.toOffice) + (order.hubOffice ? ` · Đầu mối ${officeName(order.hubOffice)}` : "")} />
            {order.address && <InfoRow label="Địa chỉ nhà" value={order.address} />}
            <InfoRow label="Loại hàng" value={goodsName} />
            <InfoRow label="Hình thức thu" value={formLabel} />
            <InfoRow label="Lấy / Giao TN" value={`${order.homePickup ? "Có lấy" : "—"} / ${order.homeDelivery ? "Có giao" : "—"}`} />
            <InfoRow label="Cân" value={order.weightKg ? `${order.weightKg} KG` : "—"} />
            <InfoRow label="Kích thước" value={order.dimensions ?? "—"} />
            <InfoRow label="Kệ" value={order.shelf != null ? String(order.shelf) : "—"} />
            <InfoRow label="Ghi chú" value={displayOrderNote(order.note) || "—"} />
            {order.receiverActualName && <InfoRow label="Người nhận thực tế" value={`${order.receiverActualName}${order.receiverActualPhone ? " · " + order.receiverActualPhone : ""}`} />}
          </Section>

          <Section title="Cước (BR-027)">
            <InfoRow label="Cước tuyến" value={formatVND(routeFare)} />
            <InfoRow label="Phí lấy TN" value={formatVND(pickup)} />
            <InfoRow label="Phí giao TN / đối tác" value={formatVND(delivery)} />
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
              <span>Tổng</span><span className="text-primary">{formatVND(total)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Đã thu</span>
              <span className={paid >= total ? "text-success" : "text-destructive font-semibold"}>{formatVND(paid)}</span>
            </div>
          </Section>

          <Section title={`Payments (${(order.payments ?? []).length})`}>
            {!(order.payments ?? []).length ? <EmptyState /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-4">Số tiền</th>
                      <th className="py-2 pr-4">Kind</th>
                      <th className="py-2 pr-4">Phương thức</th>
                      <th className="py-2 pr-4">Người thu</th>
                      <th className="py-2 pr-4">Thời điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments!.map((p, i) => (
                      <tr key={i} className={`border-b last:border-0 ${p.amount < 0 ? "bg-destructive/5" : ""}`}>
                        <td className={`py-2 pr-4 font-medium ${p.amount < 0 ? "text-destructive" : ""}`}>{formatVND(p.amount)}</td>
                        <td className="py-2 pr-4">{p.kind}</td>
                        <td className="py-2 pr-4">{PAY_METHODS.find((x) => x.value === p.method)?.label ?? p.method}</td>
                        <td className="py-2 pr-4">{p.by}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(p.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`POD gallery${showPod ? ` (${order.podPhotos?.length})` : ""}`}>
            {showPod ? (
              <div className="grid grid-cols-3 gap-2">
                {order.podPhotos!.map((p, i) => (
                  <img key={i} src={p.url} alt={`pod-${i}`} className="aspect-square rounded-md border object-cover" />
                ))}
              </div>
            ) : (
              <EmptyState>{session?.role === "KT" ? "KT không xem POD" : "Chưa có ảnh POD"}</EmptyState>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title={`Timeline (${(order.events ?? []).length})`}>
            <ol className="space-y-3 border-l pl-4">
              {(order.events ?? []).map((e, i) => (
                <li key={i} className="relative">
                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="text-sm font-medium">{e.action}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.by} · {formatDateTime(e.at)}{e.detail ? ` · ${e.detail}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Thao tác">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {buttons.map((b) => {
                if (!canWrite(session?.role, b.screen)) return null;
                const Icon = b.icon;
                return (
                  <Button key={b.label} variant="outline" asChild className="justify-start gap-2">
                    <Link to={b.to}><Icon className="h-4 w-4" /> {b.label}</Link>
                  </Button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      <TaoDonDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={editInitial}
      />
    </div>
  );
}

