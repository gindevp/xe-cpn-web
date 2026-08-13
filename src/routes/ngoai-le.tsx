import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatVND, formatDateTime, officeName, ORDER_STATUS_LABEL } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ClipboardList,
  Package,
  Weight,
  Banknote,
  Search,
  AlertTriangle,
  HelpCircle,
  PackageX,
  Undo2,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/ngoai-le")({
  head: () => ({
    meta: [
      { title: "Ngoại lệ - Thất lạc - Hư hỏng — X.E" },
      {
        name: "description",
        content:
          "Quản lý hàng ngoại lệ (quá ngày giao, mất mã), hàng thất lạc và hàng hư hỏng trong quá trình vận chuyển.",
      },
      { property: "og:title", content: "Ngoại lệ - Thất lạc - Hư hỏng — X.E" },
      {
        property: "og:description",
        content: "Theo dõi và xử lý đơn ngoại lệ, thất lạc, hư hỏng: khôi phục, chuyển hoàn, đóng vụ việc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Ngoại lệ - Thất lạc - Hư hỏng" screen="ngoai-le">
      <Page />
    </ProtectedPage>
  ),
});

type Tab = "EXCEPTION" | "LOST" | "DAMAGED";

const TABS: { key: Tab; label: string; hint: string }[] = [
  {
    key: "EXCEPTION",
    label: "Hàng ngoại lệ",
    hint: "Đơn quá ngày giao khách không đến nhận, mất mã/mất nhãn hoặc sai lệch thông tin — cần điều phối xác minh.",
  },
  {
    key: "LOST",
    label: "Hàng thất lạc",
    hint: "Đơn không tìm thấy trong kho/trên xe (lost) — cần mở vụ việc truy tìm và đền bù.",
  },
  {
    key: "DAMAGED",
    label: "Hàng hư hỏng",
    hint: "Đơn bị vỡ, móp, ướt, hư hỏng (damage) trong quá trình vận chuyển — lập biên bản và xử lý đền bù.",
  },
];

const AUTO_EXCEPTION_DAYS = 2;

function isAutoException(o: OrderX) {
  if (o.issue) return false;
  if (o.status !== "AT_DEST" && o.status !== "FAILED_DELIVERY") return false;
  const ref = new Date(o.updatedAt ?? o.createdAt).getTime();
  return Date.now() - ref > AUTO_EXCEPTION_DAYS * 86400000;
}

function tabOf(o: OrderX): Tab | null {
  if (o.issue && !o.issue.resolvedAt) return o.issue.type;
  if (isAutoException(o)) return "EXCEPTION";
  return null;
}

function reasonOf(o: OrderX) {
  if (o.issue?.reason) return o.issue.reason;
  if (isAutoException(o)) return `Quá ${AUTO_EXCEPTION_DAYS} ngày khách không đến nhận`;
  return "-";
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const [tab, setTab] = useState<Tab>("EXCEPTION");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scopeAll = session?.role === "DH" || session?.role === "BL" || session?.role === "AD";

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (!tabOf(o)) return false;
      if (
        !scopeAll &&
        session?.office &&
        o.fromOffice !== session.office &&
        o.toOffice !== session.office
      )
        return false;
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(to + "T23:59:59")) return false;
      if (office && o.fromOffice !== office && o.toOffice !== office) return false;
      if (kw) {
        const hay =
          `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [orders, q, from, to, office, scopeAll, session]);

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, t) => ({ ...acc, [t.key]: base.filter((o) => tabOf(o) === t.key).length }),
        {} as Record<Tab, number>,
      ),
    [base],
  );

  const rows = useMemo(() => base.filter((o) => tabOf(o) === tab), [base, tab]);

  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const value = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const unpaid = rows.reduce(
      (s, r) => s + Math.max(0, r.fare + (r.pickupFee ?? 0) - (r.paidAmount ?? 0)),
      0,
    );
    return { orders: rows.length, qty, weight, value, unpaid };
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) => setSelected(v ? new Set(rows.map((r) => r.code)) : new Set());
  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code);
      else next.delete(code);
      return next;
    });

  const apply = (
    codes: string[],
    patchOf: (o: OrderX) => Partial<OrderX>,
    action: string,
    detail: string,
    successMsg: string,
  ) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      st.updateOrder(code, {
        ...patchOf(o),
        updatedAt: at,
        events: [...(o.events ?? []), { at, by, action, detail }],
      } as Partial<OrderX>);
      st.audit({ action, entityType: "order", entityId: code, detail });
    }
    setSelected(new Set());
    toast.success(`${successMsg} · ${codes.length} đơn`);
  };

  const mark = (codes: string[], type: Tab, detail: string, msg: string) => {
    const by = useStore.getState().session?.username ?? "system";
    const at = new Date().toISOString();
    apply(codes, () => ({ issue: { type, reason: detail, at, by } }), `ISSUE_${type}`, detail, msg);
  };

  const resolve = (codes: string[]) =>
    apply(
      codes,
      (o) => ({
        issue: o.issue
          ? { ...o.issue, resolvedAt: new Date().toISOString() }
          : {
              type: "EXCEPTION" as const,
              reason: reasonOf(o),
              at: new Date().toISOString(),
              by: useStore.getState().session?.username ?? "system",
              resolvedAt: new Date().toISOString(),
            },
      }),
      "ISSUE_RESOLVED",
      "Đã xử lý xong vụ việc",
      "Đã đóng vụ việc",
    );

  const backToDelivery = (codes: string[]) =>
    apply(
      codes,
      (o) => ({
        status: "OUT_FOR_DELIVERY",
        stage: "DELIVERING",
        issue: o.issue ? { ...o.issue, resolvedAt: new Date().toISOString() } : undefined,
      }),
      "ISSUE_BACK_DELIVERY",
      "Xác minh xong, đưa lại luồng giao hàng",
      "Đã đưa lại giao hàng",
    );

  const toReturn = (codes: string[]) =>
    apply(
      codes,
      (o) => ({
        status: "RETURNING",
        returnStage: "RETURN_PENDING",
        issue: o.issue ? { ...o.issue, resolvedAt: new Date().toISOString() } : undefined,
      }),
      "ISSUE_RETURN",
      "Chuyển hoàn về người gửi từ hàng ngoại lệ",
      "Đã chuyển hoàn",
    );

  const activeTab = TABS.find((t) => t.key === tab)!;
  const sel = [...selected];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={t.key === tab ? "default" : "outline"}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
          >
            {t.label} ({counts[t.key] ?? 0})
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={ClipboardList} label="Đơn hàng" value={String(metrics.orders)} />
        <Kpi icon={Package} label="Số kiện" value={String(metrics.qty)} />
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} kg`} />
        <Kpi icon={Banknote} label="Tiền đã thu" value={formatVND(metrics.value)} />
        <Kpi icon={Banknote} label="Tiền chưa thu" value={formatVND(metrics.unpaid)} />
      </div>

      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Văn phòng</Label>
            <SearchableSelect
              value={office || "all"}
              onValueChange={(v) => setOffice(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tìm kiếm</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Mã đơn, SĐT, tên khách"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={`${activeTab.label} (${rows.length})`}
        right={
          <div className="flex flex-wrap gap-2">
            {tab === "EXCEPTION" && (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={!sel.length}
                  onClick={() => mark(sel, "LOST", "Xác nhận thất lạc hàng", "Đã ghi nhận thất lạc")}
                >
                  <HelpCircle className="h-4 w-4" />
                  Ghi nhận thất lạc ({sel.length})
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={!sel.length}
                  onClick={() =>
                    mark(sel, "DAMAGED", "Xác nhận hàng hư hỏng", "Đã ghi nhận hư hỏng")
                  }
                >
                  <PackageX className="h-4 w-4" />
                  Ghi nhận hư hỏng ({sel.length})
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={!sel.length}
                  onClick={() => toReturn(sel)}
                >
                  <Undo2 className="h-4 w-4" />
                  Chuyển hoàn ({sel.length})
                </Button>
                <Button className="gap-2" disabled={!sel.length} onClick={() => backToDelivery(sel)}>
                  <CheckCircle2 className="h-4 w-4" />
                  Đưa lại giao hàng ({sel.length})
                </Button>
              </>
            )}
            {tab !== "EXCEPTION" && (
              <Button className="gap-2" disabled={!sel.length} onClick={() => resolve(sel)}>
                <CheckCircle2 className="h-4 w-4" />
                Đã xử lý xong ({sel.length})
              </Button>
            )}
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Không có đơn trong mục này</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Ghi nhận</th>
                  <th className="px-2 py-2">Lý do</th>
                  <th className="px-2 py-2">Người gửi</th>
                  <th className="px-2 py-2">Người nhận</th>
                  <th className="px-2 py-2">VP gửi → VP nhận</th>
                  <th className="px-2 py-2">Trạng thái</th>
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  <th className="px-2 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={selected.has(r.code)}
                        onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                        aria-label={`Chọn ${r.code}`}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium">
                      <div>{r.code}</div>
                      <Badge
                        variant={tab === "EXCEPTION" ? "outline" : "destructive"}
                        className="mt-1"
                      >
                        {TABS.find((t) => t.key === tabOf(r))?.label}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      <div>{formatDateTime(r.issue?.at ?? r.updatedAt ?? r.createdAt)}</div>
                      <div className="text-xs">{r.issue?.by ?? "hệ thống"}</div>
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-2" title={reasonOf(r)}>
                      {reasonOf(r)}
                    </td>
                    <td className="px-2 py-2">
                      <div>{r.senderName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{r.senderPhone}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div>{r.receiverName}</div>
                      <div className="text-xs text-muted-foreground">{r.receiverPhone}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {officeName(r.fromOffice)} → {officeName(r.toOffice)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant="outline">{ORDER_STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right">{r.quantity ?? 1}</td>
                    <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                    <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {tab === "EXCEPTION" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                mark([r.code], "LOST", "Xác nhận thất lạc hàng", "Đã ghi nhận thất lạc")
                              }
                            >
                              Thất lạc
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                mark([r.code], "DAMAGED", "Xác nhận hàng hư hỏng", "Đã ghi nhận hư hỏng")
                              }
                            >
                              Hư hỏng
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => backToDelivery([r.code])}
                            >
                              Giao lại
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => resolve([r.code])}>
                            Đã xử lý
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Đơn tồn tại kho đích quá {AUTO_EXCEPTION_DAYS} ngày sẽ tự động vào tab Hàng ngoại lệ.
      </p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
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
