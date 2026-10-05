import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createShipper,
  deactivateShipper,
  listShippers,
  updateShipper,
  type ShipperDTO,
} from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import type { OfficeRec } from "@/lib/mock-data";

type Form = { id?: number; fullName: string; phone: string; officeCode: string; note: string; active: boolean };

const EMPTY: Form = { fullName: "", phone: "", officeCode: "", note: "", active: true };

/** Danh mục → Shipper: shipper nội bộ theo VP nhận, dùng ở popup Gán Shipper. */
export function ShipperMasterTab({
  offices,
  writable,
  onCount,
}: {
  offices: OfficeRec[];
  writable: boolean;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<ShipperDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [officeFilter, setOfficeFilter] = useState("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!isApiEnabled()) return;
    setLoading(true);
    try {
      const data = await listShippers({ includeInactive: true });
      setRows(data);
      onCount?.(data.filter((s) => s.active !== false).length);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách shipper");
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () =>
      rows.filter(
        (s) =>
          (showInactive || s.active !== false) &&
          (officeFilter === "ALL" || s.officeCode === officeFilter),
      ),
    [rows, officeFilter, showInactive],
  );

  const save = async () => {
    if (!form) return;
    if (!form.fullName.trim()) return toast.error("Nhập tên shipper");
    if (!form.officeCode) return toast.error("Chọn VP");
    setSaving(true);
    try {
      const body = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        officeCode: form.officeCode,
        note: form.note.trim() || undefined,
        active: form.active,
      };
      if (form.id != null) await updateShipper(form.id, body);
      else await createShipper(body);
      toast.success(form.id != null ? "Đã cập nhật shipper" : "Đã thêm shipper");
      setForm(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được shipper");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (s: ShipperDTO) => {
    if (!confirm(`Ngừng hoạt động shipper ${s.fullName}? Đơn cũ vẫn giữ tên shipper.`)) return;
    try {
      await deactivateShipper(s.id);
      toast.success(`Đã ngừng ${s.fullName}`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Không cập nhật được shipper");
    }
  };

  if (!isApiEnabled()) {
    return <p className="text-sm text-muted-foreground">Cần kết nối máy chủ để quản lý shipper.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {writable && <Button onClick={() => setForm({ ...EMPTY })}>Thêm shipper</Button>}
        <Select value={officeFilter} onValueChange={setOfficeFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả VP</SelectItem>
            {offices.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.name || o.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Hiện shipper đã ngừng
        </label>
        {loading ? <span className="text-xs text-muted-foreground">Đang tải…</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4">Shipper</th>
              <th className="py-2 pr-4">SĐT</th>
              <th className="py-2 pr-4">VP</th>
              <th className="py-2 pr-4">Đang giao</th>
              <th className="py-2 pr-4">Ghi chú</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Chưa có shipper
                </td>
              </tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id} className={`border-b last:border-0 ${s.active === false ? "opacity-50" : ""}`}>
                  <td className="py-2 pr-4 font-medium">
                    {s.fullName}
                    {s.active === false ? <span className="ml-2 text-xs text-muted-foreground">(ngừng)</span> : null}
                  </td>
                  <td className="py-2 pr-4">{s.phone || "—"}</td>
                  <td className="py-2 pr-4">{s.officeName || s.officeCode}</td>
                  <td className="py-2 pr-4 tabular-nums">{s.busyCount ?? 0}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{s.note || ""}</td>
                  <td className="py-2 pr-4">
                    {writable && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm({
                              id: s.id,
                              fullName: s.fullName,
                              phone: s.phone ?? "",
                              officeCode: s.officeCode ?? "",
                              note: s.note ?? "",
                              active: s.active !== false,
                            })
                          }
                        >
                          Sửa
                        </Button>
                        {s.active !== false && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void deactivate(s)}>
                            Ngừng
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={form != null} onOpenChange={(v) => !v && !saving && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id != null ? "Sửa shipper" : "Thêm shipper"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Họ tên</Label>
                <Input
                  value={form.fullName}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại</Label>
                <Input value={form.phone} maxLength={20} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>VP giao hàng</Label>
                <Select value={form.officeCode} onValueChange={(v) => setForm({ ...form, officeCode: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn VP" />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o.code} value={o.code}>
                        {o.name || o.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ghi chú</Label>
                <Input value={form.note} maxLength={255} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              {form.id != null && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Đang hoạt động
                </label>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>
              Hủy
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
