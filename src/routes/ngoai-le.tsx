import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OrderPackageListRow } from "@/components/OrderPackageListRow";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { StageTabButton, StageTabRow } from "@/components/StageTabs";
import { formatVND, formatDateTime, officeName, ORDER_STATUS_LABEL } from "@/lib/mock-data";
import { packageCount } from "@/lib/package-label";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope } from "@/lib/office-scope";
import {
  displayIssueReason,
  issueFromStageOf,
  ISSUE_FROM_STAGE_LABEL,
  type IssueFromStage,
} from "@/lib/order-edit-policy";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useOrdersPolling, refreshOrdersNow } from "@/lib/use-orders-poll";
import { DonHuyPanel } from "./don-huy";
import {
  Search,
  AlertTriangle,
  Warehouse,
  Ban,
  ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/ngoai-le")({
  head: () => ({
    meta: [
      { title: "Ngoại lệ - Thất lạc - Hư hỏng - Đơn huỷ — X.E" },
      {
        name: "description",
        content:
          "Quản lý hàng ngoại lệ (quá ngày giao, mất mã), hàng thất lạc, hàng hư hỏng và đơn huỷ.",
      },
      { property: "og:title", content: "Ngoại lệ - Thất lạc - Hư hỏng - Đơn huỷ — X.E" },
      {
        property: "og:description",
        content: "Theo dõi và xử lý đơn ngoại lệ, thất lạc, hư hỏng, đơn huỷ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Ngoại lệ - Thất lạc - Hư hỏng - Đơn huỷ" screen="ngoai-le">
      <Page />
    </ProtectedPage>
  ),
});

type IssueTab = "EXCEPTION" | "LOST" | "DAMAGED";
type Tab = IssueTab | "CANCELLED";

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
  {
    key: "CANCELLED",
    label: "Đơn huỷ",
    hint: "Đơn hàng được điều phối huỷ trên hệ thống khi khách tạo nhầm hoặc không gửi nữa.",
  },
];

const AUTO_EXCEPTION_DAYS = 2;

function isAutoException(o: OrderX) {
  if (o.issue) return false;
  if (o.status !== "AT_DEST" && o.status !== "FAILED_DELIVERY") return false;
  const ref = new Date(o.updatedAt ?? o.createdAt).getTime();
  return Date.now() - ref > AUTO_EXCEPTION_DAYS * 86400000;
}

function tabOf(o: OrderX): IssueTab | null {
  if (o.issue && !o.issue.resolvedAt) return o.issue.type;
  if (isAutoException(o)) return "EXCEPTION";
  return null;
}

function reasonOf(o: OrderX) {
  if (o.issue?.reason) return displayIssueReason(o.issue.reason);
  if (isAutoException(o)) return `Quá ${AUTO_EXCEPTION_DAYS} ngày khách không đến nhận`;
  return "-";
}

function restorePatch(o: OrderX, fromStage: IssueFromStage, at: string, by: string): Partial<OrderX> {
  const baseIssue = o.issue
    ? { ...o.issue, fromStage: o.issue.fromStage ?? fromStage }
    : {
        type: "EXCEPTION" as const,
        reason: reasonOf(o),
        at,
        by,
        fromStage,
      };
  return {
    stage: fromStage,
    ...(fromStage === "WH_IN" ? { tripCode: undefined } : {}),
    issue: { ...baseIssue, resolvedAt: at },
  };
}

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  useOrdersPolling(4000);

  const [tab, setTab] = useState<Tab>("EXCEPTION");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<{ code: string; packageSeq?: number } | null>(null);

  const scopeAll = hasAllOfficeScope(session);

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

  const counts = useMemo(() => {
    const issueCounts = (["EXCEPTION", "LOST", "DAMAGED"] as IssueTab[]).reduce(
      (acc, t) => ({ ...acc, [t]: base.filter((o) => tabOf(o) === t).length }),
      {} as Record<IssueTab, number>,
    );
    const cancelled = orders.filter((o) => {
      if (o.status !== "CANCELLED") return false;
      if (
        !scopeAll &&
        session?.office &&
        o.fromOffice !== session.office &&
        o.toOffice !== session.office
      )
        return false;
      return true;
    }).length;
    return { ...issueCounts, CANCELLED: cancelled } as Record<Tab, number>;
  }, [base, orders, scopeAll, session]);

  const rows = useMemo(
    () => (tab === "CANCELLED" ? [] : base.filter((o) => tabOf(o) === tab)),
    [base, tab],
  );

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) => setSelected(v ? new Set(rows.map((r) => r.code)) : new Set());
  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code);
      else next.delete(code);
      return next;
    });
  const toggleOrderPkgs = (code: string) =>
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const restoreToWarehouse = (codes: string[]) => {
    if (!codes.length) return;
    const st = useStore.getState();
    const by = st.session?.username ?? "system";
    const at = new Date().toISOString();
    let n = 0;
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code);
      if (!o) continue;
      const fromStage = issueFromStageOf(o);
      const label = ISSUE_FROM_STAGE_LABEL[fromStage];
      const detail = `Đưa lại ${label.toLowerCase()}`;
      st.updateOrder(code, restorePatch(o, fromStage, at, by), {
        eventAction: "ISSUE_RESTORE_WH",
        eventDetail: detail,
      });
      st.audit({ action: "ISSUE_RESTORE_WH", entityType: "order", entityId: code, detail });
      n += 1;
    }
    setSelected(new Set());
    if (n) toast.success(`Đã đưa lại kho · ${n} đơn`);
    void refreshOrdersNow();
  };

  const activeTab = TABS.find((t) => t.key === tab)!;
  const sel = [...selected];
  const selSameStage = useMemo(() => {
    if (!selected.size) return null as IssueFromStage | null;
    const stages = new Set(
      [...selected]
        .map((code) => rows.find((r) => r.code === code))
        .filter(Boolean)
        .map((o) => issueFromStageOf(o!)),
    );
    return stages.size === 1 ? [...stages][0]! : null;
  }, [selected, rows]);

  return (
    <div className="space-y-4">
      <StageTabRow className="gap-2.5 md:gap-3">
        {TABS.map((t) => (
          <StageTabButton
            key={t.key}
            active={t.key === tab}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
          >
            {t.key === "CANCELLED" ? (
              <span className="inline-flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5 shrink-0" />
                {t.label} ({counts[t.key] ?? 0})
              </span>
            ) : (
              `${t.label} (${counts[t.key] ?? 0})`
            )}
          </StageTabButton>
        ))}
      </StageTabRow>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      {tab === "CANCELLED" ? (
        <DonHuyPanel />
      ) : (
        <>
      <Section>
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
            <Button
              className="gap-2"
              disabled={!sel.length}
              onClick={() => restoreToWarehouse(sel)}
            >
              <Warehouse className="h-4 w-4" />
              {selSameStage
                ? `${ISSUE_FROM_STAGE_LABEL[selSameStage]} (${sel.length})`
                : `Đưa lại kho (${sel.length})`}
            </Button>
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
                {rows.map((r) => {
                  const fromStage = issueFromStageOf(r);
                  const restoreLabel = ISSUE_FROM_STAGE_LABEL[fromStage];
                  return (
                  <Fragment key={r.code}>
                    <tr className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(r.code)}
                          onCheckedChange={(v) => toggle(r.code, Boolean(v))}
                          aria-label={`Chọn ${r.code}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center text-left"
                            title={expandedOrders.has(r.code) ? "Ẩn kiện" : "Xem kiện"}
                            onClick={() => toggleOrderPkgs(r.code)}
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                expandedOrders.has(r.code) && "rotate-180",
                              )}
                            />
                          </button>
                          <OrderCodeLink code={r.code} />
                        </span>
                        <Badge
                          variant={tab === "EXCEPTION" ? "outline" : "destructive"}
                          className="mt-1 ml-6"
                        >
                          {TABS.find((t) => t.key === tabOf(r))?.label}
                        </Badge>
                        <button
                          type="button"
                          className="mt-0.5 block pl-6 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => toggleOrderPkgs(r.code)}
                        >
                          {expandedOrders.has(r.code)
                            ? "Ẩn kiện"
                            : `Xem ${packageCount(r)} kiện`}
                        </button>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        <div>{formatDateTime(r.issue?.at ?? r.updatedAt ?? r.createdAt)}</div>
                        <div className="text-xs">{r.issue?.by ?? "hệ thống"}</div>
                      </td>
                      <td className="max-w-[220px] px-2 py-2" title={reasonOf(r)}>
                        <div className="truncate">{reasonOf(r)}</div>
                        {r.issue?.photos?.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.issue.photos.slice(0, 3).map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Minh chứng ${i + 1}`}
                                className="h-10 w-14 rounded border object-cover"
                              />
                            ))}
                          </div>
                        ) : null}
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
                      <td className="px-2 py-2 text-right">{packageCount(r)}</td>
                      <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => restoreToWarehouse([r.code])}
                        >
                          <Warehouse className="h-3.5 w-3.5" />
                          {restoreLabel}
                        </Button>
                      </td>
                    </tr>
                    {expandedOrders.has(r.code) ? (
                      <OrderPackageListRow
                        order={r}
                        layout="panel"
                        colSpan={12}
                        onPrintPackage={(code, seq) => setPrintTarget({ code, packageSeq: seq })}
                      />
                    ) : null}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Đơn tồn tại kho đích quá {AUTO_EXCEPTION_DAYS} ngày sẽ tự động vào tab Hàng ngoại lệ.
        Tác vụ đưa lại kho theo nguồn ghi nhận (nhập kho gửi / nhập kho giao).
      </p>
      <PrintLabelDialog
        open={!!printTarget}
        onOpenChange={(v) => {
          if (!v) setPrintTarget(null);
        }}
        code={printTarget?.code ?? null}
        packageSeq={printTarget?.packageSeq}
      />
        </>
      )}
    </div>
  );
}
