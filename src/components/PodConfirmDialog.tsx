import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NameInput } from "@/components/NameInput";
import { Label } from "@/components/ui/label";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { ahamoveActive } from "@/lib/ahamove";
import { isApiEnabled } from "@/lib/api/client";
import {
  orderDueAmount,
  receiptCollectableAmount,
  receiverDueAmount,
  receiverStorageDue,
} from "@/lib/finance-debt";
import { formatVND } from "@/lib/mock-data";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";

/**
 * Bước POD trước khi chuyển DELIVERED (shipper giao tận nhà).
 * Ảnh POD bắt buộc ≥1 — action "POD" đẩy lên BE POST /api/orders/{code}/pod.
 * Không thu tiền tại bước này (giữ nguyên hành vi nút "Giao thành công" cũ).
 * Admin: đơn còn tiền người nhận phải chọn nhân viên đang giữ tiền (BE ghi đã thu đủ cho người đó);
 * đơn ở kho giao / Ahamove mất callback = giao bù, cần lý do, ảnh không bắt buộc.
 */
export function PodConfirmDialog({
  codes,
  open,
  onOpenChange,
  onFinished,
}: {
  codes: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFinished?: (deliveredCodes: string[]) => void;
}) {
  const { session } = useAuth();
  const isAdmin = session?.role === "AD";
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [actualName, setActualName] = useState("");
  const [actualPhone, setActualPhone] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [failedReason, setFailedReason] = useState("");
  const [catchUpReason, setCatchUpReason] = useState("");
  const [owner, setOwner] = useState("");

  const code = codes[idx];
  const order = useMemo(() => orders.find((o) => o.code === code), [orders, code]);
  const fromFailed = order?.status === "FAILED_DELIVERY";
  const catchUp = !!order && isAdmin && (order.status === "AT_DEST" || ahamoveActive(order));
  const cod = Math.max(0, order?.codAmount ?? 0);
  const needOwner =
    !!order && isAdmin && order.status !== "RETURNING" && (receiverDueAmount(order) > 0 || cod > 0);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setDone([]);
    setOwner("");
  }, [open, codes]);

  useEffect(() => {
    if (!open || !isAdmin || users.length > 0 || !isApiEnabled()) return;
    void import("@/lib/api/sync")
      .then((m) => m.syncStaffFromApi())
      .catch(() => undefined);
  }, [open, isAdmin, users.length]);

  useEffect(() => {
    setPhotos([]);
    setFailedReason("");
    setCatchUpReason("");
    setActualName(order?.receiverActualName || order?.receiverName || "");
    setActualPhone(order?.receiverActualPhone || "");
    // Chỉ reset khi sang đơn khác, không reset khi store cập nhật đơn hiện tại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, open]);

  const ownerOptions = useMemo(() => {
    const dest = (order?.finalToOffice || order?.toOffice || "").trim().toUpperCase();
    return users
      .filter((u) => u.active !== false)
      .sort((a, b) => {
        const ad = (a.office ?? "").trim().toUpperCase() === dest ? 0 : 1;
        const bd = (b.office ?? "").trim().toUpperCase() === dest ? 0 : 1;
        return ad - bd || a.username.localeCompare(b.username);
      })
      .map((u) => ({
        value: u.username,
        label: `${u.displayName?.trim() || u.username} · ${u.username}${u.office ? ` · ${u.office}` : ""}`,
        keywords: `${u.username} ${u.displayName ?? ""} ${u.staffCode ?? ""}`,
      }));
  }, [users, order?.finalToOffice, order?.toOffice]);

  const finish = (processed: string[]) => {
    onOpenChange(false);
    if (processed.length && useStore.getState().online) {
      toast.success(`Đã giao thành công ${processed.length} đơn`);
    }
    onFinished?.(processed);
  };

  const goNext = (processed: string[]) => {
    if (idx + 1 >= codes.length) finish(processed);
    else setIdx(idx + 1);
  };

  const confirm = () => {
    if (!order) return;
    const name = actualName.trim();
    if (!name) return toast.error("Nhập tên người nhận thực tế");
    const bu = catchUpReason.trim();
    if (catchUp && !bu) return toast.error("Nhập lý do giao thành công bù");
    if (photos.length === 0 && !catchUp) return toast.error("Cần ít nhất 1 ảnh POD");
    if (needOwner && !owner) return toast.error("Chọn nhân viên đang giữ tiền của khách");
    const why = failedReason.trim();
    if (fromFailed && !why) return toast.error("Nhập lý do chuyển giao thất bại sang giao thành công");

    const st = useStore.getState();
    if (fromFailed && !st.online) return toast.error("Cần có mạng để chuyển đơn giao thất bại sang giao thành công");
    if ((catchUp || needOwner) && !st.online) return toast.error("Cần có mạng để giao bù / gán người giữ tiền");
    if (!st.online) {
      st.enqueueOffline({
        kind: "POD_HOME",
        payload: {
          code: order.code,
          actualName: name,
          actualPhone: actualPhone.trim(),
          photos: photos.slice(0, 3),
          amount: 0,
          method: "TM",
        },
      });
      toast.info(`${order.code}: đã lưu offline, sẽ đồng bộ khi có mạng`);
      const queued = [...done, order.code];
      setDone(queued);
      goNext(queued);
      return;
    }
    photos.slice(0, 3).forEach((p) => st.addPodPhoto(order.code, p));
    st.updateOrder(order.code, {
      receiverActualName: name,
      ...(actualPhone.trim() ? { receiverActualPhone: actualPhone.trim() } : {}),
    });
    // Đơn hoàn (RETURNING): POD → RETURNED. Đơn đi: → DELIVERED.
    const toStatus = order.status === "RETURNING" ? "RETURNED" : "DELIVERED";
    const action = order.status === "AT_DEST" && !ahamoveActive(order) ? "POD_QUAY" : "POD";
    const opts = {
      collectedAmount: 0,
      ...(fromFailed ? { failedReason: why } : {}),
      ...(needOwner ? { debtOwnerUsername: owner } : {}),
      ...(catchUp ? { catchUpReason: bu, photos: photos.slice(0, 3) } : {}),
    };
    let detail = fromFailed ? `${name} · Giao thất bại → thành công: ${why}` : name;
    if (catchUp) detail += ` · Giao bù: ${bu}`;
    const t = st.transitionOrder(order.code, toStatus, action, detail, opts);
    if (!t.ok) return toast.error(`${order.code}: ${t.error}`);

    const delivered = [...done, order.code];
    setDone(delivered);
    goNext(delivered);
  };

  const due = order ? orderDueAmount(order) : 0;
  const collectable = order ? receiptCollectableAmount(order) : 0;
  const receiverDue = order ? receiverDueAmount(order) : 0;
  const storageDue = order && order.status !== "RETURNING" ? receiverStorageDue(order) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : finish(done))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {catchUp ? "Giao thành công bù" : "Ảnh POD & xác nhận giao"}
            {codes.length > 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Đơn {idx + 1}/{codes.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!order ? (
          <p className="text-sm text-destructive">Không tìm thấy đơn {code}</p>
        ) : (
          <div className="space-y-3">
            {fromFailed && (
              <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3">
                <Label>Lý do chuyển giao thất bại → giao thành công *</Label>
                <Input
                  value={failedReason}
                  maxLength={200}
                  placeholder="VD: Khách đến bưu cục nhận, gọi lại khách đã nhận…"
                  onChange={(e) => setFailedReason(e.target.value)}
                />
              </div>
            )}
            {catchUp && (
              <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3">
                <Label>Lý do giao bù *</Label>
                <Input
                  value={catchUpReason}
                  maxLength={200}
                  placeholder="VD: Đã giao khách nhưng quên quét; Ahamove giao xong không báo về…"
                  onChange={(e) => setCatchUpReason(e.target.value)}
                />
              </div>
            )}
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{order.code}</span>
                <OrderStatusBadge status={order.status} issue={order.issue} />
              </div>
              <div className="mt-1 text-muted-foreground">
                {order.receiverName} · {order.receiverPhone}
                {order.address ? ` · ${order.address}` : ""}
              </div>
              {collectable > 0 && !needOwner && (
                <div className="mt-1">
                  Còn phải thu (phiếu thu):{" "}
                  <span className="font-semibold">{formatVND(collectable)}</span>
                  {cod > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      (cước {formatVND(due)} + COD {formatVND(cod)})
                    </span>
                  ) : null}{" "}
                  <span className="text-xs text-muted-foreground">
                    (bước này không thu tiền — thu ở phiếu thu)
                  </span>
                </div>
              )}
              {storageDue > 0 && (
                <div className="mt-1 text-amber-700">
                  Phí tồn kho người nhận trả: <span className="font-semibold">{formatVND(storageDue)}</span>
                  <span className="text-xs"> (đơn người gửi trả — thu người nhận, người giao lập phiếu thu)</span>
                </div>
              )}
            </div>

            {needOwner && (
              <div className="space-y-1.5 rounded-md border border-sky-300 bg-sky-50 p-3">
                <Label>Nhân viên đang giữ tiền của khách *</Label>
                <SearchableSelect
                  value={owner}
                  onValueChange={setOwner}
                  options={ownerOptions}
                  placeholder="Chọn nhân viên"
                  searchPlaceholder="Tìm tên / mã NV"
                />
                <p className="text-xs text-muted-foreground">
                  {receiverDue > 0 ? `Ghi đã thu ${formatVND(receiverDue)} cước` : "Cước đã thu đủ"}
                  {cod > 0 ? ` · COD ${formatVND(cod)}` : ""} — nhân viên này chịu nợ, nộp qua phiếu thu.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Tên người nhận thực tế *</Label>
              <NameInput preserveCase value={actualName} onChange={setActualName} />
            </div>
            <div className="space-y-1.5">
              <Label>SĐT người nhận hộ</Label>
              <Input value={actualPhone} onChange={(e) => setActualPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ảnh POD (1–3){catchUp ? "" : " *"}</Label>
              <PodPhotoInput photos={photos} onChange={setPhotos} max={3} />
              <p className="text-xs text-muted-foreground">
                Bấm nút chụp để mở camera. Ảnh giữ nguyên khung máy chụp và được nén trước khi lưu.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => finish(done)}>
            Hủy
          </Button>
          {codes.length > 1 && idx + 1 < codes.length && (
            <Button variant="ghost" onClick={() => goNext(done)}>
              Bỏ qua đơn này
            </Button>
          )}
          <Button
            className="gap-2"
            onClick={confirm}
            disabled={
              !order ||
              (photos.length === 0 && !catchUp) ||
              (catchUp && !catchUpReason.trim()) ||
              (needOwner && !owner) ||
              (fromFailed && !failedReason.trim())
            }
          >
            <PackageCheck className="h-4 w-4" />
            Xác nhận giao
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
