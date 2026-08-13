import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Download, Printer } from "lucide-react";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";

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

// Đơn "đang ở kho" = còn tồn trong hệ thống kho (chưa giao/hoàn xong, chưa huỷ)
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

function Page() {
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const [office, setOffice] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [q, setQ] = useState("");
  const [printCode, setPrintCode] = useState<string | null>(null);

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

  const exportExcel = () => {
    downloadCSV(
      `kiem-ke-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ["Mã đơn", "Trạng thái", "Kho", "Người gửi", "Người nhận", "KL (kg)", "SL", "Cước", "Cập nhật"],
        ...rows.map((r) => [
          r.o.code,
          r.tag!.label,
          offices.find((x) => x.code === r.office)?.name ?? r.office ?? "",
          `${r.o.senderName ?? ""} ${r.o.senderPhone ?? ""}`,
          `${r.o.receiverName ?? ""} ${r.o.receiverPhone ?? ""}`,
          r.o.weightKg ?? 0,
          r.o.quantity ?? 1,
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
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Cước</th>
                  <th className="px-3 py-2">Cập nhật</th>
                  <th className="px-3 py-2 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.o.code} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.o.code}</td>
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
                    <td className="px-3 py-2 text-right tabular-nums">{r.o.quantity ?? 1}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatVND(r.o.fare ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(r.o.updatedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPrintCode(r.o.code)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <PrintLabelDialog
        code={printCode}
        open={!!printCode}
        onOpenChange={(v) => !v && setPrintCode(null)}
      />
    </div>
  );
}
