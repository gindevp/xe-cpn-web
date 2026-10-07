import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { EmptyState, Section } from "@/components/PageBits";
import { TablePagination } from "@/components/TablePagination";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { TaxCodeInput } from "@/components/TaxCodeInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createPhoneTax,
  deletePhoneTax,
  listBuyerDirectory,
  updatePhoneTax,
  type BuyerDirectoryEntry,
  type InvoiceBuyerProfile,
} from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/mock-data";
import { canWrite } from "@/lib/rbac";
import { usePagedRows } from "@/lib/use-paged-rows";
import { Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/crm-sdt")({
  head: () => ({
    meta: [
      { title: "CRM SĐT — MST — X.E" },
      {
        name: "description",
        content: "Gắn, sửa, xóa MST theo số điện thoại. Mỗi số tối đa 5 MST.",
      },
    ],
  }),
  component: () => (
    <ProtectedPage title="CRM SĐT — MST" screen="crm-sdt">
      <Page />
    </ProtectedPage>
  ),
});

type Draft = {
  id?: string;
  phone: string;
  contactName: string;
  taxCode: string;
  companyName: string;
  address: string;
  email: string;
};

const emptyDraft = (phone = ""): Draft => ({
  phone,
  contactName: "",
  taxCode: "",
  companyName: "",
  address: "",
  email: "",
});

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "crm-sdt");
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [rows, setRows] = useState<BuyerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
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

  const openCreate = (phone: string, contactName = "") => {
    setDraft({ ...emptyDraft(phone), contactName });
  };

  const openEdit = (phone: string, contactName: string, profile: InvoiceBuyerProfile) => {
    setDraft({
      id: profile.id,
      phone,
      contactName: contactName || "",
      taxCode: profile.taxCode ?? "",
      companyName: profile.companyName ?? "",
      address: profile.address ?? "",
      email: profile.email ?? "",
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.companyName.trim()) {
      toast.error("Tra MST để lấy tên công ty trước khi lưu");
      return;
    }
    setSaving(true);
    try {
      const body = {
        phone: draft.phone,
        taxCode: draft.taxCode,
        companyName: draft.companyName,
        address: draft.address,
        email: draft.email,
        contactName: draft.contactName,
      };
      if (draft.id) await updatePhoneTax(draft.id, body);
      else await createPhoneTax(body);
      toast.success(draft.id ? "Đã sửa MST" : "Đã gắn MST");
      setDraft(null);
      const next = draft.phone || applied;
      setQ(next);
      setApplied(next);
      await load(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được MST");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (profile: InvoiceBuyerProfile) => {
    if (!profile.id) return;
    if (!window.confirm(`Gỡ MST ${profile.taxCode} khỏi số này?`)) return;
    try {
      await deletePhoneTax(profile.id);
      toast.success("Đã gỡ MST");
      await load(applied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gỡ được MST");
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Tìm số điện thoại">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = q.trim();
            setApplied(next);
            setDraft(null);
            void load(next);
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Số điện thoại</Label>
            <Input
              value={q}
              inputMode="tel"
              placeholder="Để trống để xem các số vừa cập nhật"
              className="w-72"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            <Search className="mr-1 h-4 w-4" />
            {loading ? "Đang tải…" : "Tìm"}
          </Button>
          {writable ? (
            <Button type="button" variant="outline" onClick={() => openCreate(applied)}>
              Thêm MST
            </Button>
          ) : null}
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          MST chỉ gắn với SĐT người trả cước: gửi trả, công nợ và chia tỉ lệ là người gửi; nhận trả và COD là
          người nhận. Mỗi số tối đa 5 MST. MST gần nhất được tự điền khi tạo đơn.
          {applied ? ` Đang lọc ${applied}.` : " Đang xem các số vừa cập nhật."}
        </p>
      </Section>

      {draft ? (
        <Section title={draft.id ? "Sửa MST" : "Gắn MST"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Số điện thoại</Label>
              <Input
                value={draft.phone}
                inputMode="tel"
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên người liên hệ</Label>
              <Input
                value={draft.contactName}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">MST</Label>
              <TaxCodeInput
                value={draft.taxCode}
                onChange={(taxCode) => setDraft((d) => (d ? { ...d, taxCode, companyName: "", address: "" } : d))}
                onFound={(info) =>
                  setDraft((d) => (d ? { ...d, companyName: info.companyName, address: info.address } : d))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên công ty</Label>
              <Input value={draft.companyName} readOnly placeholder="Tự điền sau khi tra MST" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Địa chỉ</Label>
              <Input value={draft.address} readOnly />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email nhận hóa đơn</Label>
              <Input
                value={draft.email}
                inputMode="email"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>
              Huỷ
            </Button>
          </div>
        </Section>
      ) : null}

      <Section title={`SĐT và MST (${rows.length})`}>
        {pager.total === 0 ? (
          <EmptyState>
            {loading
              ? "Đang tải…"
              : applied
                ? "Số này chưa gắn MST"
                : "Chưa có số nào gắn MST"}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2">Số điện thoại</th>
                  <th className="px-2 py-2">Tên</th>
                  <th className="px-2 py-2">MST đang gắn</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const profiles = row.profiles ?? [];
                  return (
                    <tr key={row.phone} className="border-b align-top">
                      <td className="px-2 py-2 font-mono font-medium">{row.phone}</td>
                      <td className="px-2 py-2">{row.name || "—"}</td>
                      <td className="px-2 py-2">
                        <div className="space-y-2">
                          {profiles.map((p, i) => (
                            <div key={p.id ?? p.taxCode} className="leading-tight">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-semibold">
                                  {i === 0 ? "Gần nhất · " : ""}
                                  {p.taxCode}
                                </span>
                                {writable ? (
                                  <>
                                    <button
                                      type="button"
                                      className="text-xs text-sky-700 hover:underline"
                                      onClick={() => openEdit(row.phone, row.name ?? "", p)}
                                    >
                                      Sửa
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs text-red-600 hover:underline"
                                      onClick={() => void remove(p)}
                                    >
                                      Xóa
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              <div>{p.companyName || "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.fromOrderCode ? <OrderCodeLink code={p.fromOrderCode} /> : "Gắn tay"}
                                {p.issuedAt ? ` · ${formatDateTime(p.issuedAt)}` : ""}
                              </div>
                            </div>
                          ))}
                          {writable && profiles.length < 5 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openCreate(row.phone, row.name ?? "")}
                            >
                              Thêm MST ({profiles.length}/5)
                            </Button>
                          ) : profiles.length >= 5 ? (
                            <p className="text-xs text-muted-foreground">Đã đủ 5 MST</p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination pager={pager} />
          </div>
        )}
      </Section>
    </div>
  );
}
