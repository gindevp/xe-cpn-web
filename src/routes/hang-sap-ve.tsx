import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, officeName, ORDER_STATUS_LABEL, formatVND } from "@/lib/mock-data";
import { orderGoodsLabel } from "@/lib/package-label";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { Eye, FileText, Printer, PackageCheck, Search, Truck } from "lucide-react";

export const Route = createFileRoute("/hang-sap-ve")({
  head: () => ({ meta: [{ title: "Hàng sắp về — X.E" }] }),
  component: () => (
    <ProtectedPage title="Hàng sắp về" screen="hang-sap-ve">
      <Page />
    </ProtectedPage>
  ),
});

function destOfRoute(route: string): string {
  // route format: "HN → HCM" — return the destination code (right side).
  const parts = route.split("→");
  return (parts[1] ?? "").trim();
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const offices = useStore((s) => s.offices);

  const scopeAll =
    session?.role === "DH" || session?.role === "BL" || session?.role === "AD";

  const [destOffice, setDestOffice] = useState(
    scopeAll ? "" : session?.office && session.office !== "ALL" ? session.office : "",
  );
  const [q, setQ] = useState("");
  const [detailTrip, setDetailTrip] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const transitionOrder = useStore((s) => s.transitionOrder);
  const advanceOrderLeg = useStore((s) => s.advanceOrderLeg);

  // Reset selection when opening a different trip
  useEffect(() => {
    setSelected(new Set());
  }, [detailTrip]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return trips
      .filter((t) => t.status === "DEPARTED")
      .map((t) => {
        const dest = destOfRoute(t.route);
        const tripOrders = orders.filter((o) => o.tripCode === t.code);
        const totalQty = tripOrders.reduce((s, o) => s + (o.quantity ?? 1), 0);
        return { trip: t, dest, orderCount: tripOrders.length, totalQty };
      })
      .filter((r) => {
        if (destOffice && r.dest !== destOffice) return false;
        if (kw) {
          const hay = `${r.trip.code} ${r.trip.bks} ${r.trip.driver} ${r.trip.route}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.trip.departAt < b.trip.departAt ? 1 : -1));
  }, [trips, orders, destOffice, q]);

  const detailOrders = useMemo(() => {
    if (!detailTrip) return [];
    return orders.filter((o) => o.tripCode === detailTrip);
  }, [orders, detailTrip]);

  const detailTripObj = detailTrip
    ? trips.find((t) => t.code === detailTrip)
    : undefined;

  const toggleOne = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === detailOrders.length) setSelected(new Set());
    else setSelected(new Set(detailOrders.map((o) => o.code)));
  };

  const doArriveDest = () => {
    const codes = Array.from(selected);
    let ok = 0;
    let hub = 0;
    let fail = 0;
    for (const code of codes) {
      const ord = orders.find((o) => o.code === code);
      // Đơn nhiều chặng, chưa phải chặng cuối → advance sang chặng tiếp theo (đơn quay lại "Chờ gán xe" ở hub).
      if (ord?.legs && ord.legs.length > 1 && (ord.currentLegIndex ?? 0) < ord.legs.length - 1) {
        const r = advanceOrderLeg(code);
        if (r.ok) { ok++; hub++; } else fail++;
        continue;
      }
      const res = transitionOrder(
        code,
        "AT_DEST",
        "SCAN_IN",
        `Nhập kho nhận từ chuyến ${detailTripObj?.code ?? ""}`,
      );
      if (res.ok) ok++;
      else fail++;
    }
    if (ok) toast.success(`Đã nhập kho nhận ${ok} đơn${hub ? ` (${hub} đơn trung chuyển tiếp)` : ""}`);
    if (fail) toast.error(`${fail} đơn không thể chuyển`);
    setSelected(new Set());
  };

  const printList = () => {
    const list = selected.size > 0 ? detailOrders.filter((o) => selected.has(o.code)) : detailOrders;
    if (list.length === 0) {
      toast.error("Không có đơn để in");
      return;
    }
    downloadCSV(`DS-${detailTripObj?.code ?? "chuyen"}.csv`, [
      ["Mã đơn", "Tên hàng", "Số kiện", "Người gửi", "SĐT gửi", "Người nhận", "SĐT nhận", "VP nhận", "Thu hộ", "Trạng thái"],
      ...list.map((o) => [
        o.code,
        orderGoodsLabel(o),
        o.quantity ?? 1,
        o.senderName ?? "",
        o.senderPhone,
        o.receiverName,
        o.receiverPhone,
        officeName(o.toOffice),
        o.fare,
        ORDER_STATUS_LABEL[o.status],
      ]),
    ]);
    toast.success(`Đã xuất danh sách ${list.length} đơn`);
  };

  const printReceipts = () => {
    const list = selected.size > 0 ? detailOrders.filter((o) => selected.has(o.code)) : detailOrders;
    if (list.length === 0) {
      toast.error("Không có đơn để in");
      return;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Biên lai</title>
<style>
body{font-family:Arial,sans-serif;padding:16px;color:#111}
.receipt{border:1px dashed #999;padding:12px;margin-bottom:12px;page-break-inside:avoid}
.receipt h3{margin:0 0 6px;font-size:14px}
.row{display:flex;justify-content:space-between;font-size:12px;margin:2px 0}
.muted{color:#666}
@media print{.no-print{display:none}}
</style></head><body>
<div class="no-print" style="margin-bottom:12px"><button onclick="window.print()">In</button></div>
${list
  .map(
    (o) => `<div class="receipt">
  <h3>Biên lai ${o.code}</h3>
  <div class="row"><span class="muted">Chuyến:</span><b>${detailTripObj?.code ?? ""} · ${detailTripObj?.bks ?? ""}</b></div>
  <div class="row"><span class="muted">Lộ trình:</span><span>${officeName(o.fromOffice)} → ${officeName(o.toOffice)}</span></div>
  <div class="row"><span class="muted">Tên hàng:</span><span>${orderGoodsLabel(o)} · ${o.quantity ?? 1} kiện</span></div>
  <div class="row"><span class="muted">Người gửi:</span><span>${o.senderName ?? ""} · ${o.senderPhone}</span></div>
  <div class="row"><span class="muted">Người nhận:</span><span>${o.receiverName} · ${o.receiverPhone}</span></div>
  <div class="row"><span class="muted">Cước:</span><b>${formatVND(o.fare)}</b></div>
</div>`,
  )
  .join("")}
</body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error("Trình duyệt chặn cửa sổ in");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const allChecked = detailOrders.length > 0 && selected.size === detailOrders.length;
  const canAct = selected.size > 0;



  return (
    <div className="space-y-4">
      <Section title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Văn phòng nhận</Label>
            <SearchableSelect
              value={destOffice || "__all__"}
              onValueChange={(v) => setDestOffice(v === "__all__" ? "" : v)}
              className="w-[220px]"
              placeholder="Chọn văn phòng"
              options={[
                { value: "__all__", label: "Tất cả" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="ml-auto space-y-1.5">
            <Label className="text-xs">Tìm kiếm nhanh</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-[300px] pl-8"
                placeholder="Mã chuyến, BKS, tài xế"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Xe đang trên đường về (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Không có xe nào đang trên đường về</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Mã chuyến</th>
                  <th className="px-3 py-2 font-medium">Lộ trình</th>
                  <th className="px-3 py-2 font-medium">Giờ xuất bến</th>
                  <th className="px-3 py-2 font-medium">BKS</th>
                  <th className="px-3 py-2 font-medium">Tài xế</th>
                  <th className="px-3 py-2 text-right font-medium">Số đơn</th>
                  <th className="px-3 py-2 text-right font-medium">Số kiện</th>
                  <th className="px-3 py-2 text-right font-medium">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.trip.code} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.trip.code}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.trip.route}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(r.trip.departAt)}</td>
                    <td className="px-3 py-2 font-medium">{r.trip.bks}</td>
                    <td className="px-3 py-2">{r.trip.driver}</td>
                    <td className="px-3 py-2 text-right">{r.orderCount}</td>
                    <td className="px-3 py-2 text-right">{r.totalQty}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailTrip(r.trip.code)}
                      >
                        <Eye className="mr-1.5 h-4 w-4" />
                        Xem đơn
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog
        open={!!detailTrip}
        onOpenChange={(v) => !v && setDetailTrip(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Đơn hàng trong chuyến {detailTripObj?.code}
            </DialogTitle>
          </DialogHeader>
          {detailTripObj && (
            <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>Lộ trình: <b className="text-foreground">{detailTripObj.route}</b></span>
              <span>BKS: <b className="text-foreground">{detailTripObj.bks}</b></span>
              <span>Tài xế: <b className="text-foreground">{detailTripObj.driver}</b></span>
              <span>
                Xuất bến:{" "}
                <b className="text-foreground">
                  {formatDateTime(detailTripObj.departAt)}
                </b>
              </span>
            </div>
          )}
          {detailOrders.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="mr-auto text-xs text-muted-foreground">
                Đã chọn <b className="text-foreground">{selected.size}</b> / {detailOrders.length} đơn
              </div>
              <Button size="sm" variant="outline" onClick={printList}>
                <FileText className="mr-1.5 h-4 w-4" />
                In DS
              </Button>
              <Button size="sm" variant="outline" onClick={printReceipts}>
                <Printer className="mr-1.5 h-4 w-4" />
                In biên lai
              </Button>
              <Button size="sm" disabled={!canAct} onClick={doArriveDest}>
                <PackageCheck className="mr-1.5 h-4 w-4" />
                Nhập kho nhận
              </Button>
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto">
            {detailOrders.length === 0 ? (
              <EmptyState>Chuyến này chưa có đơn</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="w-8 px-2 py-2">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={toggleAll}
                        aria-label="Chọn tất cả"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Mã đơn</th>
                    <th className="px-2 py-2 font-medium">Tên hàng</th>
                    <th className="px-2 py-2 text-right font-medium">Số kiện</th>
                    <th className="px-2 py-2 font-medium">Người gửi</th>
                    <th className="px-2 py-2 font-medium">Người nhận</th>
                    <th className="px-2 py-2 font-medium">VP nhận</th>
                    <th className="px-2 py-2 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detailOrders.map((o) => (
                    <tr key={o.code} className="border-b">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(o.code)}
                          onCheckedChange={() => toggleOne(o.code)}
                          aria-label={`Chọn ${o.code}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{o.code}</td>
                      <td className="px-2 py-2">{orderGoodsLabel(o)}</td>
                      <td className="px-2 py-2 text-right">{o.quantity ?? 1}</td>
                      <td className="px-2 py-2">
                        <div>{o.senderName}</div>
                        <div className="text-xs text-muted-foreground">{o.senderPhone}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div>{o.receiverName}</div>
                        <div className="text-xs text-muted-foreground">{o.receiverPhone}</div>
                      </td>
                      <td className="px-2 py-2">{officeName(o.toOffice)}</td>
                      <td className="px-2 py-2">
                        <Badge variant="secondary">
                          {ORDER_STATUS_LABEL[o.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
