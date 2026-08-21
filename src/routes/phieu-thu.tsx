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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatVND, officeName, type Order } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Users2, ClipboardList, Banknote, Receipt, Search } from "lucide-react";
import { isApiEnabled } from "@/lib/api/client";
import { listReceiptCandidates } from "@/lib/api/finance-config-api";
import { assignedOfficeCode, resolveViewOffice } from "@/lib/office-scope";
import {
  debtOwnerForOrder,
  debtOwnerLabel,
  orderDueAmount,
  UNKNOWN_DEBT_OWNER,
} from "@/lib/finance-debt";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/phieu-thu")({
  head: () => ({
    meta: [
      { title: "Phiếu thu — X.E" },
      {
        name: "description",
        content: "Tổng hợp công nợ cần thu theo nhân viên phụ trách và tạo phiếu thu theo đơn hàng.",
      },
      { property: "og:title", content: "Phiếu thu — X.E" },
      {
        property: "og:description",
        content: "Tổng hợp công nợ cần thu theo nhân viên phụ trách và tạo phiếu thu nhanh.",
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

type CandidateMeta = { dueAmount: number; debtOwnerUsername?: string; fromOfficeCode?: string };

type DueOrder = Order & { dueAmount: number; debtOwner: string };

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const offices = useStore((s) => s.offices);
  const viewOffice = resolveViewOffice(session, viewOfficeRaw);
  const [q, setQ] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [openStaff, setOpenStaff] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Map<string, CandidateMeta> | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) {
      setCandidates(null);
      return;
    }
    let cancelled = false;
    const office = assignedOfficeCode(viewOffice);
    listReceiptCandidates(office || undefined)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, CandidateMeta>();
        for (const r of rows ?? []) {
          if (!r?.orderCode || Number(r.dueAmount) <= 0) continue;
          m.set(r.orderCode, {
            dueAmount: Number(r.dueAmount),
            debtOwnerUsername: r.debtOwnerUsername ?? undefined,
            fromOfficeCode: r.fromOfficeCode ?? undefined,
          });
        }
        setCandidates(m);
      })
      .catch(() => {
        if (!cancelled) setCandidates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewOffice, orders.length]);

  const dueOrders = useMemo((): DueOrder[] => {
    const out: DueOrder[] = [];
    for (const o of orders) {
      if (o.status === "CANCELLED" || o.status === "DRAFT") continue;
      const meta = candidates?.get(o.code);
      const due = orderDueAmount(o, meta?.dueAmount);
      if (due <= 0) continue;
      if (viewOffice && o.fromOffice !== viewOffice) continue;
      if (candidates && !meta) continue;
      const debtOwner = debtOwnerForOrder(o, meta?.debtOwnerUsername);
      out.push({ ...o, dueAmount: due, debtOwner });
    }
    return out;
  }, [orders, candidates, viewOffice]);

  const rowsByOwner = useMemo(() => {
    const map = new Map<string, DueOrder[]>();
    for (const o of dueOrders) {
      const key = o.debtOwner;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [dueOrders]);

  const ownerKeys = useMemo(
    () =>
      [...rowsByOwner.keys()].sort((a, b) =>
        debtOwnerLabel(a).localeCompare(debtOwnerLabel(b), "vi"),
      ),
    [rowsByOwner],
  );

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return ownerKeys
      .filter((k) => (staffFilter ? k === staffFilter : true))
      .filter((k) => (kw ? debtOwnerLabel(k).toLowerCase().includes(kw) : true))
      .map((owner) => {
        const list = rowsByOwner.get(owner) ?? [];
        return {
          owner,
          label: debtOwnerLabel(owner),
          count: list.length,
          amount: list.reduce((a, o) => a + o.dueAmount, 0),
        };
      });
  }, [ownerKeys, staffFilter, q, rowsByOwner]);

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
      <p className="text-xs text-muted-foreground">
        Công nợ gán cho: người thu lần cuối → shipper lấy hàng → người lập đơn. Lọc theo VP gửi
        {viewOffice ? ` (${officeName(viewOffice)})` : " (toàn hệ thống)"}.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi icon={Users2} label="Nhân viên phụ trách" value={String(totals.staff)} />
        <Kpi icon={ClipboardList} label="Đơn cần thu" value={String(totals.orders)} />
        <Kpi icon={Banknote} label="Tiền cần thu" value={formatVND(totals.amount)} />
      </div>

      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nhân viên phụ trách</Label>
            <SearchableSelect
              value={staffFilter || "all"}
              onValueChange={(v) => setStaffFilter(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                ...ownerKeys.map((k) => ({ value: k, label: debtOwnerLabel(k) })),
              ]}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Tìm kiếm</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tên nhân viên phụ trách thu"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Tiền cần thu theo nhân viên (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Không có đơn cần thu</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Nhân viên phụ trách</th>
                  <th className="px-2 py-2 text-right">Số đơn cần thu</th>
                  <th className="px-2 py-2 text-right">Tiền cần thu</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.owner} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 font-medium">{r.label}</td>
                    <td className="px-2 py-2 text-right">{r.count}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatVND(r.amount)}</td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={r.count === 0}
                        onClick={() => setOpenStaff(r.owner)}
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
        owner={openStaff}
        ownerLabel={openStaff ? debtOwnerLabel(openStaff) : ""}
        orders={openStaff ? (rowsByOwner.get(openStaff) ?? []) : []}
        onClose={() => setOpenStaff(null)}
      />
    </div>
  );
}

function ReceiptDialog({
  owner,
  ownerLabel,
  orders,
  onClose,
}: {
  owner: string | null;
  ownerLabel: string;
  orders: DueOrder[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const total = orders.filter((o) => selected.has(o.code)).reduce((a, o) => a + o.dueAmount, 0);
  const allChecked = orders.length > 0 && orders.every((o) => selected.has(o.code));

  const submit = () => {
    const codes = [...selected];
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    const payerName = ownerLabel;
    const rec = st.addReceipt({
      payer: payerName,
      payerCode: owner && owner !== UNKNOWN_DEBT_OWNER ? owner.toUpperCase() : undefined,
      total,
      orderCodes: codes,
    });
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      const dueOrder = orders.find((x) => x.code === code);
      if (!o || !dueOrder) continue;
      const due = dueOrder.dueAmount;
      st.updateOrder(code, {
        paidAmount: (o.paidAmount ?? 0) + due,
        events: [
          ...(o.events ?? []),
          {
            at,
            by,
            action: "RECEIPT_CREATED",
            detail: `Phiếu thu ${rec.code} · ${formatVND(due)} · NV ${ownerLabel}`,
          },
        ],
      });
      st.audit({
        action: "RECEIPT_CREATED",
        entityType: "order",
        entityId: code,
        detail: `Phiếu thu ${rec.code} · NV ${ownerLabel}`,
      });
    }
    toast.success(`Đã tạo phiếu thu ${rec.code} · ${codes.length} đơn · ${formatVND(total)}`);
    setSelected(new Set());
    onClose();
  };

  return (
    <Dialog
      open={Boolean(owner)}
      onOpenChange={(v) => {
        if (!v) {
          setSelected(new Set());
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tạo phiếu thu · {ownerLabel}</DialogTitle>
          <DialogDescription>Chọn các đơn hàng cần thu tiền để lập phiếu thu.</DialogDescription>
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
                  <td className="px-2 py-2 text-right">{formatVND(o.dueAmount)}</td>
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
