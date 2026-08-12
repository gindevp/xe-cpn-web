import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { Download } from "lucide-react";

export const Route = createFileRoute("/danh-sach-phieu-thu")({
  head: () => ({
    meta: [
      { title: "Danh sách phiếu thu — X.E" },
      {
        name: "description",
        content: "Tra cứu danh sách phiếu thu đã lập theo mã phiếu, nhân viên, người tạo và khoảng thời gian.",
      },
      { property: "og:title", content: "Danh sách phiếu thu — X.E" },
      {
        property: "og:description",
        content: "Danh sách phiếu thu đã lập kèm bộ lọc và xuất Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Danh sách phiếu thu" screen="danh-sach-phieu-thu">
      <Page />
    </ProtectedPage>
  ),
});

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

function Page() {
  const receipts = useStore((s) => s.receipts);
  const [code, setCode] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [creator, setCreator] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    return receipts.filter((r) => {
      if (code && !r.code.toLowerCase().includes(code.trim().toLowerCase())) return false;
      if (staffCode && !(r.payerCode ?? r.payer).toLowerCase().includes(staffCode.trim().toLowerCase()))
        return false;
      if (creator && !r.createdBy.toLowerCase().includes(creator.trim().toLowerCase())) return false;
      const day = r.createdAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [receipts, code, staffCode, creator, from, to]);

  const total = rows.reduce((a, r) => a + r.total, 0);

  const exportExcel = () => {
    downloadCSV(
      `danh-sach-phieu-thu-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ["STT", "Mã phiếu thu", "Người lập phiếu", "Người nộp tiền", "Thời gian lập", "Tổng tiền"],
        ...rows.map((r, i) => [
          i + 1,
          r.code,
          r.createdBy,
          r.payer,
          fmtDateTime(r.createdAt),
          r.total,
        ]),
      ],
    );
  };

  return (
    <div className="space-y-4">
      <Section title="Bộ lọc">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Mã phiếu thu</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PT..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mã nhân viên</Label>
            <Input
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
              placeholder="Mã / tên NV nộp tiền"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Người tạo</Label>
            <Input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Tài khoản lập phiếu" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {rows.length} phiếu · Tổng tiền{" "}
            <span className="font-semibold text-foreground">{formatVND(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCode("");
                setStaffCode("");
                setCreator("");
                setFrom("");
                setTo("");
              }}
            >
              Xoá lọc
            </Button>
            <Button size="sm" className="gap-2" onClick={exportExcel} disabled={rows.length === 0}>
              <Download className="h-4 w-4" />
              Xuất Excel
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Danh sách phiếu thu (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>Chưa có phiếu thu nào</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 w-14">STT</th>
                  <th className="px-2 py-2">Mã phiếu thu</th>
                  <th className="px-2 py-2">Người lập phiếu</th>
                  <th className="px-2 py-2">Người nộp tiền</th>
                  <th className="px-2 py-2">Thời gian lập</th>
                  <th className="px-2 py-2 text-right">Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.code} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2 font-medium">{r.code}</td>
                    <td className="px-2 py-2">{r.createdBy}</td>
                    <td className="px-2 py-2">{r.payer}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(r.createdAt)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">{formatVND(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
