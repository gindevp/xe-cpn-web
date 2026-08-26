import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatVND } from "@/lib/mock-data";
import { MoneyInput } from "@/components/MoneyInput";
import { useStore, type PricingRule, type ProductPriceRule } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { hasOverageConfig } from "@/lib/pricing";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bang-gia")({
  head: () => ({ meta: [{ title: "Bảng giá — X.E" }] }),
  component: () => (
    <ProtectedPage title="Quản lý bảng giá" screen="bang-gia">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const products = useStore((s) => s.productPricing);
  const writable = canWrite(session?.role, "bang-gia");

  return (
    <Section title="Bảng giá">
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Phí vận chuyển</TabsTrigger>
          <TabsTrigger value="product">Giá theo sản phẩm ({products.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <FreightPricing writable={writable} />
        </TabsContent>
        <TabsContent value="product" className="mt-4">
          <ProductPricing writable={writable} />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

const parseDec = (raw: string) => {
  const n = Number(String(raw).replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmtKg = (kg: number) =>
  Number(kg ?? 0).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
/** UI nhập KG thập phân; BE lưu stepGram (gram). */
const toStepGram = (kg: number) => Math.max(0, Math.round((kg ?? 0) * 1000));
const fromStepGram = (g: number) => (g ?? 0) / 1000;

type BandDraft = {
  minKg: number;
  maxKg: number;
  unit: number;
  stepKg: number;
  addFee: number;
};

function FreightPricing({ writable }: { writable: boolean }) {
  const rules = useStore((s) => s.pricingRules);
  const storeRoutes = useStore((s) => s.routes);
  const { branchNames } = useBranchItineraryMaster();
  const tuyenOptions = branchNames.length ? branchNames : storeRoutes;
  const upsert = useStore((s) => s.upsertPricing);
  const remove = useStore((s) => s.removePricing);
  const [tuyen, setTuyen] = useState(tuyenOptions[0] ?? "");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [draft, setDraft] = useState<BandDraft>({ minKg: 0, maxKg: 3, unit: 0, stepKg: 0, addFee: 0 });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PricingRule | null>(null);

  useEffect(() => {
    if (!tuyen && tuyenOptions[0]) setTuyen(tuyenOptions[0]);
    else if (tuyen && tuyenOptions.length && !tuyenOptions.includes(tuyen)) setTuyen(tuyenOptions[0] ?? "");
  }, [tuyen, tuyenOptions]);

  const rows = rules
    .filter((r) => r.route === tuyen)
    .slice()
    .sort((a, b) => a.minKg - b.minKg);

  const last = rows[rows.length - 1];
  const overageLocked = hasOverageConfig(last);

  const openAdd = () => {
    if (!tuyen) {
      toast.error("Vui lòng chọn tuyến");
      return;
    }
    if (overageLocked) {
      toast.error("Đang dùng Tăng thêm / Cộng thêm. Xóa hai trường đó ở mức cuối trước khi thêm khoảng giá.");
      return;
    }
    setEditing(null);
    setDraft({
      minKg: last ? last.maxKg : 0,
      maxKg: last ? Number((last.maxKg + 2).toFixed(3)) : 3,
      unit: 0,
      stepKg: 0,
      addFee: 0,
    });
    setFormOpen(true);
  };

  const openEdit = (r: PricingRule) => {
    setEditing(r);
    setDraft({
      minKg: r.minKg,
      maxKg: r.maxKg,
      unit: r.unit,
      stepKg: fromStepGram(r.stepG ?? 0),
      addFee: r.addFee ?? 0,
    });
    setFormOpen(true);
  };

  const isLastRow = (r: PricingRule | null) => !!r && last?.id === r.id;
  const allowOverage = !editing || isLastRow(editing);

  const confirmSave = async () => {
    if (draft.maxKg <= draft.minKg) {
      toast.error("Số cân tối đa phải lớn hơn tối thiểu");
      return;
    }
    if (!allowOverage && (draft.stepKg > 0 || draft.addFee > 0)) {
      toast.error("Chỉ mức cuối mới được set Tăng thêm / Cộng thêm");
      return;
    }
    const stepG = allowOverage ? toStepGram(draft.stepKg) : 0;
    const addFee = allowOverage ? Math.round(draft.addFee) : 0;
    const payload: PricingRule = {
      id: editing?.id ?? "PR-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      route: tuyen,
      tier: `${draft.minKg}-${draft.maxKg} KG`,
      minKg: draft.minKg,
      maxKg: draft.maxKg,
      unit: Math.round(draft.unit),
      surcharge: editing?.surcharge ?? 0,
      dimDivisor: editing?.dimDivisor ?? 6000,
      effectiveFrom: editing?.effectiveFrom ?? new Date().toISOString(),
      kmMin: editing?.kmMin ?? 2,
      kmRate: editing?.kmRate ?? 5000,
      stepG,
      addFee,
    };
    setSaving(true);
    try {
      await upsert(payload);
      toast.success(editing ? "Đã lưu mức cước trên server" : "Đã thêm mức cước trên server");
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Không lưu được phí vận chuyển lên server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Tuyến</span>
        <SearchableSelect
          value={tuyen}
          onValueChange={setTuyen}
          className="h-9 w-56"
          placeholder="Chọn tuyến"
          options={tuyenOptions.map((r) => ({ value: r, label: r }))}
        />
        {writable && (
          <Button size="sm" variant="outline" className="gap-1" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Thêm mức
          </Button>
        )}
        {!writable && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Chế độ chỉ xem</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-14 text-center">TT</th>
              <th className="px-3 py-2 text-right">Cân tối thiểu (KG)</th>
              <th className="px-3 py-2 text-right">Cân tối đa (KG)</th>
              <th className="px-3 py-2 text-right">Phí TC (VNĐ)</th>
              <th className="px-3 py-2 text-right">Tăng thêm (KG)</th>
              <th className="px-3 py-2 text-right">Cộng thêm (VNĐ)</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có mức cước cho tuyến này
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 text-right">{fmtKg(r.minKg)}</td>
                <td className="px-3 py-2 text-right">{fmtKg(r.maxKg)}</td>
                <td className="px-3 py-2 text-right">{formatVND(r.unit)}</td>
                <td className="px-3 py-2 text-right">{fmtKg(fromStepGram(r.stepG ?? 0))}</td>
                <td className="px-3 py-2 text-right">{formatVND(r.addFee ?? 0)}</td>
                <td className="px-3 py-2 text-right">
                  {writable && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Một bảng giá cho tuyến, dùng cả hai chiều. Khoảng cân là (tối thiểu, tối đa] — ví dụ tối thiểu 3 KG nghĩa là cân{" "}
        <strong>lớn hơn 3 KG</strong>. Phí TC là giá cố định trong khoảng (VNĐ). Vượt max mức cuối: tiền = Phí TC + (cân −
        max) × Cộng thêm; nếu có Tăng thêm (KG) thì số bước = làm tròn lên (KG vượt / Tăng thêm) × Cộng thêm. Đang set
        tăng thêm thì không thêm khoảng giá khác.
      </p>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa mức cước" : "Thêm mức cước"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cân tối thiểu (KG)</Label>
              <Input
                inputMode="decimal"
                step="0.001"
                value={String(draft.minKg)}
                onChange={(e) => setDraft((d) => ({ ...d, minKg: parseDec(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Cân tối đa (KG)</Label>
              <Input
                inputMode="decimal"
                step="0.001"
                value={String(draft.maxKg)}
                onChange={(e) => setDraft((d) => ({ ...d, maxKg: parseDec(e.target.value) }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Phí TC (VNĐ)</Label>
              <MoneyInput value={draft.unit} onChange={(unit) => setDraft((d) => ({ ...d, unit }))} />
            </div>
            {allowOverage && (
              <>
                <div className="space-y-1">
                  <Label>Tăng thêm (KG)</Label>
                  <Input
                    inputMode="decimal"
                    step="0.001"
                    value={String(draft.stepKg)}
                    onChange={(e) => setDraft((d) => ({ ...d, stepKg: parseDec(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cộng thêm (VNĐ)</Label>
                  <MoneyInput value={draft.addFee} onChange={(addFee) => setDraft((d) => ({ ...d, addFee }))} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button onClick={confirmSave} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa mức cước?</AlertDialogTitle>
            <AlertDialogDescription>Mức này sẽ bị xóa khỏi bảng giá tuyến {tuyen}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                try {
                  await remove(deleteTarget.id);
                  toast.success("Đã xoá mức cước trên server");
                  setDeleteTarget(null);
                } catch (err: any) {
                  toast.error(err?.message ?? "Không xóa được trên server");
                }
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductPricing({ writable }: { writable: boolean }) {
  const products = useStore((s) => s.productPricing);
  const upsert = useStore((s) => s.upsertProductPrice);
  const remove = useStore((s) => s.removeProductPrice);
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductPriceRule | null>(null);
  const [group, setGroup] = useState("Khác");
  const [name, setName] = useState("");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [price, setPrice] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ProductPriceRule | null>(null);

  const list = products.filter(
    (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.group.toLowerCase().includes(q.toLowerCase()),
  );
  const groups = Array.from(new Set(list.map((p) => p.group)));

  const openAdd = () => {
    setEditing(null);
    setGroup("Khác");
    setName("");
    setCurrentPrice(0);
    setPrice(0);
    setFormOpen(true);
  };

  const openEdit = (p: ProductPriceRule) => {
    setEditing(p);
    setGroup(p.group);
    setName(p.name);
    setCurrentPrice(p.currentPrice);
    setPrice(p.price);
    setFormOpen(true);
  };

  const confirmSave = () => {
    if (!name.trim()) {
      toast.error("Nhập tên hàng hóa");
      return;
    }
    upsert({
      id: editing?.id ?? "PP-" + Date.now(),
      group: group.trim() || "Khác",
      name: name.trim(),
      currentPrice,
      price,
    });
    toast.success(editing ? "Đã lưu giá sản phẩm" : "Đã thêm giá sản phẩm");
    setFormOpen(false);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="h-9 w-64" placeholder="Tìm nhóm hàng / tên hàng hóa" value={q} onChange={(e) => setQ(e.target.value)} />
        {writable && (
          <Button size="sm" className="ml-auto" onClick={openAdd}>
            Thêm dòng
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-12">STT</th>
              <th className="px-3 py-2 w-48">Nhóm hàng</th>
              <th className="px-3 py-2">Tên hàng hóa</th>
              <th className="px-3 py-2 text-right w-36">Giá hiện tại</th>
              <th className="px-3 py-2 text-right w-40">Giá áp dụng</th>
              <th className="px-3 py-2 text-right w-24">% giảm</th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const rows = list.filter((p) => p.group === g);
              return rows.map((p, i) => {
                const pct = p.currentPrice ? ((p.price - p.currentPrice) / p.currentPrice) * 100 : 0;
                return (
                  <tr key={p.id} className="border-t align-middle">
                    {i === 0 && (
                      <td className="px-3 py-2 text-muted-foreground" rowSpan={rows.length}>
                        {gi + 1}
                      </td>
                    )}
                    {i === 0 && (
                      <td className="px-3 py-2 font-medium align-top" rowSpan={rows.length}>
                        {g}
                      </td>
                    )}
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatVND(p.currentPrice)}</td>
                    <td className="px-3 py-2 text-right">{formatVND(p.price)}</td>
                    <td className={`px-3 py-2 text-right ${pct < 0 ? "text-emerald-600" : pct > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {pct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right">
                      {writable && (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)}>
                            Xóa
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tab này chưa áp vào giá lúc tạo đơn hàng. Cước đơn đang lấy từ tab Phí vận chuyển theo tuyến.
      </p>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa giá sản phẩm" : "Thêm giá sản phẩm"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Nhóm hàng</Label>
              <Input value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Tên hàng hóa</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Giá hiện tại</Label>
                <MoneyInput value={currentPrice} onChange={setCurrentPrice} />
              </div>
              <div className="space-y-1">
                <Label>Giá áp dụng</Label>
                <MoneyInput value={price} onChange={setPrice} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button onClick={confirmSave}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa giá sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) remove(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
