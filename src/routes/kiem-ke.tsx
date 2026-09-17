import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { formatDateTime, formatVND } from "@/lib/mock-data";
import { packageCount, warehouseInSeqs } from "@/lib/package-label";
import { cn } from "@/lib/utils";
import { ChevronDown, Download, Eye, Printer } from "lucide-react";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { OrderPackageListRow } from "@/components/OrderPackageListRow";
import { OrderCodeLink, useOrderHistory } from "@/components/OrderHistoryDialog";

export const Route = createFileRoute("/kiem-ke")({
  head: () => ({
    meta: [
      { title: "Thông tin kiểm kê — X.E" },
      {
        name: "description",
        content: "Danh sách toàn bộ đơn hàng đang nằm trong kho kèm tag trạng thái hiện tại.",
      },
      { property: "og:title", content: "Thông tin kiểm kê — X.E" },
      { property: "og:description", content: "Kiểm kê đơn hàng đang ở kho theo trạng thái." },
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

type TagTone = "default" | "secondary" | "outline" | "destructive";

const STAGE_TAG: Record<string, { label: string; tone: TagTone }> = {
  PICKED: { label: "Đã lấy hàng", tone: "secondary" },
  WH_IN: { label: "Nhập kho gửi", tone: "default" },
  TRANSFER_PENDING: { label: "Chờ luân chuyển", tone: "outline" },
  TRANSFERRING: { label: "Đang luân chuyển", tone: "outline" },
  DEST_WH_IN: { label: "Nhập kho giao", tone: "default" },
  DELIVERING: { label: "Đang giao hàng", tone: "secondary" },
  FAILED: { label: "Giao không thành công", tone: "destructive" },
};

const RSTAGE_TAG: Record<string, { label: string; tone: TagTone }> = {
  RETURN_PENDING: { label: "Chờ chuyển hoàn", tone: "destructive" },
  RT_TRANSFER_PENDING: { label: "Chờ luân chuyển hoàn", tone: "outline" },
  RT_TRANSFERRING: { label: "Đang luân chuyển hoàn", tone: "outline" },
  RT_WH_IN: { label: "Nhập kho hoàn", tone: "default" },
  RT_DELIVERING: { label: "Đang hoàn hàng", tone: "secondary" },
  RT_FAILED: { label: "Hoàn không thành công", tone: "destructive" },
};

const COL_COUNT = 10;

/** Đơn "đang ở kho" = còn tồn trong hệ thống kho (chưa giao/hoàn xong, chưa huỷ) */
function warehouseTag(o: any) {
  if (o.returnStage) return RSTAGE_TAG[o.returnStage] ?? null;
  if (o.stage) return STAGE_TAG[o.stage] ?? null;
  return null;
}

function warehouseOffice(o: any) {
  if (o.returnStage) return o.returnStage === "RETURN_PENDING" ? o.toOffice : o.fromOffice;
  if (["DEST_WH_IN", "DELIVERING", "FAILED"].includes(o.stage)) return o.toOffice;
  return o.fromOffice;
}

/** Tab nhập kho giao / đang LC: hiện đủ/thiếu kiện theo [WHIN]. */
function showPackageInbound(o: any) {
  return o.stage === "TRANSFERRING" || o.stage === "DEST_WH_IN" || o.returnStage === "RT_TRANSFERRING";
}

function Page() {
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const { openOrderHistory } = useOrderHistory();
  const [office, setOffice] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [q, setQ] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<{ code: string; packageSeq?: number } | null>(null);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return orders
      .map((o: any) => ({ o, tag: warehouseTag(o), office: warehouseOffice(o) }))
      .filter((r) => r.tag)
      .filter((r) => (office === "ALL" ? true : r.office === office))
      .filter((r) => (tag === "ALL" ? true : r.tag!.label === tag))
      .filter((r) =>
        !kw
          ? true
          : [r.o.code, r.o.senderName, r.o.senderPhone, r.o.receiverName, r.o.receiverPhone]
              .filter(Boolean)
              .some((v: string) => String(v).toLowerCase().includes(kw)),
      )
      .sort((a, b) => new Date(b.o.updatedAt).getTime() - new Date(a.o.updatedAt).getTime());
  }, [orders, office, tag, q]);

  const allTags = useMemo(
    () =>
      Array.from(
        new Set([...Object.values(STAGE_TAG), ...Object.values(RSTAGE_TAG)].map((t) => t.label)),
      ),
    [],
  );

  const toggleExpand = (code: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const exportExcel = () => {
    downloadCSV(
      `kiem-ke-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ["Mã đơn", "Trạng thái", "Kho", "Người gửi", "Người nhận", "KL (kg)", "Kiện", "Cước", "Cập nhật"],
        ...rows.map((r) => [
          r.o.code,
          r.tag!.label,
          offices.find((x) => x.code === r.office)?.name ?? r.office ?? "",
          `${r.o.senderName ?? ""} ${r.o.senderPhone ?? ""}`,
          `${r.o.receiverName ?? ""} ${r.o.receiverPhone ?? ""}`,
          r.o.weightKg ?? 0,
          packageCount(r.o),
          r.o.fare ?? 0,
          formatDateTime(r.o.updatedAt),
        ]),
      ],
    );
  };

  return (
    <div className="space-y-4">
      <Section title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56 space-y-1.5">
            <Label className="text-xs">Kho</Label>
            <SearchableSelect
              value={office}
              onValueChange={setOffice}
              options={[
                { value: "ALL", label: "Tất cả kho" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="w-60 space-y-1.5">
            <Label className="text-xs">Trạng thái</Label>
            <SearchableSelect
              value={tag}
              onValueChange={setTag}
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                ...allTags.map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>
          <div className="w-72 space-y-1.5">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn, tên, SĐT" />
          </div>
          <div className="ml-auto">
            <Button size="sm" className="gap-2" onClick={exportExcel} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Xuất Excel
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Đơn hàng đang ở kho (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Không có đơn nào trong kho</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Mã đơn</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Kho</th>
                  <th className="px-3 py-2">Người gửi</th>
                  <th className="px-3 py-2">Người nhận</th>
                  <th className="px-3 py-2 text-right">KL (kg)</th>
                  <th className="px-3 py-2 text-right">Kiện</th>
                  <th className="px-3 py-2 text-right">Cước</th>
                  <th className="px-3 py-2">Cập nhật</th>
                  <th className="px-3 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pkgs = packageCount(r.o);
                  const inPkgs = warehouseInSeqs(r.o).length;
                  const inbound = showPackageInbound(r.o);
                  const expanded = expandedOrders.has(r.o.code);
                  return (
                    <Fragment key={r.o.code}>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title={expanded ? "Ẩn kiện" : "Xem kiện"}
                              onClick={() => toggleExpand(r.o.code)}
                            >
                              <ChevronDown
                                className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
                              />
                            </button>
                            <OrderCodeLink code={r.o.code} />
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={r.tag!.tone}>{r.tag!.label}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {offices.find((x) => x.code === r.office)?.name ?? r.office}
                        </td>
                        <td className="px-3 py-2">
                          <div>{r.o.senderName}</div>
                          <div className="text-xs text-muted-foreground">{r.o.senderPhone}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{r.o.receiverName}</div>
                          <div className="text-xs text-muted-foreground">{r.o.receiverPhone}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.o.weightKg ?? "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {inbound ? `${inPkgs}/${pkgs}` : pkgs}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatVND(r.o.fare ?? 0)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDateTime(r.o.updatedAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Thông tin đơn"
                              onClick={() => openOrderHistory(r.o.code)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="In tem"
                              onClick={() => setPrintTarget({ code: r.o.code })}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <OrderPackageListRow
                          order={r.o}
                          layout="panel"
                          colSpan={COL_COUNT}
                          showInboundStatus={inbound}
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

      <PrintLabelDialog
        code={printTarget?.code ?? null}
        packageSeq={printTarget?.packageSeq}
        open={!!printTarget}
        onOpenChange={(v) => !v && setPrintTarget(null)}
      />
    </div>
  );
}
