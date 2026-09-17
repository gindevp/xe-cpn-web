import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice, VIEW_ALL_OFFICES } from "@/lib/office-scope";
import { isApiEnabled } from "@/lib/api/client";
import { listInventoryChecks, type InventoryCheckRow } from "@/lib/api/inventory-check-api";
import { officeName } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Eye, Package, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/kiem-ke")({
  head: () => ({
    meta: [
      { title: "Thông tin kiểm kê — X.E" },
      {
        name: "description",
        content: "Lịch sử kiểm kho theo văn phòng: tổng đơn, đã kiểm, thiếu.",
      },
      { property: "og:title", content: "Thông tin kiểm kê — X.E" },
      { property: "og:description", content: "Lịch sử kiểm kho của văn phòng." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Thông tin kiểm kê" screen="kiem-ke">
      <Page />
    </ProtectedPage>
  ),
});

function formatDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function initialOf(name: string) {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  return (parts[parts.length - 1][0] || "?").toUpperCase();
}

function Page() {
  const { session } = useAuth();
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const scopeAll = hasAllOfficeScope(session);
  const officeCode = assignedOfficeCode(resolveViewOffice(session, viewOfficeRaw));

  const [rows, setRows] = useState<InventoryCheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<InventoryCheckRow | null>(null);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const office =
        scopeAll && (!officeCode || officeCode === VIEW_ALL_OFFICES) ? undefined : officeCode || undefined;
      setRows(await listInventoryChecks(office));
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Không tải được lịch sử kiểm kho");
    } finally {
      setLoading(false);
    }
  }, [scopeAll, officeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) => {
      const hay = [
        r.checkedByName,
        r.checkedByUsername,
        r.officeCode,
        ...(r.missingCodes ?? []),
        ...(r.scannedCodes ?? []),
        ...(r.systemCodes ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [rows, q]);

  const latest = filtered[0] ?? null;
  const latestName = (latest?.checkedByName || latest?.checkedByUsername || "").toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã đơn, SĐT..."
          />
        </div>
      </div>

      {/* Kiểm kê gần nhất — 3 khối báo cáo */}
      <div>
        <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
          {latest
            ? `Kiểm kê gần nhất — ${formatDay(latest.checkedAt)}${latestName ? ` - ${latestName}` : ""}`
            : "Kiểm kê gần nhất"}
        </div>
        {latest ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi icon={Package} tone="blue" label="Tổng số đơn" value={String(latest.systemCount)} />
            <Kpi icon={CheckCircle2} tone="green" label="Số đơn đã kiểm" value={String(latest.checkedCount)} />
            <Kpi icon={AlertTriangle} tone="red" label="Số đơn thiếu" value={String(latest.missingCount)} />
          </div>
        ) : (
          <div className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
            {loading
              ? "Đang tải…"
              : "Chưa có lần kiểm kho nào tại VP này. Nhân viên hoàn tất Kiểm kho trên app để hiện lịch sử."}
          </div>
        )}
      </div>

      {/* Lịch sử kiểm kê */}
      <div>
        <div className="mb-3 text-sm font-semibold text-foreground">
          Lịch sử kiểm kê ({filtered.length})
        </div>
        {filtered.length === 0 ? (
          <EmptyState>{loading ? "Đang tải…" : "Không có lịch sử kiểm kê"}</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/90 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-12 px-3 py-3">STT</th>
                    <th className="px-3 py-3">Người kiểm kê</th>
                    <th className="px-3 py-3">Ngày kiểm</th>
                    <th className="px-3 py-3 text-right">Tổng số đơn</th>
                    <th className="px-3 py-3 text-right">Đã kiểm</th>
                    <th className="px-3 py-3 text-right">Thiếu</th>
                    <th className="px-3 py-3 text-right">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const name = r.checkedByName || r.checkedByUsername || "—";
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initialOf(name)}
                            </span>
                            <span className="font-medium">{name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">{formatDay(r.checkedAt)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.systemCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-600">
                          {r.checkedCount}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.missingCount > 0 ? (
                            <span className="font-semibold text-destructive">{r.missingCount}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setDetail(r)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Xem chi tiết
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết kiểm kê</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                <Meta label="Văn phòng" value={officeName(detail.officeCode)} />
                <Meta label="Ngày kiểm" value={formatDay(detail.checkedAt)} />
                <Meta label="Người kiểm" value={detail.checkedByName || detail.checkedByUsername} />
                <Meta label="Username" value={detail.checkedByUsername} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Tổng {detail.systemCount}</Badge>
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Đã kiểm {detail.checkedCount}</Badge>
                <Badge variant={detail.missingCount > 0 ? "destructive" : "outline"}>
                  Thiếu {detail.missingCount}
                </Badge>
              </div>
              <CodeList title="Đơn thiếu" codes={detail.missingCodes} empty="Không thiếu đơn" tone="danger" />
              <CodeList title="Đơn đã quét" codes={detail.scannedCodes} empty="Chưa quét đơn nào" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone: "blue" | "green" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "red"
        ? "bg-red-50 text-red-600"
        : "bg-sky-50 text-sky-600";
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", toneCls)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

function CodeList({
  title,
  codes,
  empty,
  tone,
}: {
  title: string;
  codes: string[];
  empty: string;
  tone?: "danger";
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      {codes.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <Badge
              key={c}
              variant={tone === "danger" ? "destructive" : "outline"}
              className="font-mono text-[11px]"
            >
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
