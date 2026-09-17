import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND, officeName } from "@/lib/mock-data";
import { useStore, type ReceiptRec } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { CheckCircle2, Download, RotateCcw, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { assignedOfficeCode, resolveViewOffice, VIEW_ALL_OFFICES } from "@/lib/office-scope";
import { isApiEnabled } from "@/lib/api/client";
import { syncFinanceFromApi } from "@/lib/api/sync";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/danh-sach-phieu-thu")({
  head: () => ({
    meta: [
      { title: "Danh sách phiếu thu — X.E" },
      {
        name: "description",
        content: "Tra cứu danh sách phiếu thu đã lập theo văn phòng, mã phiếu, nhân viên và người lập.",
      },
      { property: "og:title", content: "Danh sách phiếu thu — X.E" },
      {
        property: "og:description",
        content: "Danh sách phiếu thu theo văn phòng kèm bộ lọc và xuất Excel.",
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

const VN_TZ = "Asia/Ho_Chi_Minh";

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

/** Hoàn tác chỉ trong cùng ngày xác nhận (giờ VN); sau 0h không còn được. */
function canUnconfirm(r: ReceiptRec): boolean {
  if (!r.confirmedAt) return false;
  const t = Date.parse(r.confirmedAt);
  if (!Number.isFinite(t)) return false;
  const dayOf = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: VN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  return dayOf(t) === dayOf(Date.now());
}

function ConfirmCell({
  receipt,
  canConfirm,
  busy,
  onConfirm,
  onUnconfirm,
}: {
  receipt: ReceiptRec;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const confirmed = !!receipt.confirmedAt;
  const undoOk = canUnconfirm(receipt);

  if (confirmed) {
    return (
      <div className="flex min-w-[200px] flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800">
          <CheckCircle2 className="h-3 w-3 shrink-0 opacity-80" />
          Đã thu
        </span>
        <div className="text-[11px] leading-snug text-muted-foreground">
          {receipt.confirmedBy ?? "—"}
          <span className="mx-1 opacity-50">·</span>
          {receipt.confirmedAt ? fmtDateTime(receipt.confirmedAt) : "—"}
        </div>
        {canConfirm && undoOk ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "h-8 w-full justify-center gap-1.5 border-amber-400 bg-amber-50 font-medium text-amber-900",
              "hover:border-amber-500 hover:bg-amber-100 hover:text-amber-950",
              busy && "opacity-70",
            )}
            disabled={busy}
            onClick={onUnconfirm}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {busy ? "Đang hoàn tác…" : "Hoàn tác"}
          </Button>
        ) : canConfirm && !undoOk ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-muted bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Quá ngày — không hoàn tác
          </span>
        ) : null}
      </div>
    );
  }

  if (!canConfirm) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Chưa thu
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      className={cn(
        "h-9 min-w-[148px] gap-1.5 rounded-md bg-emerald-600 px-3 font-semibold text-white shadow-sm",
        "hover:bg-emerald-700",
        busy && "opacity-70",
      )}
      disabled={busy}
      onClick={onConfirm}
    >
      <CheckCircle2 className="h-4 w-4" />
      {busy ? "Đang xác nhận…" : "Xác nhận thu"}
    </Button>
  );
}

function Page() {
  const { session } = useAuth();
  const receipts = useStore((s) => s.receipts);
  const confirmReceipt = useStore((s) => s.confirmReceipt);
  const unconfirmReceipt = useStore((s) => s.unconfirmReceipt);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const viewOffice = resolveViewOffice(session, viewOfficeRaw);
  const officeScope = assignedOfficeCode(viewOffice);
  const canConfirm = session?.role === "AD" || session?.role === "KT";

  const [code, setCode] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [creator, setCreator] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) return;
    void syncFinanceFromApi().catch(() => undefined);
  }, [viewOffice]);

  const rows = useMemo(() => {
    return receipts.filter((r) => {
      if (officeScope) {
        const recOffice = (r.office ?? "").trim().toUpperCase();
        if (recOffice && recOffice !== officeScope.toUpperCase()) return false;
        if (!recOffice) return false;
      }
      if (code && !r.code.toLowerCase().includes(code.trim().toLowerCase())) return false;
      if (staffCode && !(r.payerCode ?? r.payer).toLowerCase().includes(staffCode.trim().toLowerCase()))
        return false;
      if (creator && !r.createdBy.toLowerCase().includes(creator.trim().toLowerCase())) return false;
      const day = r.createdAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [receipts, officeScope, code, staffCode, creator, from, to]);

  const total = rows.reduce((a, r) => a + r.total, 0);

  const onConfirm = async (receiptCode: string) => {
    if (!canConfirm || busyRef.current) return;
    busyRef.current = receiptCode;
    setBusyCode(receiptCode);
    try {
      const res = await confirmReceipt(receiptCode);
      if (res.ok) toast.success(`Đã xác nhận thu ${receiptCode}`);
      else toast.error(res.error);
    } finally {
      busyRef.current = null;
      setBusyCode(null);
    }
  };

  const onUnconfirm = async (receiptCode: string) => {
    if (!canConfirm || busyRef.current) return;
    busyRef.current = receiptCode;
    setBusyCode(receiptCode);
    try {
      const res = await unconfirmReceipt(receiptCode);
      if (res.ok) toast.success(`Đã hoàn tác xác nhận ${receiptCode}`);
      else toast.error(res.error);
    } finally {
      busyRef.current = null;
      setBusyCode(null);
    }
  };

  const exportExcel = () => {
    downloadCSV(
      `danh-sach-phieu-thu-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        [
          "STT",
          "Mã phiếu thu",
          "Văn phòng",
          "CB điều phối (người lập)",
          "Người nộp tiền",
          "Thời gian lập",
          "Tổng tiền",
          "Đã xác nhận",
          "Người xác nhận",
          "Thời gian xác nhận",
        ],
        ...rows.map((r, i) => [
          i + 1,
          r.code,
          r.office ? officeName(r.office) : "",
          r.createdBy,
          r.payer,
          fmtDateTime(r.createdAt),
          r.total,
          r.confirmedAt ? "Có" : "Không",
          r.confirmedBy ?? "",
          r.confirmedAt ? fmtDateTime(r.confirmedAt) : "",
        ]),
      ],
    );
  };

  const scopeHint =
    officeScope
      ? `Theo văn phòng ${officeName(officeScope)} — hiển thị phiếu thu của mọi CB điều phối cùng VP.`
      : viewOffice === VIEW_ALL_OFFICES
        ? "Đang xem toàn hệ thống — chọn VP trên thanh điều hướng để lọc theo văn phòng."
        : "Chưa xác định văn phòng.";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{scopeHint}</p>

      <Section>
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
            <Label className="text-xs">CB điều phối (người lập)</Label>
            <Input
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              placeholder="Tài khoản lập phiếu"
            />
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
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="w-14 px-2 py-2">STT</th>
                  <th className="px-2 py-2">Mã phiếu thu</th>
                  <th className="px-2 py-2">Văn phòng</th>
                  <th className="px-2 py-2">CB điều phối (người lập)</th>
                  <th className="px-2 py-2">Người nộp tiền</th>
                  <th className="px-2 py-2">Thời gian lập</th>
                  <th className="px-2 py-2 text-right">Tổng tiền</th>
                  <th className="px-2 py-2 min-w-[240px]">Trạng thái thu</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.code} className="border-b hover:bg-muted/40">
                    <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2 font-medium">{r.code}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {r.office ? officeName(r.office) : "—"}
                    </td>
                    <td className="px-2 py-2">{r.createdBy}</td>
                    <td className="px-2 py-2">{r.payer}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(r.createdAt)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">{formatVND(r.total)}</td>
                    <td className="px-2 py-2">
                      <ConfirmCell
                        receipt={r}
                        canConfirm={canConfirm}
                        busy={busyCode === r.code}
                        onConfirm={() => void onConfirm(r.code)}
                        onUnconfirm={() => void onUnconfirm(r.code)}
                      />
                    </td>
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
