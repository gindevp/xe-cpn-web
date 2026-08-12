import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatVND, officeName, type Order } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Users2, ClipboardList, Banknote, Receipt, Search } from "lucide-react";
import { isApiEnabled } from "@/lib/api/client";
import { listReceiptCandidates } from "@/lib/api/finance-config-api";
import { resolveOfficeCode } from "@/lib/api/sync";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/phieu-thu")({
  head: () => ({
    meta: [
      { title: "Phiếu thu — X.E" },
      {
        name: "description",
        content:
          "Danh sách tiền cần thu của từng điều phối viên và tạo phiếu thu theo đơn hàng.",
      },
      { property: "og:title", content: "Phiếu thu — X.E" },
      {
        property: "og:description",
        content: "Tổng hợp công nợ cần thu theo điều phối viên và tạo phiếu thu nhanh.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Phiếu thu" screen="phieu-thu">
      <Page />
    </ProtectedPage>
  ),
});

function dueOf(o: Order) {
  const total = o.fare + (o.pickupFee ?? 0) + (o.deliveryFee ?? 0);
  return Math.max(0, total - (o.paidAmount ?? 0));
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const [q, setQ] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [openStaff, setOpenStaff] = useState<string | null>(null);
  const [candDue, setCandDue] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) {
      setCandDue(null);
      return;
    }
    let cancelled = false;
    const office =
      session?.office && session.office !== "ALL" ? resolveOfficeCode(session.office) : undefined;
    listReceiptCandidates(office)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const r of rows ?? []) {
          if (r?.orderCode && Number(r.dueAmount) > 0) m.set(r.orderCode, Number(r.dueAmount));
        }
        setCandDue(m);
      })
      .catch(() => {
        if (!cancelled) setCandDue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.office, orders.length]);

  const staffList = useMemo(() => {
    const list = users
      .filter((u) => u.active !== false && ["DH", "Q", "TCN"].includes(u.role))
      .map((u) => u.username);
    return list.length ? list : ["dh"];
  }, [users]);

  const rowsByStaff = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const s of staffList) map.set(s, []);
    for (const o of orders) {
      if (o.status === "CANCELLED") continue;
      const due = candDue ? (candDue.get(o.code) ?? 0) : dueOf(o);
      if (due <= 0) continue;
      const staff =
        o.pickupStaff && staffList.includes(o.pickupStaff)
          ? o.pickupStaff
          : staffList[hash(o.code) % staffList.length];
      // Prefer BE due when candidates loaded (TASK-006) without changing table layout
      map.get(staff)!.push(candDue ? { ...o, paidAmount: Math.max(0, o.fare - due) } : o);
    }
    return map;
  }, [orders, staffList, candDue]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return staffList
      .filter((s) => (staffFilter ? s === staffFilter : true))
      .filter((s) => (kw ? s.toLowerCase().includes(kw) : true))
      .map((s) => {
        const list = rowsByStaff.get(s) ?? [];
        return {
          staff: s,
          count: list.length,
          amount: list.reduce((a, o) => a + dueOf(o), 0),
        };
      });
  }, [staffList, staffFilter, q, rowsByStaff]);

  const totals = useMemo(
    () => ({
      staff: rows.length,
      orders: rows.reduce((a, r) => a + r.count, 0),
      amount: rows.reduce((a, r) => a + r.amount, 0),
    }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi icon={Users2} label="Điều phối viên" value={String(totals.staff)} />
        <Kpi icon={ClipboardList} label="Đơn cần thu" value={String(totals.orders)} />
        <Kpi icon={Banknote} label="Tiền cần thu" value={formatVND(totals.amount)} />
      </div>

      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Điều phối viên</Label>
            <Select
              value={staffFilter || "all"}
              onValueChange={(v) => setStaffFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Tìm kiếm</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tên cán bộ điều phối"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Tiền cần thu theo điều phối viên (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Không có dữ liệu</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Cán bộ điều phối</th>
                  <th className="px-2 py-2 text-right">Số đơn cần thu</th>
                  <th className="px-2 py-2 text-right">Tiền cần thu</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staff} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 font-medium">{r.staff}</td>
                    <td className="px-2 py-2 text-right">{r.count}</td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {formatVND(r.amount)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={r.count === 0}
                        onClick={() => setOpenStaff(r.staff)}
                      >
                        <Receipt className="h-4 w-4" />
                        Tạo phiếu thu
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <ReceiptDialog
        staff={openStaff}
        orders={openStaff ? (rowsByStaff.get(openStaff) ?? []) : []}
        onClose={() => setOpenStaff(null)}
      />
    </div>
  );
}

function ReceiptDialog({
  staff,
  orders,
  onClose,
}: {
  staff: string | null;
  orders: Order[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const total = orders
    .filter((o) => selected.has(o.code))
    .reduce((a, o) => a + dueOf(o), 0);

  const allChecked = orders.length > 0 && orders.every((o) => selected.has(o.code));

  const submit = () => {
    const codes = [...selected];
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    const rec = st.addReceipt({
      payer: staff ?? "",
      payerCode: (st.users.find((u) => u.username === staff)?.username ?? staff ?? "").toUpperCase(),
      total,
      orderCodes: codes,
    });
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      const due = dueOf(o);
      st.updateOrder(code, {
        paidAmount: (o.paidAmount ?? 0) + due,
        events: [
          ...(o.events ?? []),
          { at, by, action: "RECEIPT_CREATED", detail: `Phiếu thu ${rec.code} · ${formatVND(due)} · ĐPV ${staff}` },
        ],
      });
      st.audit({
        action: "RECEIPT_CREATED",
        entityType: "order",
        entityId: code,
        detail: `Phiếu thu ${rec.code} · ĐPV ${staff}`,
      });
    }
    toast.success(`Đã tạo phiếu thu ${rec.code} · ${codes.length} đơn · ${formatVND(total)}`);
    setSelected(new Set());
    onClose();
  };

  return (
    <Dialog
      open={Boolean(staff)}
      onOpenChange={(v) => {
        if (!v) {
          setSelected(new Set());
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tạo phiếu thu · {staff}</DialogTitle>
          <DialogDescription>
            Chọn các đơn hàng cần thu tiền để lập phiếu thu.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="w-10 px-2 py-2">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(orders.map((o) => o.code)) : new Set())
                    }
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className="px-2 py-2">Mã đơn hàng</th>
                <th className="px-2 py-2">VP gửi → VP nhận</th>
                <th className="px-2 py-2 text-right">Tiền cần thu</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.code} className="border-b hover:bg-muted/40">
                  <td className="px-2 py-2">
                    <Checkbox
                      checked={selected.has(o.code)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(o.code);
                          else next.delete(o.code);
                          return next;
                        })
                      }
                      aria-label={`Chọn ${o.code}`}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium">{o.code}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    {officeName(o.fromOffice)} → {officeName(o.toOffice)}
                  </td>
                  <td className="px-2 py-2 text-right">{formatVND(dueOf(o))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="text-sm">
            Tổng tiền thu ({selected.size} đơn):{" "}
            <span className="text-base font-semibold">{formatVND(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Quay lại
            </Button>
            <Button size="sm" disabled={selected.size === 0} onClick={submit}>
              Tạo phiếu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users2;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-base font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
