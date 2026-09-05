import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ORDER_STATUS_LABEL,
  formatDateTime,
  officeName,
  canonicalOfficeCode,
  orderReceiverOffice,
  receiverOfficeName,
  orderRouteLabel,
  formatVND,
  COLLECT_FORMS,
  describeItinerary,
} from "@/lib/mock-data";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { useStore } from "@/lib/store";
import { displayOrderNote, orderGoodsLabel, packageRows } from "@/lib/package-label";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { TaoDonDialog, type TaoDonInitial } from "@/components/TaoDonDialog";
import { OrderCodeLink, useOrderHistory } from "@/components/OrderHistoryDialog";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Download,
  Filter,
  X,
  ChevronDown,
  Truck,
  ClipboardList,
  Weight,
  Package,
  Banknote,
  Wallet,
  MoreHorizontal,
  Pencil,
  MessageSquare,
  Printer,
  History,
  Ban,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { canRead } from "@/lib/rbac";
import { downloadCSV } from "@/lib/csv";
import { AssignVehiclePicker, findOpenTripByPlate, realDriverName, realVehiclePlate, tripItineraryLabel, type AssignVehiclePick } from "@/components/AssignVehiclePicker";

export const Route = createFileRoute("/van-don")({
  head: () => ({ meta: [{ title: "Đơn chờ gán xe — X.E" }] }),
  component: () => (
    <ProtectedPage title="Đơn chờ gán xe" screen="van-don">
      <Page />
    </ProtectedPage>
  ),
});

type Filters = {
  from: string;
  to: string;
  senderOffices: string[];
  receiverOffice: string;
  orderStatus: string;
  codStatus: string;
  fareStatus: string;
  unit: string;
  createdBy: string;
  smsStatus: string;
  printStatus: string;
};

const EMPTY: Filters = {
  from: "",
  to: "",
  senderOffices: [],
  receiverOffice: "",
  orderStatus: "",
  codStatus: "",
  fareStatus: "",
  unit: "",
  createdBy: "",
  smsStatus: "",
  printStatus: "",
};

