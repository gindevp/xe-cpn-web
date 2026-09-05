import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { formatVND, formatDateTime, officeName } from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { listOrders } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";
import { orderGoodsLabel, packageCount, packageRows } from "@/lib/package-label";
import { ClipboardList, Package, Weight, Banknote, Search } from "lucide-react";
import { ImageLightbox, isViewableImageUrl } from "@/components/ImageLightbox";

export const Route = createFileRoute("/giao-thanh-cong")({
  head: () => ({
    meta: [
      { title: "Giao thành công — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn hàng đã giao thành công: shipper tích giao thành công hoặc điều phối xác nhận giao tại bưu cục.",
      },
      { property: "og:title", content: "Giao thành công — X.E" },
      {
        property: "og:description",
        content: "Theo dõi đơn giao thành công theo ngày, văn phòng và hình thức giao.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Giao thành công" screen="giao-thanh-cong">
      <Page />
    </ProtectedPage>
  ),
});

function deliveredBy(o: OrderX): "SHIPPER" | "OFFICE" {
  const ev = [...(o.events ?? [])].reverse().find((e) => e.action === "DELIVERED" || e.action === "POD" || e.action === "POD_QUAY");
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
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number; title: string } | null>(null);

  const scopeAll = hasAllOfficeScope(session);
  const officeCode = assignedOfficeCode(resolveViewOffice(session, viewOfficeRaw));

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const query = { status: "DELIVERED", size: 500, sort: "id,desc" as const };
        const pages = scopeAll || !officeCode
          ? [await listOrders(query)]
          : await Promise.all([
              listOrders({ ...query, fromOfficeCode: officeCode }),
              listOrders({ ...query, toOfficeCode: officeCode }),
            ]);
        const byCode = new Map<string, OrderX>();
        for (const row of pages.flat()) {
          if (row.code) byCode.set(row.code, row);
        }
        const rows = [...byCode.values()];
        if (cancelled) return;
        setApiRows(rows);
        // Merge into store so chi tiết vận đơn / KPI khác cũng thấy đủ đơn đã giao.
        useStore.setState((st) => {
          const merged = new Map(st.orders.map((o) => [o.code, o]));
          for (const o of rows) merged.set(o.code, { ...merged.get(o.code), ...o });
          return { orders: [...merged.values()] };
        });
      } catch {
        // Keep store fallback if API fails.
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
      if (o.status === "DELIVERED") byCode.set(o.code, o);
    }
    for (const o of apiRows) {
      if (o.status === "DELIVERED") byCode.set(o.code, o);
    }
    return [...byCode.values()];
  }, [storeOrders, apiRows]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return source
      .filter((o) => {
        if (!scopeAll && session?.office && o.fromOffice !== session.office && o.toOffice !== session.office)
          return false;
        const at = deliveredAt(o);
        if (from && new Date(at) < new Date(from)) return false;
        if (to && new Date(at) > new Date(to + "T23:59:59")) return false;
        if (office && o.fromOffice !== office && o.toOffice !== office) return false;
        if (mode && deliveredBy(o) !== mode) return false;
        if (kw) {
          const hay =
            `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""} ${orderGoodsLabel(o)}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => (deliveredAt(a) < deliveredAt(b) ? 1 : -1));
  }, [source, q, from, to, office, mode, scopeAll, session]);

  const metrics = useMemo(() => {
    const weight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
    const qty = rows.reduce((s, r) => s + packageCount(r), 0);
    const paid = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const unpaid = rows.reduce(
      (s, r) => s + Math.max(0, r.fare + (r.pickupFee ?? 0) - (r.paidAmount ?? 0)),
      0,
    );
    return { orders: rows.length, qty, weight, unpaid, paid };
  }, [rows]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Đơn hàng shipper tích giao thành công hoặc điều phối xác nhận giao thành công tại bưu cục.
        {loading ? " Đang tải danh sách…" : null}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={ClipboardList} label="Đơn giao thành công" value={String(metrics.orders)} />
        <Kpi icon={Package} label="Số kiện" value={String(metrics.qty)} />
        <Kpi icon={Weight} label="Khối lượng" value={`${metrics.weight.toFixed(1)} KG`} />
        <Kpi icon={Banknote} label="Tiền đã thu" value={formatVND(metrics.paid)} />
        <Kpi icon={Banknote} label="Tiền chưa thu" value={formatVND(metrics.unpaid)} />
      </div>

      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-5">
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
            <Label className="text-xs">Hình thức giao</Label>
            <SearchableSelect
              value={mode || "all"}
              onValueChange={(v) => setMode(v === "all" ? "" : v)}
              placeholder="Tất cả"
              options={[
                { value: "all", label: "Tất cả" },
                { value: "SHIPPER", label: "Shipper giao thành công" },
                { value: "OFFICE", label: "Giao tại bưu cục" },
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

      <Section title={`Danh sách đơn giao thành công (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>{loading ? "Đang tải…" : "Chưa có đơn giao thành công"}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Ảnh POD</th>
                  <th className="px-2 py-2">Thời gian giao</th>
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
                  const by = deliveredBy(r);
                  const photos = (r.podPhotos ?? [])
                    .map((p) => p.url)
                    .filter((u): u is string => Boolean(u) && isViewableImageUrl(u));
                  const pkgs = packageCount(r);
                  const open = expanded === r.code;
                  return (
                    <Fragment key={r.code}>
                      <tr className="border-b hover:bg-muted/40">
                        <td className="px-2 py-2 font-medium">
                          <OrderCodeLink code={r.code} />
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
                                  title="Xem ảnh POD"
                                  className="rounded border p-0 transition hover:ring-2 hover:ring-primary/40"
                                  onClick={() =>
                                    setLightbox({
                                      urls: photos,
                                      index: i,
                                      title: `Ảnh POD · ${r.code}`,
                                    })
                                  }
                                >
                                  <img
                                    src={url}
                                    alt={`pod-${r.code}-${i}`}
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
                          {formatDateTime(deliveredAt(r))}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <Badge variant={by === "SHIPPER" ? "default" : "secondary"}>
                            {by === "SHIPPER" ? "Shipper giao" : "Nhận tại bưu cục"}
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
                            <div className="text-xs font-medium text-muted-foreground mb-1">Chi tiết kiện</div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="py-1 pr-3">STT</th>
                                    <th className="py-1 pr-3">Mã kiện</th>
                                    <th className="py-1 pr-3">Hàng hóa</th>
                                    <th className="py-1 pr-3 text-right">SL</th>
                                    <th className="py-1 pr-3 text-right">KL (kg)</th>
                                    <th className="py-1 text-right">Cước</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {packageRows(r).map((p) => (
                                    <tr key={p.code} className="border-t border-border/50">
                                      <td className="py-1 pr-3">{p.seq}</td>
                                      <td className="py-1 pr-3 font-medium">{p.code}</td>
                                      <td className="py-1 pr-3">{p.label || "—"}</td>
                                      <td className="py-1 pr-3 text-right">{p.itemQty}</td>
                                      <td className="py-1 pr-3 text-right">{(p.weightKg ?? 0).toFixed(1)}</td>
                                      <td className="py-1 text-right">{formatVND(p.fare)}</td>
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
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
