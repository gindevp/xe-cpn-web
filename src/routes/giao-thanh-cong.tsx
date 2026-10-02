import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { usePagedRows, type Pager } from "@/lib/use-paged-rows";
import { useServerPagedRows } from "@/lib/use-server-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { OrderFeeCell, OrderFeeHeader, OrderWeightCell } from "@/components/OrderFeeCells";
import { formatVND, formatMoney, formatDateTime, officeName, orderReceiverOffice, canonicalOfficeCode } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { getOrder, listOrdersPage } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";
import { orderGoodsLabel, packageCount, packageRows } from "@/lib/package-label";
import { ImageIcon } from "lucide-react";
import { useActivityFilters } from "@/lib/activity-filters";
import { ImageLightbox, isViewableImageUrl } from "@/components/ImageLightbox";
import { InvoiceBackfillButton } from "@/components/InvoiceBackfillButton";
import { canWrite } from "@/lib/rbac";
import {
  INVOICE_STATE_LABEL,
  invoiceStateOf,
  isPastDeadline,
  paidAtWarehouseIn,
} from "@/lib/invoice-policy";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function officeCodeEq(a?: string | null, b?: string | null): boolean {
  const x = canonicalOfficeCode(a) || (a ?? "").trim();
  const y = canonicalOfficeCode(b) || (b ?? "").trim();
  if (!x || !y) return false;
  return x === y || x.toUpperCase() === y.toUpperCase();
}

export const Route = createFileRoute("/giao-thanh-cong")({
  head: () => ({
    meta: [
      { title: "Thành công — X.E" },
      {
        name: "description",
        content:
          "Đơn giao thành công và đơn hoàn thành công: shipper hoặc điều phối xác nhận tại bưu cục.",
      },
      { property: "og:title", content: "Thành công — X.E" },
      {
        property: "og:description",
        content: "Theo dõi đơn giao thành công và hoàn thành công theo ngày, văn phòng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Thành công" screen="giao-thanh-cong">
      <Page />
    </ProtectedPage>
  ),
});

function isReturned(o: OrderX): boolean {
  return o.status === "RETURNED" || (o as OrderX & { returnStage?: string }).returnStage === "RT_DONE";
}

function deliveredBy(o: OrderX): "SHIPPER" | "OFFICE" {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "DELIVERED" || e.action === "POD" || e.action === "POD_QUAY");
  const detail = `${ev?.detail ?? ""}`.toLowerCase();
  if (o.homeDelivery || detail.includes("shipper") || ev?.action === "POD") return "SHIPPER";
  return "OFFICE";
}

function deliveredAt(o: OrderX): string {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "DELIVERED" || e.action === "POD" || e.action === "POD_QUAY");
  return ev?.at ?? o.updatedAt ?? o.createdAt;
}

function returnedBy(o: OrderX): "SHIPPER" | "OFFICE" {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "RT_DONE" || e.action === "RETURNED" || e.action === "RETURN_DONE" || e.action === "POD");
  const detail = `${ev?.detail ?? ""}`.toLowerCase();
  if (detail.includes("shipper") || detail.includes("hoàn tận")) return "SHIPPER";
  return "OFFICE";
}

function returnedAt(o: OrderX): string {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "RT_DONE" || e.action === "RETURNED" || e.action === "RETURN_DONE" || e.action === "POD");
  return ev?.at ?? o.updatedAt ?? o.createdAt;
}

/** VP thao tác hoàn thành công — từ event (`VP=XX`), không có thì fallback VP gửi. */
function returnedAtOffice(o: OrderX): string {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "RT_DONE" || e.action === "RETURNED" || e.action === "RETURN_DONE" || e.action === "POD");
  const detail = `${ev?.detail ?? ""}`;
  const m = detail.match(/VP\s*=\s*([A-Za-z0-9]+)/i);
  if (m?.[1]) return m[1].toUpperCase();
  return (o.fromOffice ?? "").trim();
}

function successAt(o: OrderX): string {
  return isReturned(o) ? returnedAt(o) : deliveredAt(o);
}

