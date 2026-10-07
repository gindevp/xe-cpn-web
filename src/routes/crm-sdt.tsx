import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { EmptyState, Section } from "@/components/PageBits";
import { TablePagination } from "@/components/TablePagination";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { PhoneInput } from "@/components/PhoneInput";
import { TaxCodeInput } from "@/components/TaxCodeInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  /** Số lấy từ dòng đang chọn — không sửa trong popup. */
  phoneLocked: boolean;
  phone: string;
  contactName: string;
  taxCode: string;
  companyName: string;
  address: string;
  email: string;
  /** MST đã gắn của số này, để khỏi thêm trùng. */
  existingTaxes: string[];
};

const emptyDraft = (phone = "", locked = false): Draft => ({
  phoneLocked: locked && phone.trim().length > 0,
  phone,
  contactName: "",
  taxCode: "",
  companyName: "",
  address: "",
  email: "",
  existingTaxes: [],
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

  const taxesOf = (phone: string) =>
    rows.find((r) => r.phone === phone)?.profiles?.map((p) => p.taxCode ?? "").filter(Boolean) ?? [];

  const openCreate = (phone: string, contactName = "", locked = false) => {
    setDraft({
      ...emptyDraft(phone, locked),
      contactName,
      existingTaxes: taxesOf(phone),
    });
  };

  const openEdit = (phone: string, contactName: string, profile: InvoiceBuyerProfile) => {
    setDraft({
      id: profile.id,
      phoneLocked: true,
      phone,
      contactName: contactName || "",
      taxCode: profile.taxCode ?? "",
      companyName: profile.companyName ?? "",
      address: profile.address ?? "",
      email: profile.email ?? "",
      existingTaxes: taxesOf(phone).filter((t) => t !== profile.taxCode),
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
      await load(applied);
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const hit = rows.find((r) => digits(r.phone) === digits(applied));
                if (hit && (hit.profiles?.length ?? 0) >= 5) {
                  toast.error("Số này đã đủ 5 MST. Xóa bớt rồi thêm.");
                  return;
                }
                openCreate(applied, hit?.name ?? "", Boolean(applied.trim()));
              }}
            >
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

      <PhoneTaxDialog
        draft={draft}
        rows={rows}
        saving={saving}
        onChange={setDraft}
        onClose={() => {
          if (!saving) setDraft(null);
        }}
        onSave={() => void save()}
      />

      <Section title={`SĐT và MST (${rows.length})`}>
        {pager.total === 0 ? (
          <EmptyState>
            {loading ? (
              "Đang tải…"
            ) : applied ? (
              <span className="inline-flex flex-col items-center gap-2">
                <span>Số {applied} chưa gắn MST</span>
                {writable ? (
                  <Button type="button" size="sm" onClick={() => openCreate(applied, "", true)}>
                    Gắn MST cho số này
                  </Button>
                ) : null}
              </span>
            ) : (
              "Chưa có số nào gắn MST"
            )}
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
                              onClick={() => openCreate(row.phone, row.name ?? "", true)}
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

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

function PhoneTaxDialog({
  draft,
  rows,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft | null;
  rows: BuyerDirectoryEntry[];
  saving: boolean;
  onChange: Dispatch<SetStateAction<Draft | null>>;
  onClose: () => void;
  onSave: () => void;
}) {
  const known = draft
    ? rows.find((r) => digits(r.phone) === digits(draft.phone) && digits(draft.phone).length >= 9)
    : undefined;
  const compact = (s: string) => s.replace(/\D/g, "");
  const taken = (known?.profiles ?? [])
    .map((p) => p.taxCode ?? "")
    .filter((t) => t && compact(t) !== compact(draft?.taxCode ?? ""));
  const duplicate = Boolean(
    draft?.taxCode &&
      (known?.profiles ?? []).some((p) => compact(p.taxCode ?? "") === compact(draft.taxCode) && p.id !== draft.id),
  );
  const slots = known?.profiles?.length ?? 0;

  return (
    <Dialog open={draft != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        {draft ? (
          <>
            <DialogHeader>
              <DialogTitle>{draft.id ? "Sửa MST" : "Gắn MST"}</DialogTitle>
              <DialogDescription>
                {draft.phoneLocked
                  ? `Số ${draft.phone} đang có ${slots}/5 MST. Nhập MST, hệ thống tự điền tên công ty.`
                  : "Nhập số điện thoại trước, rồi nhập MST để tra tên công ty. Mỗi số tối đa 5 MST."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {draft.phoneLocked ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <div className="text-[11px] uppercase text-muted-foreground">Số điện thoại</div>
                  <div className="font-mono text-base font-semibold">{draft.phone}</div>
                  {draft.contactName ? <div className="text-xs text-muted-foreground">{draft.contactName}</div> : null}
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Số điện thoại</Label>
                  <PhoneInput
                    value={draft.phone}
                    autoFocus
                    onChange={(phone) => onChange((d) => (d ? { ...d, phone } : d))}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">MST</Label>
                <TaxCodeInput
                  value={draft.taxCode}
                  onChange={(taxCode) =>
                    onChange((d) => (d ? { ...d, taxCode, companyName: "", address: "" } : d))
                  }
                  onFound={(info) =>
                    onChange((d) => (d ? { ...d, companyName: info.companyName, address: info.address } : d))
                  }
                />
                {duplicate ? (
                  <p className="text-xs text-red-600">Số này đã gắn MST {draft.taxCode}.</p>
                ) : null}
                {taken.length > 0 ? (
                  <p className="text-xs text-muted-foreground">Đã gắn: {taken.join(", ")}</p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tên công ty</Label>
                <Input value={draft.companyName} readOnly placeholder="Hiện sau khi tra được MST" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Địa chỉ</Label>
                <Input value={draft.address} readOnly placeholder="Hiện sau khi tra được MST" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email nhận hóa đơn</Label>
                <Input
                  value={draft.email}
                  inputMode="email"
                  placeholder="Không bắt buộc"
                  onChange={(e) => onChange((d) => (d ? { ...d, email: e.target.value } : d))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Huỷ
              </Button>
              <Button
                type="button"
                disabled={saving || duplicate || !draft.phone.trim() || !draft.companyName.trim()}
                onClick={onSave}
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
