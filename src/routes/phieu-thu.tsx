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
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { formatVND, officeName, canonicalOfficeCode, type Order } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { toast } from "sonner";
import { Users2, ClipboardList, Banknote, Receipt, Search } from "lucide-react";
import { isApiEnabled } from "@/lib/api/client";
import { listReceiptCandidates, type ReceiptPortion } from "@/lib/api/finance-config-api";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice, VIEW_ALL_OFFICES } from "@/lib/office-scope";
import {
  deliveryActorForOrder,
  debtOwnerLabel,
  moneyReceivedAt,
  receiptCollectableAmount,
  receiptFarePortion,
  UNKNOWN_DEBT_OWNER,
} from "@/lib/finance-debt";
import { useAuth } from "@/lib/auth";
import { syncFinanceFromApi } from "@/lib/api/sync";

export const Route = createFileRoute("/phieu-thu")({
  head: () => ({
    meta: [
      { title: "Phiếu thu — X.E" },
      {
        name: "description",
        content:
          "Tổng hợp đơn cần thu: gửi trả (kể cả đã thu đầu gửi TRUOC chưa nộp quỹ); nhận trả/COD sau giao thành công.",
      },
      { property: "og:title", content: "Phiếu thu — X.E" },
      {
        property: "og:description",
        content: "Phiếu thu: gửi trả tại VP gửi; nhận trả/COD theo người giao khách.",
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

type CandidateMeta = {
  orderCode: string;
  dueAmount: number;
  fareAmount?: number;
  paidAmount?: number;
  debtOwnerUsername?: string;
  fromOfficeCode?: string;
  status?: string;
  portion?: ReceiptPortion;
  collectedAt?: string;
};

type DueOrder = Order & {
  dueAmount: number;
  debtOwner: string;
  fareAmount?: number;
  /** undefined = gộp cả 2 phần (cùng người) — BE tự phân bổ */
  portion?: ReceiptPortion;
  /** Thời điểm nhận tiền khách (không phải ngày tạo đơn). */
  moneyAt?: string;
};

const PORTION_LABEL: Record<ReceiptPortion, string> = {
  SENDER: "Thu phía gửi",
  DELIVERY: "Thu khi giao",
};

/** Ngày lịch VN (YYYY-MM-DD) từ ISO; rỗng nếu không parse được. */
function localDayVn(iso?: string): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function fmtDayVn(day: string): string {
  if (!day || day.length < 10) return day || "—";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** Lọc đúng 1 ngày tạo đơn (local VN). filterDay rỗng = không lọc. */
function orderOnDay(createdAt: string | undefined, filterDay: string): boolean {
  if (!filterDay) return true;
  const day = localDayVn(createdAt);
  return Boolean(day) && day === filterDay;
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const viewOffice = resolveViewOffice(session, viewOfficeRaw);
  /** AD / KT / tài khoản ALL: thấy nhiều người; còn lại chỉ chính mình. */
  const seeAllOwners = hasAllOfficeScope(session);
  const officeScope = assignedOfficeCode(viewOffice);
  const selfOwner = (session?.username ?? "").trim();
  const [q, setQ] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Map<string, CandidateMeta> | null>(null);

  /** Username NV thuộc VP đang xem (so mã đã canonical). */
  const ownersInScopedOffice = useMemo(() => {
    if (!officeScope) return null;
    const scope = (canonicalOfficeCode(officeScope) || officeScope).toUpperCase();
    const set = new Set<string>();
    for (const u of users) {
      if (!u.active) continue;
      const uOffice = (u.office ?? "").trim();
      if (!uOffice || uOffice === VIEW_ALL_OFFICES) continue;
      const code = (canonicalOfficeCode(uOffice) || uOffice).toUpperCase();
      if (code === scope || uOffice.toUpperCase() === officeScope.toUpperCase()) {
        set.add(u.username.trim().toLowerCase());
      }
    }
    return set;
  }, [users, officeScope]);

  const reloadCandidates = () => {
    if (!isApiEnabled()) {
      setCandidates(null);
      return;
    }
    const office = assignedOfficeCode(viewOffice);
    listReceiptCandidates(office || undefined)
      .then((rows) => {
        const m = new Map<string, CandidateMeta>();
        for (const r of rows ?? []) {
          if (!r?.orderCode) continue;
          m.set(`${r.orderCode}|${r.portion ?? ""}`, {
            orderCode: r.orderCode,
            portion: r.portion ?? undefined,
            dueAmount: Number(r.dueAmount) || 0,
            fareAmount: r.fareAmount != null ? Number(r.fareAmount) : undefined,
            paidAmount: r.paidAmount != null ? Number(r.paidAmount) : undefined,
            debtOwnerUsername: r.debtOwnerUsername ?? undefined,
            fromOfficeCode: r.fromOfficeCode ?? undefined,
            status: r.status,
            collectedAt:
              typeof r.collectedAt === "string"
                ? r.collectedAt
                : r.collectedAt
                  ? new Date(r.collectedAt as string | number | Date).toISOString()
                  : undefined,
          });
        }
        setCandidates(m);
      })
      .catch(() => setCandidates(null));
  };

  useEffect(() => {
    reloadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOffice, orders.length]);

  useEffect(() => {
    if (!seeAllOwners || !officeScope || users.length > 0 || !isApiEnabled()) return;
    void import("@/lib/api/sync")
      .then((m) => m.syncStaffFromApi())
      .catch(() => undefined);
  }, [seeAllOwners, officeScope, users.length]);

  const dueOrders = useMemo((): DueOrder[] => {
    const allowOwner = (owner: string) => {
      const key = owner.trim().toLowerCase();
      if (!key) return false;
      // NV thường: chỉ chính mình.
      if (!seeAllOwners) {
        return Boolean(selfOwner) && key === selfOwner.toLowerCase();
      }
      // AD/KT + Toàn hệ thống: mọi người.
      if (!officeScope || !ownersInScopedOffice) return true;
      // AD/KT + chọn 1 VP: chỉ NV thuộc VP đó (vẫn gồm thu phía gửi + thu khi giao của họ).
      if (ownersInScopedOffice.size === 0) return true; // chưa load master user → đừng ẩn hết
      return ownersInScopedOffice.has(key);
    };

    // API bật: nguồn chính = candidates, mỗi đơn tối đa 2 phần (phía gửi / khi giao).
    if (candidates) {
      const out: DueOrder[] = [];
      for (const meta of candidates.values()) {
        const code = meta.orderCode;
        const o = orders.find((x) => x.code === code);
        const debtOwner = deliveryActorForOrder(
          (o as OrderX | undefined) ?? ({ code, events: [], payments: [] } as unknown as OrderX),
          meta.debtOwnerUsername,
        );
        if (!allowOwner(debtOwner)) continue;
        const moneyAt =
          meta.collectedAt ||
          moneyReceivedAt(
            (o as OrderX | undefined) ??
              ({ code, events: [], payments: [], createdAt: "" } as unknown as OrderX),
            meta.portion,
          ) ||
          o?.createdAt ||
          "";
        out.push({
          ...(o ??
            ({
              code,
              status: "DELIVERED",
              fromOffice: meta.fromOfficeCode ?? "",
              toOffice: "",
              fare: meta.fareAmount ?? 0,
              paidAmount: meta.paidAmount ?? 0,
              receiverName: "",
              receiverPhone: "",
              senderPhone: "",
              createdAt: "",
              updatedAt: "",
            } as Order)),
          code,
          createdAt: o?.createdAt ?? "",
          moneyAt,
          dueAmount: receiptCollectableAmount(
            {
              fare: meta.fareAmount ?? o?.fare ?? 0,
              paidAmount: meta.paidAmount ?? o?.paidAmount ?? 0,
              codAmount: o?.codAmount ?? 0,
            },
            meta.dueAmount,
          ),
          debtOwner,
          fareAmount: meta.fareAmount ?? o?.fare,
          portion: meta.portion,
        });
      }
      // Cùng người chịu cả 2 phần → 1 dòng (phiếu thu không cho trùng đơn).
      const merged = new Map<string, DueOrder>();
      for (const row of out) {
        const key = `${row.code}|${row.debtOwner}`;
        const prev = merged.get(key);
        if (!prev) {
          merged.set(key, row);
          continue;
        }
        // Giữ thời điểm nhận tiền sớm hơn khi gộp 2 phần
        const moneyAt =
          prev.moneyAt && row.moneyAt
            ? prev.moneyAt <= row.moneyAt
              ? prev.moneyAt
              : row.moneyAt
            : prev.moneyAt || row.moneyAt;
        merged.set(key, {
          ...prev,
          dueAmount: prev.dueAmount + row.dueAmount,
          portion: undefined,
          moneyAt,
        });
      }
      return [...merged.values()].filter((row) => orderOnDay(row.moneyAt || row.createdAt, filterDay));
    }

    // Offline / mock: DELIVERED, hoặc GUI_TRA đã nhập kho gửi
    const out: DueOrder[] = [];
    for (const o of orders) {
      const guiTraEarly =
        o.collectForm === "GUI_TRA" &&
        o.status !== "DRAFT" &&
        o.status !== "CANCELLED" &&
        o.status !== "RETURNING" &&
        o.status !== "RETURNED" &&
        o.status !== "FAILED_DELIVERY" &&
        ["IN_TRANSIT", "WAITING", "AT_DEST", "OUT_FOR_DELIVERY", "DELIVERED", "CONFIRMED"].includes(
          o.status,
        );
      if (o.status !== "DELIVERED" && !guiTraEarly) continue;
      if (viewOffice && o.fromOffice !== viewOffice && o.toOffice !== viewOffice) continue;
      if (guiTraEarly && o.status !== "DELIVERED" && viewOffice && o.fromOffice !== viewOffice)
        continue;
      const debtOwner = deliveryActorForOrder(o as OrderX);
      if (!allowOwner(debtOwner)) continue;
      const moneyAt = moneyReceivedAt(o as OrderX) || o.createdAt;
      if (!orderOnDay(moneyAt, filterDay)) continue;
      out.push({ ...o, dueAmount: receiptCollectableAmount(o), debtOwner, moneyAt });
    }
    return out;
  }, [orders, candidates, viewOffice, seeAllOwners, selfOwner, officeScope, ownersInScopedOffice, filterDay]);

  /** Gom theo người + ngày nhận tiền khách. */
  const rowsByOwnerDay = useMemo(() => {
    const map = new Map<string, DueOrder[]>();
    for (const o of dueOrders) {
      const day = localDayVn(o.moneyAt || o.createdAt) || "unknown";
      const key = `${o.debtOwner}@@${day}`;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [dueOrders]);

  const groupKeys = useMemo(
    () =>
      [...rowsByOwnerDay.keys()].sort((a, b) => {
        const [ownerA, dayA] = a.split("@@");
        const [ownerB, dayB] = b.split("@@");
        const dayCmp = (dayB || "").localeCompare(dayA || "");
        if (dayCmp !== 0) return dayCmp;
        return debtOwnerLabel(ownerA).localeCompare(debtOwnerLabel(ownerB), "vi");
      }),
    [rowsByOwnerDay],
  );

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return groupKeys
      .filter((k) => {
        const owner = k.split("@@")[0] ?? "";
        if (staffFilter && owner !== staffFilter) return false;
        if (kw && !debtOwnerLabel(owner).toLowerCase().includes(kw)) return false;
        return true;
      })
      .map((key) => {
        const [owner, day] = key.split("@@");
        const list = rowsByOwnerDay.get(key) ?? [];
        return {
          key,
          owner,
          day: day === "unknown" ? "" : day,
          label: debtOwnerLabel(owner),
          count: list.length,
          amount: list.reduce((a, o) => a + o.dueAmount, 0),
        };
      });
  }, [groupKeys, staffFilter, q, rowsByOwnerDay]);

  const ownerKeys = useMemo(
    () =>
      [...new Set(dueOrders.map((o) => o.debtOwner))].sort((a, b) =>
        debtOwnerLabel(a).localeCompare(debtOwnerLabel(b), "vi"),
      ),
    [dueOrders],
  );
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
        Tiền đơn chưa nộp, gom theo <b>người chịu trách nhiệm</b> (thu phía gửi + thu khi giao).{" "}
        {!seeAllOwners
          ? `Bạn chỉ thấy đơn cần nộp của chính mình (${selfOwner || "—"}).`
          : officeScope
            ? `AD/KT đang xem VP ${officeName(officeScope) || officeScope} — chỉ hiện NV thuộc VP này.`
            : "AD/KT đang xem toàn hệ thống — hiện mọi người tác động."}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi icon={Users2} label="Người tác động" value={String(totals.staff)} />
        <Kpi icon={ClipboardList} label="Đơn cần nộp" value={String(totals.orders)} />
        <Kpi icon={Banknote} label="Tiền còn thu" value={formatVND(totals.amount)} />
      </div>

      <Section>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Ngày nhận tiền</Label>
            <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Người tác động</Label>
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
                placeholder="Tên / tài khoản người tác động"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={`Đơn cần nộp theo người · ngày (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Không có đơn cần lập phiếu thu</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Người tác động</th>
                  <th className="px-2 py-2 text-right">Số đơn</th>
                  <th className="px-2 py-2 text-right">Tiền còn thu</th>
                  <th className="px-2 py-2 text-right">Ngày</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 font-medium">{r.label}</td>
                    <td className="px-2 py-2 text-right">{r.count}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatVND(r.amount)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {r.day ? fmtDayVn(r.day) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={r.count === 0}
                        onClick={() => setOpenKey(r.key)}
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
        owner={openKey ? openKey.split("@@")[0] : null}
        ownerLabel={openKey ? debtOwnerLabel(openKey.split("@@")[0] ?? "") : ""}
        dayLabel={
          openKey
            ? (() => {
                const d = openKey.split("@@")[1];
                return d && d !== "unknown" ? fmtDayVn(d) : "";
              })()
            : ""
        }
        orders={openKey ? (rowsByOwnerDay.get(openKey) ?? []) : []}
        onClose={() => setOpenKey(null)}
        onCreated={() => {
          reloadCandidates();
          void syncFinanceFromApi().catch(() => undefined);
        }}
      />
    </div>
  );
}

function ReceiptDialog({
  owner,
  ownerLabel,
  dayLabel,
  orders,
  onClose,
  onCreated,
}: {
  owner: string | null;
  ownerLabel: string;
  dayLabel: string;
  orders: DueOrder[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [owner]);

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
      office: assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice)) || undefined,
      lineAmounts: Object.fromEntries(
        codes.map((c) => [c, orders.find((o) => o.code === c)?.dueAmount ?? 0]),
      ),
      linePortions: Object.fromEntries(
        codes.map((c) => [c, orders.find((o) => o.code === c)?.portion]),
      ),
    });
    // API bật: paidAmount đồng bộ lại từ BE (phần tiền đã thu không cộng thêm).
    const bumpPaidLocally = !isApiEnabled();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      const dueOrder = orders.find((x) => x.code === code);
      if (!o || !dueOrder) continue;
      const due = dueOrder.dueAmount;
      if (due > 0) {
        const toPaid = bumpPaidLocally ? receiptFarePortion(o, due) : 0;
        st.updateOrder(code, {
          paidAmount: (o.paidAmount ?? 0) + toPaid,
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
      } else {
        st.updateOrder(code, {
          events: [
            ...(o.events ?? []),
            {
              at,
              by,
              action: "RECEIPT_CREATED",
              detail: `Phiếu thu ${rec.code} · trách nhiệm · NV ${ownerLabel}`,
            },
          ],
        });
      }
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
    onCreated();
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
          <DialogTitle>
            Tạo phiếu thu · {ownerLabel}
            {dayLabel ? ` · ${dayLabel}` : ""}
          </DialogTitle>
          <DialogDescription>
            Chọn đơn người này đang giữ tiền hoặc chịu trách nhiệm thu (phía gửi / khi giao)
            {dayLabel ? ` · ngày nhận tiền ${dayLabel}` : ""}.
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
                <th className="px-2 py-2">Ngày</th>
                <th className="px-2 py-2">Mã đơn hàng</th>
                <th className="px-2 py-2">VP gửi → VP nhận</th>
                <th className="px-2 py-2 text-right">Tiền còn thu</th>
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
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                    {fmtDayVn(localDayVn(o.moneyAt || o.createdAt))}
                  </td>
                  <td className="px-2 py-2 font-medium">
                    <OrderCodeLink code={o.code} />
                    {o.portion ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {PORTION_LABEL[o.portion]}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    <OfficeRouteCell order={o} />
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

function Kpi({ icon: Icon, label, value }: { icon: typeof Users2; label: string; value: string }) {
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