function successBy(o: OrderX): "SHIPPER" | "OFFICE" {
  return isReturned(o) ? returnedBy(o) : deliveredBy(o);
}

function successOffice(o: OrderX): string {
  return isReturned(o) ? returnedAtOffice(o) : orderReceiverOffice(o);
}

/** Đơn giao thành công chưa từng xuất HĐ / chưa được kế toán tích (lần trước lỗi cũng tính) — không gồm công nợ. */
function needsInvoice(o: OrderX): boolean {
  if (o.status !== "DELIVERED" || o.onCredit) return false;
  const st = invoiceStateOf(o.invoiceStatus, o.invoiceType);
  return st === "NOT_ISSUED" || st === "FAILED";
}

function invoicePaidAt(o: OrderX): string | undefined {
  return paidAtWarehouseIn(o.collectForm) ? o.pickedUpAt : deliveredAt(o);
}

function Page() {
  const { session } = useAuth();
  const storeOrders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const viewOfficeRaw = useStore((s) => s.viewOffice);

  const { from, to, q } = useActivityFilters();
  const [office, setOffice] = useState("");
  const [mode, setMode] = useState("");
  const [kind, setKind] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number; title: string } | null>(
    null,
  );
  const [loadingPodCode, setLoadingPodCode] = useState<string | null>(null);

  const scopeAll = hasAllOfficeScope(session);
  const officeCode = assignedOfficeCode(resolveViewOffice(session, viewOfficeRaw));

  const apiMode = isApiEnabled();
  const [kwDebounced, setKwDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setKwDebounced(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  // Server: thời điểm thành công = updatedAt, hình thức = giao tận nơi (đơn tóm tắt không kèm lịch sử sự kiện).
  const scopedOffice = !scopeAll && officeCode ? officeCode : "";
  const actedOffice = scopedOffice || office;
  const officeConflict = !!scopedOffice && !!office && !officeCodeEq(scopedOffice, office);
  const server = useServerPagedRows<OrderX>(
    "giao-thanh-cong",
    JSON.stringify([from, to, actedOffice, officeConflict, mode, kind, kwDebounced]),
    async (page, size) => {
      if (officeConflict) return { rows: [], total: 0 };
      const statuses =
        kind === "GIAO" || mode === "SHIPPER" ? ["DELIVERED"] : kind === "HOAN" ? ["RETURNED"] : ["DELIVERED", "RETURNED"];
      return listOrdersPage({
        statuses,
        updatedFrom: from || undefined,
        updatedTo: to || undefined,
        successOfficeCode: actedOffice || undefined,
        homeDelivery: mode === "SHIPPER" ? true : mode === "OFFICE" ? false : undefined,
        keyword: kwDebounced || undefined,
        sort: "updatedAt,desc",
        page,
        size,
      });
    },
    apiMode,
  );
  useEffect(() => {
    if (server.error) toast.error(server.error);
  }, [server.error]);
  const loading = apiMode && server.loading;

  const source = useMemo(
    () => (apiMode ? [] : storeOrders.filter((o) => o.status === "DELIVERED" || isReturned(o))),
    [apiMode, storeOrders],
  );

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return source
      .filter((o) => {
        const ret = isReturned(o);
        if (kind === "GIAO" && ret) return false;
        if (kind === "HOAN" && !ret) return false;
        const acted = successOffice(o);
        if (!scopeAll && officeCode && !officeCodeEq(acted, officeCode)) return false;
        const at = successAt(o);
        if (from && new Date(at) < new Date(from)) return false;
        if (to && new Date(at) > new Date(to + "T23:59:59")) return false;
        if (office && !officeCodeEq(acted, office)) return false;
        if (mode && successBy(o) !== mode) return false;
        if (kw) {
          const hay =
            `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""} ${orderGoodsLabel(o)}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => (successAt(a) < successAt(b) ? 1 : -1));
  }, [source, q, from, to, office, mode, kind, scopeAll, officeCode]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Danh sách chung giao thành công và hoàn thành công.
        {loading ? " Đang tải danh sách…" : null}
      </p>

      <Section>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">VP</Label>
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
            <Label className="text-xs">Loại</Label>
            <SearchableSelect
              value={kind || "all"}
              onValueChange={(v) => setKind(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                { value: "GIAO", label: "Giao thành công" },
                { value: "HOAN", label: "Hoàn thành công" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hình thức</Label>
            <SearchableSelect
              value={mode || "all"}
              onValueChange={(v) => setMode(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                { value: "SHIPPER", label: "Shipper" },
                { value: "OFFICE", label: "Tại bưu cục" },
              ]}
            />
          </div>
        </div>
      </Section>

      <SuccessOrderTable
        rows={rows}
        server={apiMode ? { pageRows: server.pageRows, pager: server.pager } : undefined}
        loading={loading}
        emptyText="Chưa có đơn thành công"
        sectionTitle={`Danh sách thành công (${apiMode ? server.total : rows.length})`}
        expanded={expanded}
        setExpanded={setExpanded}
        lightbox={lightbox}
        setLightbox={setLightbox}
        loadingPodCode={loadingPodCode}
        canBackfillInvoice={apiMode && canWrite(session?.role, "giao-thanh-cong")}
        onReload={server.reload}
        onViewPod={async (order) => {
          const ret = isReturned(order);
          const photoLabel = ret ? "Ảnh hoàn" : "Ảnh POD";
          const local = (order.podPhotos ?? [])
            .map((p) => p.url)
            .filter((u): u is string => Boolean(u) && isViewableImageUrl(u));
          if (local.length) {
            setLightbox({ urls: local, index: 0, title: `${photoLabel} · ${order.code}` });
            return;
          }
          if (!isApiEnabled()) {
            toast.error("Không có ảnh để xem");
            return;
          }
          setLoadingPodCode(order.code);
          try {
            const detail = await getOrder(order.code);
            const urls = (detail.podPhotos ?? [])
              .map((p) => p.url)
              .filter((u): u is string => Boolean(u) && isViewableImageUrl(u));
            useStore.setState((st) => ({
              orders: st.orders.map((o) =>
                o.code === order.code ? { ...o, podPhotos: detail.podPhotos ?? o.podPhotos } : o,
              ),
            }));
            if (!urls.length) {
              toast.error(`Không có ${photoLabel.toLowerCase()}`);
              return;
            }
            setLightbox({ urls, index: 0, title: `${photoLabel} · ${order.code}` });
          } catch (e: any) {
            toast.error(e?.message || "Không tải được ảnh");
          } finally {
            setLoadingPodCode(null);
          }
        }}
      />
    </div>
  );
}

function SuccessOrderTable({
  rows,
  server,
  loading,
  emptyText,
  sectionTitle,
  expanded,
  setExpanded,
  lightbox,
  setLightbox,
  loadingPodCode,
  canBackfillInvoice,
  onReload,
  onViewPod,
}: {
  rows: OrderX[];
  canBackfillInvoice: boolean;
  onReload: () => void;
  /** Phân trang phía server — có thì bỏ qua {@code rows}. */
  server?: { pageRows: OrderX[]; pager: Pager };
  loading: boolean;
  emptyText: string;
  sectionTitle: string;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  lightbox: { urls: string[]; index: number; title: string } | null;
  setLightbox: (v: { urls: string[]; index: number; title: string } | null) => void;
  loadingPodCode: string | null;
  onViewPod: (order: OrderX) => void | Promise<void>;
}) {
  const local = usePagedRows(rows, "giao-thanh-cong");
  const pageRows = server ? server.pageRows : local.pageRows;
  const pager = server ? server.pager : local.pager;
  const invoiceTargets = pageRows.filter(needsInvoice);
  return (
    <>
      <Section
        title={sectionTitle}
        right={
          canBackfillInvoice ? (
            <InvoiceBackfillButton
              orderCodes={invoiceTargets.map((o) => o.code)}
              lateCount={invoiceTargets.filter((o) => isPastDeadline(invoicePaidAt(o))).length}
              label={`Xuất bù HĐ đơn chưa xuất trên trang (${invoiceTargets.length})`}
              onDone={onReload}
            />
          ) : undefined
        }
      >
        {pager.total === 0 ? (
          <EmptyState>{loading ? "Đang tải…" : emptyText}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Ảnh</th>
                  <th className="px-2 py-2">Thời gian</th>
                  <th className="px-2 py-2">Hình thức</th>
                  <th className="px-2 py-2">Người gửi</th>
                  <th className="px-2 py-2">Người nhận</th>
                  <th className="px-2 py-2">VP gửi → VP nhận</th>
                  <th className="px-2 py-2">Chuyến</th>
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <OrderFeeHeader className="text-muted-foreground" />
                  <th className="px-2 py-2 text-right">Đã thu</th>
                  <th className="px-2 py-2">Hoá đơn</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const ret = isReturned(r);
                  const pkgs = packageCount(r);
                  const open = expanded === r.code;
                  const shipper = successBy(r) === "SHIPPER";
                  const photoLabel = ret ? "Xem ảnh hoàn" : "Xem POD";
                  const busy = loadingPodCode === r.code;
                  return (
                    <Fragment key={r.code}>
                      <tr className="border-b hover:bg-muted/40">
                        <td className="px-2 py-2 font-medium">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <OrderCodeLink code={r.code} />
                            {ret ? (
                              <Badge variant="outline" className="border-amber-500 text-amber-700">
                                HOÀN
                              </Badge>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className="mt-0.5 block text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => setExpanded(open ? null : r.code)}
                          >
                            {open ? "Ẩn kiện" : `Xem ${pkgs} kiện`}
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 px-2.5 text-xs"
                            disabled={busy}
                            onClick={() => void onViewPod(r)}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            {busy ? "Đang tải…" : photoLabel}
                          </Button>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(successAt(r))}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <Badge variant={shipper ? "default" : "secondary"}>
                            {ret
                              ? shipper
                                ? "Shipper hoàn"
                                : "Hoàn tại bưu cục"
                              : shipper
                                ? "Shipper giao"
                                : "Nhận tại bưu cục"}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          <div>{r.senderName ?? "-"}</div>
                          <div className="text-xs text-muted-foreground">{r.senderPhone}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div>{r.receiverName}</div>
                          <div className="text-xs text-muted-foreground">{r.receiverPhone}</div>
                          {r.receiverActualName ? (
                            <div className="text-[11px] text-muted-foreground">
                              Thực nhận: {r.receiverActualName}
                              {r.receiverActualPhone ? ` · ${r.receiverActualPhone}` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <OfficeRouteCell order={r} />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.tripCode ?? "-"}</td>
                        <td className="px-2 py-2 text-right font-medium">{pkgs}</td>
                        <OrderWeightCell order={r} />
                        <OrderFeeCell order={r} />
                        <td className="px-2 py-2 text-right">{formatMoney(r.paidAmount ?? 0)}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {ret ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            (() => {
                              const label = INVOICE_STATE_LABEL[invoiceStateOf(r.invoiceStatus, r.invoiceType)];
                              return (
                                <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", label.cls)}>
                                  {label.text}
                                </span>
                              );
                            })()
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={13} className="px-3 py-2">
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              Chi tiết kiện
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="py-1 pr-3">STT</th>
                                    <th className="py-1 pr-3">Mã kiện</th>
                                    <th className="py-1 pr-3">Hàng hóa</th>
                                    <th className="py-1 pr-3 text-right">SL</th>
                                    <th className="py-1 text-right">KL (kg)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {packageRows(r).map((p) => (
                                    <tr key={p.code} className="border-t border-border/50">
                                      <td className="py-1 pr-3">{p.seq}</td>
                                      <td className="py-1 pr-3 font-medium">{p.code}</td>
                                      <td className="py-1 pr-3">{p.label || "—"}</td>
                                      <td className="py-1 pr-3 text-right">{p.itemQty}</td>
                                      <td className="py-1 text-right">
                                        {(p.weightKg ?? 0).toFixed(1)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <TablePagination pager={pager} />
          </div>
        )}
      </Section>

      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
        urls={lightbox?.urls ?? []}
        index={lightbox?.index ?? 0}
        title={lightbox?.title}
      />
    </>
  );
}
