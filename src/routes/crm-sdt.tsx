import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { EmptyState, Section } from "@/components/PageBits";
import { TablePagination } from "@/components/TablePagination";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listBuyerDirectory, type BuyerDirectoryEntry } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { formatDateTime } from "@/lib/mock-data";
import { usePagedRows } from "@/lib/use-paged-rows";
import { Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/crm-sdt")({
  head: () => ({
    meta: [
      { title: "CRM SĐT — MST — X.E" },
      {
        name: "description",
        content: "Số điện thoại và các MST doanh nghiệp đã xuất hóa đơn gắn với số đó.",
      },
    ],
  }),
  component: () => (
    <ProtectedPage title="CRM SĐT — MST" screen="crm-sdt">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [rows, setRows] = useState<BuyerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { pageRows, pager } = usePagedRows(rows, "crm-sdt");

  const load = useCallback(async (query: string) => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(await listBuyerDirectory(query));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách SĐT");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  return (
    <div className="space-y-4">
      <Section title="Tìm số điện thoại">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = q.trim();
            setApplied(next);
            void load(next);
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Số điện thoại</Label>
            <Input
              value={q}
              inputMode="tel"
              placeholder="Để trống để xem các số vừa xuất hóa đơn"
              className="w-72"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            <Search className="mr-1 h-4 w-4" />
            {loading ? "Đang tải…" : "Tìm"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Mỗi MST lấy từ hóa đơn doanh nghiệp đã xuất, khi số này là người gửi hoặc người nhận. MST xuất gần
          nhất đứng đầu. Tạo đơn chỉ tự điền MST của người trả tiền.
          {applied ? ` Đang lọc ${applied}.` : " Đang xem các số trên hóa đơn mới nhất."}
        </p>
      </Section>

      <Section title={`SĐT và MST (${rows.length})`}>
        {pager.total === 0 ? (
          <EmptyState>{loading ? "Đang tải…" : "Không có số nào đã xuất hóa đơn doanh nghiệp"}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Số điện thoại</th>
                  <th className="px-2 py-2">Tên</th>
                  <th className="px-2 py-2">MST đã xuất</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.phone} className="border-b align-top">
                    <td className="px-2 py-2 font-mono font-medium">{row.phone}</td>
                    <td className="px-2 py-2">{row.name || "—"}</td>
                    <td className="px-2 py-2">
                      <div className="space-y-2">
                        {(row.profiles ?? []).map((p, i) => (
                          <div key={p.taxCode} className="leading-tight">
                            <div className="font-mono font-semibold">
                              {i === 0 ? "Gần nhất · " : ""}
                              {p.taxCode}
                            </div>
                            <div>{p.companyName || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.fromOrderCode ? <OrderCodeLink code={p.fromOrderCode} /> : null}
                              {p.issuedAt ? ` · ${formatDateTime(p.issuedAt)}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination pager={pager} />
          </div>
        )}
      </Section>
    </div>
  );
}
