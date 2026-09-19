import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { formatVND, formatDateTime, officeName, orderReceiverOffice, canonicalOfficeCode } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { listOrders } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";
import { orderGoodsLabel, packageCount, packageRows } from "@/lib/package-label";
import { Search } from "lucide-react";
import { ImageLightbox, isViewableImageUrl } from "@/components/ImageLightbox";

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

function Page() {
  const { session } = useAuth();
  const storeOrders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const viewOfficeRaw = useStore((s) => s.viewOffice);

  const [apiRows, setApiRows] = useState<OrderX[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [office, setOffice] = useState("");
  const [mode, setMode] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number; title: string } | null>(
    null,
  );

  const scopeAll = hasAllOfficeScope(session);
  const officeCode = assignedOfficeCode(resolveViewOffice(session, viewOfficeRaw));

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const deliveredQuery = { status: "DELIVERED", size: 500, sort: "id,desc" as const };
        const returnedQuery = { status: "RETURNED", size: 500, sort: "id,desc" as const };
        const deliveredPages =
          scopeAll || !officeCode
            ? [await listOrders(deliveredQuery)]
            : [await listOrders({ ...deliveredQuery, receiverOfficeCode: officeCode })];
        const returnedPages = [await listOrders(returnedQuery)];
        const byCode = new Map<string, OrderX>();
        for (const row of [...deliveredPages.flat(), ...returnedPages.flat()]) {
          if (row.code) byCode.set(row.code, row);
        }
        const rows = [...byCode.values()];
        if (cancelled) return;
        setApiRows(rows);
        useStore.setState((st) => {
          const merged = new Map(st.orders.map((o) => [o.code, o]));
          for (const o of rows) merged.set(o.code, { ...merged.get(o.code), ...o });
          return { orders: [...merged.values()] };
        });
      } catch {
        /* store fallback */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeAll, officeCode]);

  const source = useMemo(() => {
    const byCode = new Map<string, OrderX>();
    for (const o of storeOrders) {
      if (o.status === "DELIVERED" || isReturned(o)) byCode.set(o.code, o);
    }
    for (const o of apiRows) {
      if (o.status === "DELIVERED" || isReturned(o)) byCode.set(o.code, o);
    }
    return [...byCode.values()];
  }, [storeOrders, apiRows]);

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
        <div className="grid gap-3 md:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
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

      <SuccessOrderTable
        rows={rows}
        loading={loading}
        emptyText="Chưa có đơn thành công"
        sectionTitle={`Danh sách thành công (${rows.length})`}
        expanded={expanded}
        setExpanded={setExpanded}
        lightbox={lightbox}
        setLightbox={setLightbox}
      />
    </div>
  );
}

function SuccessOrderTable({
  rows,
  loading,
  emptyText,
  sectionTitle,
  expanded,
  setExpanded,
  lightbox,
  setLightbox,
}: {
  rows: OrderX[];
  loading: boolean;
  emptyText: string;
  sectionTitle: string;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  lightbox: { urls: string[]; index: number; title: string } | null;
  setLightbox: (v: { urls: string[]; index: number; title: string } | null) => void;
}) {
  return (
    <>
      <Section title={sectionTitle}>
        {rows.length === 0 ? (
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
                  <th className="px-2 py-2">Hàng hóa</th>
                  <th className="px-2 py-2">Chuyến</th>
                  <th className="px-2 py-2 text-right">Kiện</th>
                  <th className="px-2 py-2 text-right">KL</th>
                  <th className="px-2 py-2 text-right">Cước</th>
                  <th className="px-2 py-2 text-right">Đã thu</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ret = isReturned(r);
                  const photos = (r.podPhotos ?? [])
                    .map((p) => p.url)
                    .filter((u): u is string => Boolean(u) && isViewableImageUrl(u));
                  const pkgs = packageCount(r);
                  const open = expanded === r.code;
                  const shipper = successBy(r) === "SHIPPER";
                  const photoLabel = ret ? "Ảnh hoàn" : "Ảnh POD";
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
                          {photos.length ? (
                            <div className="flex gap-1">
                              {photos.slice(0, 3).map((url, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  title={`Xem ${photoLabel}`}
                                  className="rounded border p-0 transition hover:ring-2 hover:ring-primary/40"
                                  onClick={() =>
                                    setLightbox({
                                      urls: photos,
                                      index: i,
                                      title: `${photoLabel} · ${r.code}`,
                                    })
                                  }
                                >
                                  <img
                                    src={url}
                                    alt={`${photoLabel}-${r.code}-${i}`}
                                    className="h-12 w-12 rounded object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
                          {officeName(r.fromOffice)} → {officeName(r.toOffice)}
                        </td>
                        <td className="px-2 py-2 max-w-[160px] truncate" title={orderGoodsLabel(r)}>
                          {orderGoodsLabel(r) || "—"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.tripCode ?? "-"}</td>
                        <td className="px-2 py-2 text-right font-medium">{pkgs}</td>
                        <td className="px-2 py-2 text-right">{(r.weightKg ?? 0).toFixed(1)}</td>
                        <td className="px-2 py-2 text-right">{formatVND(r.fare)}</td>
                        <td className="px-2 py-2 text-right">{formatVND(r.paidAmount ?? 0)}</td>
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