function sameOfficeScope(a?: string | null, b?: string | null) {
  const ca = canonicalOfficeCode(a);
  const cb = canonicalOfficeCode(b);
  return !!ca && !!cb && ca === cb;
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const transitionOrder = useStore((s) => s.transitionOrder);

  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);

  const scopeAll = hasAllOfficeScope(session);

  const rows = useMemo(() => {
    return orders.filter((o) => {
      // Đã gán lên xe → chuyển sang "Hàng trên xe", không hiển thị ở đây
      if (o.tripCode) return false;
      // Đơn lấy tận nơi / quét QR tại bưu cục chưa nhập kho → còn ở "Chờ bàn giao"
      if ((o.homePickup || o.qrDropOff) && !o.pickedUpAt) return false;
      if (["IN_TRANSIT", "AT_DEST", "DELIVERED", "RETURNED"].includes(o.status))
        return false;
      if (
        !scopeAll &&
        session?.office &&
        !sameOfficeScope(session.office, o.fromOffice) &&
        !sameOfficeScope(session.office, orderReceiverOffice(o)) &&
        !sameOfficeScope(session.office, o.toOffice) &&
        !(o.hubOffice && sameOfficeScope(session.office, o.hubOffice))
      )
        return false;

      if (applied.from && new Date(o.createdAt) < new Date(applied.from))
        return false;
      if (
        applied.to &&
        new Date(o.createdAt) > new Date(applied.to + "T23:59:59")
      )
        return false;
      if (
        applied.senderOffices.length > 0 &&
        !applied.senderOffices.includes(o.fromOffice)
      )
        return false;
      if (applied.receiverOffice && !sameOfficeScope(applied.receiverOffice, orderReceiverOffice(o)))
        return false;
      if (applied.orderStatus && o.status !== applied.orderStatus) return false;
      if (applied.codStatus) {
        const has = (o.collectForm ?? "").length > 0;
        if (applied.codStatus === "co" && !has) return false;
        if (applied.codStatus === "khong" && has) return false;
      }
      if (applied.fareStatus) {
        const paid = (o.paidAmount ?? 0) >= o.fare && o.fare > 0;
        if (applied.fareStatus === "da_thu" && !paid) return false;
        if (applied.fareStatus === "chua_thu" && paid) return false;
      }
      return true;
    });
  }, [orders, applied, session, scopeAll]);

  const metrics = useMemo(() => {
    const totalOrders = rows.length;
    const totalWeight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const totalQuantity = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const remain = rows.reduce(
      (s, r) => s + Math.max(0, r.fare - (r.paidAmount ?? 0)),
      0,
    );
    return { totalOrders, totalWeight, totalQuantity, paid, remain };
  }, [rows]);

  const activeCount = countActive(applied);

  const canExport = canRead(session?.role, "van-don");

  const doExport = () => {
    downloadCSV(`van-don-${new Date().toISOString().slice(0, 10)}.csv`, [
      [
        "Mã",
        "SĐT gửi",
        "SĐT nhận",
        "VP đi",
        "VP đến",
        "Trạng thái",
        "Cước",
        "Đã thu",
        "Tạo",
        "Cập nhật",
        "Chuyến",
      ],
      ...rows.map((r) => [
        r.code,
        r.senderPhone,
        r.receiverPhone,
        r.fromOffice,
        r.toOffice,
        ORDER_STATUS_LABEL[r.status],
        r.fare,
        r.paidAmount ?? 0,
        r.createdAt,
        r.updatedAt,
        r.tripCode ?? "",
      ]),
    ]);
  };

  const apply = () => {
    setApplied(draft);
    setOpen(false);
  };
  const clearAll = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
  };

  const openFilter = () => {
    setDraft(applied);
    setOpen(true);
  };

  const setInline = (patch: Partial<Filters>) => {
    setApplied({ ...applied, ...patch });
    setDraft({ ...draft, ...patch });
  };

  return (
    <div className="space-y-4">
      <StatsCards metrics={metrics} />

      <Section title="Danh sách vận đơn">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ngày tạo đơn</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-[150px]"
                value={applied.from}
                onChange={(e) => setInline({ from: e.target.value })}
              />
              <span className="text-sm text-muted-foreground">đến</span>
              <Input
                type="date"
                className="w-[150px]"
                value={applied.to}
                onChange={(e) => setInline({ to: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Văn phòng nhận</Label>
            <SearchableSelect
              value={applied.receiverOffice || "__all__"}
              onValueChange={(v) =>
                setInline({ receiverOffice: v === "__all__" ? "" : v })
              }
              className="w-[200px]"
              placeholder="Chọn văn phòng"
              options={[
                { value: "__all__", label: "Tất cả" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={openFilter}
                >
                  <Filter className="h-4 w-4" />
                  Bộ lọc
                  {activeCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {activeCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
                <SheetHeader className="border-b px-5 py-4">
                  <SheetTitle className="flex items-center gap-2">
                    <Filter className="h-4 w-4" /> Bộ lọc
                  </SheetTitle>
                </SheetHeader>

                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                  <MultiOfficeField
                    label="Văn phòng gửi"
                    values={draft.senderOffices}
                    onChange={(v) => setDraft({ ...draft, senderOffices: v })}
                    options={offices}
                  />

                  <FSelect
                    label="Trạng thái đơn"
                    placeholder="Chọn trạng thái"
                    value={draft.orderStatus}
                    onChange={(v) => setDraft({ ...draft, orderStatus: v })}
                    options={Object.entries(ORDER_STATUS_LABEL).map(
                      ([k, v]) => ({ value: k, label: v }),
                    )}
                  />

                  <FSelect
                    label="Trạng thái thu hộ"
                    placeholder="Chọn trạng thái"
                    value={draft.codStatus}
                    onChange={(v) => setDraft({ ...draft, codStatus: v })}
                    options={[
                      { value: "co", label: "Có thu hộ" },
                      { value: "khong", label: "Không thu hộ" },
                    ]}
                  />

                  <FSelect
                    label="Trạng thái cước"
                    placeholder="Chọn trạng thái cước"
                    value={draft.fareStatus}
                    onChange={(v) => setDraft({ ...draft, fareStatus: v })}
                    options={[
                      { value: "da_thu", label: "Đã thu cước" },
                      { value: "chua_thu", label: "Chưa thu cước" },
                    ]}
                  />

                  <FSelect
                    label="Đơn vị tính"
                    placeholder="Chọn đơn vị tính"
                    value={draft.unit}
                    onChange={(v) => setDraft({ ...draft, unit: v })}
                    options={[
                      { value: "kg", label: "KG" },
                      { value: "kien", label: "Kiện" },
                      { value: "m3", label: "M³" },
                    ]}
                  />

                  <FSelect
                    label="Nhân viên tạo"
                    placeholder="Chọn nhân viên"
                    value={draft.createdBy}
                    onChange={(v) => setDraft({ ...draft, createdBy: v })}
                    options={[
                      { value: "quay.hn", label: "quay.hn" },
                      { value: "quay.hcm", label: "quay.hcm" },
                      { value: "admin", label: "admin" },
                    ]}
                  />

                  <FSelect
                    label="Trạng thái tin nhắn"
                    placeholder="Chọn trạng thái"
                    value={draft.smsStatus}
                    onChange={(v) => setDraft({ ...draft, smsStatus: v })}
                    options={[
                      { value: "sent", label: "Đã gửi" },
                      { value: "not_sent", label: "Chưa gửi" },
                      { value: "failed", label: "Gửi lỗi" },
                    ]}
                  />

                  <FSelect
                    label="Trạng thái in tem/biên nhận"
                    placeholder="Chọn trạng thái in tem/biên nhận"
                    value={draft.printStatus}
                    onChange={(v) => setDraft({ ...draft, printStatus: v })}
                    options={[
                      { value: "printed", label: "Đã in" },
                      { value: "not_printed", label: "Chưa in" },
                    ]}
                  />
                </div>

                <SheetFooter className="flex-row gap-2 border-t px-5 py-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setDraft(EMPTY)}
                  >
                    Xoá lọc
                  </Button>
                  <Button className="flex-1" onClick={apply}>
                    Áp dụng
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1">
                <X className="h-4 w-4" /> Xoá tất cả
              </Button>
            )}
          </div>

          <Button
            className="gap-2"
            disabled={selected.size === 0}
            onClick={() => setAssignOpen(true)}
          >
            <Truck className="h-4 w-4" /> Gán lên xe ({selected.size})
          </Button>

          {canExport && (
            <Button variant="outline" className="gap-2" onClick={doExport}>
              <Download className="h-4 w-4" /> Xuất CSV
            </Button>
          )}
        </div>

        {activeCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chipsFor(applied, offices).map((c) => (
              <Badge key={c.key} variant="secondary" className="gap-1">
                {c.label}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Kết quả (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="w-8 py-2 pr-2">
                    <Checkbox
                      checked={
                        rows.length > 0 && rows.every((r) => selected.has(r.code))
                      }
                      onCheckedChange={(v) => {
                        if (v) setSelected(new Set(rows.map((r) => r.code)));
                        else setSelected(new Set());
                      }}
                    />
                  </th>
                  <th className="py-2 pr-4">Chi tiết</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2 pr-4">Tên món<br/>Ghi chú</th>
                  <th className="py-2 pr-4">Đã thu<br/>HTTT</th>
                  <th className="py-2 pr-4">Chưa thu</th>
                  <th className="py-2 pr-4">Thu hộ<br/>Trạng thái</th>
                  <th className="py-2 pr-4">Người nhận<br/>Số điện thoại</th>
                  <th className="py-2 pr-4">VP nhận<br/>ĐC giao</th>
                  <th className="py-2 pr-4">Người gửi<br/>Số điện thoại</th>
                  <th className="py-2 pr-4">VP gửi<br/>ĐC lấy</th>
                  <th className="py-2 pr-4">Mã GD<br/>Ngày ĐH</th>
                  <th className="py-2 pr-4">Nhân viên</th>
                  <th className="py-2 pr-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const paid = r.paidAmount ?? 0;
                  const remain = Math.max(0, r.fare - paid);
                  const goodsName = orderGoodsLabel(r);
                  const collectLabel =
                    COLLECT_FORMS.find((c) => c.value === r.collectForm)
                      ?.label ?? r.collectForm;
                  return (
                    <tr
                      key={r.code}
                      className="border-b last:border-0 align-top hover:bg-muted/40"
                    >
                      <td className="py-2 pr-2">
                        <Checkbox
                          checked={selected.has(r.code)}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(r.code);
                            else next.delete(r.code);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <div>1 món</div>
                        <div className="text-muted-foreground">{goodsName}</div>
                        {r.weightKg != null && (
                          <div className="text-muted-foreground">
                            {r.weightKg} KG
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <OrderStatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-4">
                        <div className="uppercase">{goodsName}</div>
                        <div className="text-muted-foreground">
                          {displayOrderNote(r.note) || "-"}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div>{formatVND(paid)}</div>
                        <div className="text-muted-foreground">
                          Tại văn phòng
                        </div>
                      </td>
                      <td className="py-2 pr-4">{formatVND(remain)}</td>
                      <td className="py-2 pr-4">
                        <div className="text-muted-foreground">
                          {collectLabel}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium uppercase">
                          {r.receiverName}
                        </div>
                        <div className="text-primary">{r.receiverPhone}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div>{receiverOfficeName(r)}</div>
                        {r.homeDelivery && r.address && (
                          <div className="text-muted-foreground">
                            {r.address}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium uppercase">
                          {r.senderName ?? "-"}
                        </div>
                        <div className="text-primary">{r.senderPhone}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div>{officeName(r.fromOffice)}</div>
                        {r.homePickup && r.address && (
                          <div className="text-muted-foreground">
                            {r.address}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <OrderCodeLink code={r.code} />
                        <div className="text-muted-foreground">
                          {formatDateTime(r.createdAt)}
                        </div>
                        {(() => {
                          const it = describeItinerary(r);
                          if (!it.isMultiLeg) return null;
                          return (
                            <div className="mt-1 flex items-center gap-1 text-[11px]">
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                                Chặng {it.currentIdx + 1}/{it.totalLegs}
                              </span>
                              <span className="text-muted-foreground">
                                {it.legs.map((l, i) => (
                                  <span key={i}>
                                    {i > 0 && " → "}
                                    <span className={l.done ? "line-through opacity-60" : l.current ? "font-semibold text-foreground" : ""}>
                                      {officeName(l.to)}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {r.tripCode ?? "-"}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <RowActions
                          code={r.code}
                          canCancel={
                            r.status !== "CANCELLED" &&
                            r.status !== "DELIVERED" &&
                            r.status !== "RETURNED"
                          }
                          onEdit={() => setEditCode(r.code)}
                          onCancel={() => {
                            if (!confirm(`Huỷ đơn ${r.code}?`)) return;
                            const res = transitionOrder(
                              r.code,
                              "CANCELLED",
                              "CANCEL",
                              "Huỷ từ danh sách vận đơn",
                            );
                            if (res.ok) toast.success(`Đã huỷ đơn ${r.code}`);
                            else toast.error(res.error);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <AssignToVehicleDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        selectedOrders={rows.filter((r) => selected.has(r.code))}
        onDone={() => {
          setAssignOpen(false);
          setSelected(new Set());
        }}
      />

      {(() => {
        const eo = editCode ? orders.find((o) => o.code === editCode) : null;
        if (!eo) return null;
        const pkgs = packageRows(eo);
        const init: TaoDonInitial = {
          code: eo.code,
          senderPhone: eo.senderPhone,
          senderName: eo.senderName ?? "",
          fromOffice: eo.fromOffice,
          homePickup: !!eo.homePickup,
          pickupAddr: eo.homePickup ? eo.address ?? "" : "",
          pickupFee: eo.pickupFee ?? 0,
          receiverPhone: eo.receiverPhone,
          receiverName: eo.receiverName,
          toOffice: orderReceiverOffice(eo),
          homeDeliver: !!eo.homeDelivery,
          deliverAddr: eo.homeDelivery ? eo.address ?? "" : "",
          deliverFee: eo.deliveryFee ?? 0,
          orderNote: displayOrderNote(eo.note),
          codAmount: 0,
          items: pkgs.map((p) => ({
            id: `${eo.code}-${p.seq}`,
            sl: p.itemQty,
            kind: p.kind,
            name: p.goodsName,
            weight: p.weightKg ?? eo.weightKg ?? 0,
            dai: 0,
            rong: 0,
            cao: 0,
            value: 0,
            note: displayOrderNote(eo.note),
            fare: p.fare,
          })),
        };
        return (
          <TaoDonDialog
            open={!!editCode}
            onOpenChange={(v) => !v && setEditCode(null)}
            mode="edit"
            initial={init}
          />
        );
      })()}
    </div>
  );
}

function RowActions({
  code,
  canCancel,
  onEdit,
  onCancel,
}: {
  code: string;
  canCancel: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { openOrderHistory } = useOrderHistory();
  const [printOpen, setPrintOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa đơn
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toast.success(`Đã gửi SMS cho đơn ${code}`)}
          >
            <MessageSquare className="mr-2 h-4 w-4" /> Gửi tin nhắn SMS
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setPrintOpen(true); }}
          >
            <Printer className="mr-2 h-4 w-4" /> In tem đơn hàng
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openOrderHistory(code); }}>
            <History className="mr-2 h-4 w-4" /> Lịch sử đơn hàng
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canCancel}
            onClick={onCancel}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="mr-2 h-4 w-4" /> Huỷ đơn hàng
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PrintLabelDialog code={code} open={printOpen} onOpenChange={setPrintOpen} />
    </>
  );
}


type Metrics = {
  totalOrders: number;
  totalWeight: number;
  totalQuantity: number;
  paid: number;
  remain: number;
};

function StatsCards({ metrics }: { metrics: Metrics }) {
  const items = [
    {
      label: "Đơn hàng",
      value: metrics.totalOrders.toLocaleString("vi-VN"),
      unit: "đơn",
      icon: ClipboardList,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Khối lượng",
      value: metrics.totalWeight.toLocaleString("vi-VN"),
      unit: "KG",
      icon: Weight,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Số lượng",
      value: metrics.totalQuantity.toLocaleString("vi-VN"),
      unit: "kiện",
      icon: Package,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Tiền đã thu",
      value: metrics.paid.toLocaleString("vi-VN"),
      unit: "VNĐ",
      icon: Banknote,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Tiền chưa thu",
      value: metrics.remain.toLocaleString("vi-VN"),
      unit: "VNĐ",
      icon: Wallet,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label} className="border">
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${it.bg} ${it.color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{it.label}</div>
                <div className="truncate text-lg font-semibold">
                  {it.value}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {it.unit}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <SearchableSelect
        value={value || undefined}
        onValueChange={(v) => onChange(v === "__all__" ? "" : v)}
        placeholder={placeholder}
        options={[
          { value: "__all__", label: "Tất cả" },
          ...options,
        ]}
      />
    </div>
  );
}

function MultiOfficeField({
  label,
  values,
  onChange,
  options,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: { code: string; name: string }[];
}) {
  const toggle = (code: string) => {
    onChange(
      values.includes(code)
        ? values.filter((v) => v !== code)
        : [...values, code],
    );
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs hover:bg-accent/40"
          >
            <div className="flex flex-wrap gap-1">
              {values.length === 0 ? (
                <span className="text-muted-foreground">Chọn văn phòng</span>
              ) : (
                values.map((v) => (
                  <span
                    key={v}
                    className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
                  >
                    {options.find((o) => o.code === v)?.name ?? v}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(values.filter((x) => x !== v));
                      }}
                    />
                  </span>
                ))
              )}
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
          <div className="max-h-60 overflow-y-auto">
            {options.map((o) => (
              <label
                key={o.code}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={values.includes(o.code)}
                  onCheckedChange={() => toggle(o.code)}
                />
                {o.name}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function countActive(f: Filters) {
  let n = 0;
  if (f.from || f.to) n++;
  if (f.senderOffices.length) n++;
  if (f.receiverOffice) n++;
  if (f.orderStatus) n++;
  if (f.codStatus) n++;
  if (f.fareStatus) n++;
  if (f.unit) n++;
  if (f.createdBy) n++;
  if (f.smsStatus) n++;
  if (f.printStatus) n++;
  return n;
}

function chipsFor(f: Filters, offices: { code: string; name: string }[]) {
  const out: { key: string; label: string }[] = [];
  if (f.from || f.to)
    out.push({ key: "date", label: `Ngày: ${f.from || "…"} → ${f.to || "…"}` });
  if (f.senderOffices.length)
    out.push({
      key: "sender",
      label:
        "VP gửi: " +
        f.senderOffices
          .map((c) => offices.find((o) => o.code === c)?.name ?? c)
          .join(", "),
    });
  if (f.receiverOffice)
    out.push({
      key: "receiver",
      label:
        "VP nhận: " +
        (offices.find((o) => o.code === f.receiverOffice)?.name ??
          f.receiverOffice),
    });
  if (f.orderStatus)
    out.push({
      key: "status",
      label:
        "Trạng thái: " +
        (ORDER_STATUS_LABEL[f.orderStatus as keyof typeof ORDER_STATUS_LABEL] ??
          f.orderStatus),
    });
  if (f.codStatus)
    out.push({
      key: "cod",
      label: "Thu hộ: " + (f.codStatus === "co" ? "Có" : "Không"),
    });
  if (f.fareStatus)
    out.push({
      key: "fare",
      label:
        "Cước: " + (f.fareStatus === "da_thu" ? "Đã thu" : "Chưa thu"),
    });
  if (f.unit) out.push({ key: "unit", label: "ĐVT: " + f.unit });
  if (f.createdBy) out.push({ key: "cb", label: "NV: " + f.createdBy });
  if (f.smsStatus) out.push({ key: "sms", label: "Tin nhắn: " + f.smsStatus });
  if (f.printStatus)
    out.push({ key: "print", label: "In tem: " + f.printStatus });
  return out;
}

type OrderRow = ReturnType<typeof useStore.getState>["orders"][number];

/** Resolve master Route.code for Trip.create from live catalog (name/code). */
async function resolveAssignRouteCode(
  pick: NonNullable<AssignVehiclePick>,
  orders: OrderRow[],
): Promise<string> {
  const { resolveTripRouteCode } = await import("@/lib/api/trip-route");
  return resolveTripRouteCode({
    branchName: pick.branchName,
    routeHint: pick.tab === "vthh" ? pick.route : undefined,
    orders,
  });
}

async function officeCodeForTrip() {
  const { resolveOfficeCodeStrict } = await import("@/lib/api/sync");
  const office = useStore.getState().session?.office;
  return (
    (office && office !== "ALL" ? resolveOfficeCodeStrict(office) : null) ||
    useStore.getState().offices[0]?.code ||
    ""
  );
}

function AssignToVehicleDialog({
  open,
  onOpenChange,
  selectedOrders,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedOrders: OrderRow[];
  onDone: () => void;
}) {
  const [pick, setPick] = useState<AssignVehiclePick>(null);
  const addTrip = useStore((s) => s.addTrip);

  const confirm = async () => {
    if (!pick) {
      toast.error("Vui lòng chọn xe");
      return;
    }
    const { isApiEnabled } = await import("@/lib/api/client");
    if (!isApiEnabled()) {
      toast.error("API chưa cấu hình");
      return;
    }
    try {
      const domain = await import("@/lib/api/domain-api");
      const { syncOrdersFromApi, syncTripsFromApi } = await import("@/lib/api/sync");
      const officeCode = await officeCodeForTrip();
      if (!officeCode) {
        toast.error("Chưa có văn phòng trên hệ thống");
        return;
      }
      const plate =
        pick.tab === "vthk" ? realVehiclePlate(pick.trip.vehiclePlate) : pick.plate;
      const driverName =
        pick.tab === "vthk" ? realDriverName(pick.trip.driverName) : pick.driver;
      let routeCode: string;
      try {
        routeCode = await resolveAssignRouteCode(pick, selectedOrders);
      } catch (e: any) {
        toast.error(e?.message || "Không xác định được tuyến cho xe đã chọn");
        return;
      }
      const itineraryLabel = tripItineraryLabel(pick);
      if (!routeCode) {
        toast.error("Không xác định được tuyến cho xe đã chọn");
        return;
      }
      if (pick.tab === "vthh" && !plate?.trim()) {
        toast.error("Xe đã chọn chưa có biển số");
        return;
      }
      const listed = plate
        ? await domain.listTrips({ keyword: plate, size: 50 }).catch(() => [])
        : [];
      const existing = plate
        ? findOpenTripByPlate(listed, plate) ?? findOpenTripByPlate(useStore.getState().trips, plate)
        : undefined;
      const trip =
        existing ??
        (await domain.createTrip({
          officeCode,
          routeCode,
          ...(itineraryLabel ? { itineraryLabel } : {}),
          ...(plate ? { vehiclePlate: plate } : {}),
          vehicleId: pick.tab === "vthh" ? pick.vehicleId : undefined,
          ...(driverName ? { driverName } : {}),
          departAt: pick.tab === "vthk" ? pick.trip.departAt : pick.departAt,
        }));
      addTrip({
        ...trip,
        bks: realVehiclePlate(trip.bks) || plate,
        driver: realDriverName(trip.driver) || driverName,
        route: itineraryLabel || trip.route,
      });
      await domain.assignOrdersToTrip(
        trip.code,
        selectedOrders.map((o) => o.code),
        itineraryLabel,
      );
      const codes = new Set(selectedOrders.map((o) => o.code));
      useStore.setState((st) => ({
        orders: st.orders.map((o) =>
          codes.has(o.code)
            ? { ...o, tripCode: trip.code, status: "IN_TRANSIT" as const, updatedAt: new Date().toISOString() }
            : o,
        ),
      }));
      await Promise.all([syncOrdersFromApi(), syncTripsFromApi()]);
      toast.success(`Đã gán ${selectedOrders.length} đơn lên xe ${plate}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Không gán được chuyến trên máy chủ");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-4 overflow-hidden p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>Gán hàng lên xe</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
          <AssignVehiclePicker open={open} onPick={setPick} />

          {/* Orders table */}
          <div className="min-w-0">
            <Label className="mb-2 block text-sm font-medium">
              Đơn hàng đã chọn ({selectedOrders.length})
            </Label>
            <div className="max-h-[200px] overflow-auto rounded-md border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Mã vận đơn</th>
                    <th className="px-3 py-2">Tên món</th>
                    <th className="px-3 py-2">KL</th>
                    <th className="px-3 py-2">Người gửi</th>
                    <th className="px-3 py-2">Người nhận</th>
                    <th className="px-3 py-2">VP đi → đến</th>
                    <th className="px-3 py-2 text-right">Cước</th>
                    <th className="px-3 py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        Chưa chọn đơn nào
                      </td>
                    </tr>
                  ) : (
                    selectedOrders.map((r) => {
                      const goodsLabel = orderGoodsLabel(r);
                      return (
                        <tr
                          key={r.code}
                          className="border-t align-top hover:bg-muted/30"
                        >
                          <td className="px-3 py-2">
                            <OrderCodeLink code={r.code} />
                          </td>
                          <td className="px-3 py-2">{goodsLabel}</td>
                          <td className="px-3 py-2">
                            {r.weightKg != null ? `${r.weightKg} KG` : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <div>{r.senderName ?? "-"}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.senderPhone}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div>{r.receiverName}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.receiverPhone}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {orderRouteLabel(r)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatVND(r.fare)}
                          </td>
                          <td className="px-3 py-2">
                            <OrderStatusBadge status={r.status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={confirm} disabled={!pick || selectedOrders.length === 0}>
            Xác nhận gán lên xe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
