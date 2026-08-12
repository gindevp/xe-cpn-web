import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatVND } from "@/lib/mock-data";
import { useStore, type PricingRule } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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

const G = (kg: number) => Math.round((kg ?? 0) * 1000);
const toKg = (g: number) => (g ?? 0) / 1000;
const K = (v: number) => (v ?? 0) / 1000;
const toVnd = (k: number) => (k ?? 0) * 1000;

function FreightPricing({ writable }: { writable: boolean }) {
  const rules = useStore((s) => s.pricingRules);
  const routes = useStore((s) => s.routes);
  const upsert = useStore((s) => s.upsertPricing);
  const remove = useStore((s) => s.removePricing);
  const [route, setRoute] = useState(routes[0] ?? "");

  const rows = rules
    .filter((r) => r.route === route)
    .slice()
    .sort((a, b) => a.minKg - b.minKg);

  const patch = (r: PricingRule, p: Partial<PricingRule>) =>
    upsert({ ...r, ...p, tier: `${p.minKg ?? r.minKg}-${p.maxKg ?? r.maxKg}kg` });

  const addRow = () => {
    const last = rows[rows.length - 1];
    upsert({
      id: "PR-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      route,
      tier: "0-0kg",
      minKg: last ? last.maxKg : 0,
      maxKg: last ? last.maxKg + 2 : 3,
      unit: 0,
      surcharge: 0,
      dimDivisor: 6000,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      kmMin: 2,
      kmRate: 5000,
      stepG: 0,
      addFee: 0,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Tuyến</span>
        <Select value={route} onValueChange={setRoute}>
          <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Chọn tuyến" /></SelectTrigger>
          <SelectContent>{routes.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
        </Select>
        {writable && (
          <Button size="sm" variant="outline" className="gap-1" onClick={addRow}>
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
              <th className="px-3 py-2 text-right">Số cân tối thiểu (G)</th>
              <th className="px-3 py-2 text-right">Số cân tối đa (G)</th>
              <th className="px-3 py-2 text-right">Phí TC (Nghìn VNĐ)</th>
              <th className="px-3 py-2 text-right">Tăng thêm (G)</th>
              <th className="px-3 py-2 text-right">Cộng thêm (Nghìn VNĐ)</th>
              <th className="px-3 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Chưa có mức cước cho tuyến này</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                <NumCell value={G(r.minKg)} writable={writable} onChange={(v) => patch(r, { minKg: toKg(v) })} />
                <NumCell value={G(r.maxKg)} writable={writable} onChange={(v) => patch(r, { maxKg: toKg(v) })} />
                <NumCell value={K(r.unit)} writable={writable} onChange={(v) => patch(r, { unit: toVnd(v) })} />
                <NumCell value={r.stepG ?? 0} writable={writable} onChange={(v) => patch(r, { stepG: v })} />
                <NumCell value={K(r.addFee ?? 0)} writable={writable} onChange={(v) => patch(r, { addFee: toVnd(v) })} />
                <td className="px-3 py-2 text-right">
                  {writable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => { remove(r.id); toast.success("Đã xoá mức cước"); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Cân nặng nhập theo gram, phí nhập theo nghìn VNĐ. Vượt mức cân tối đa sẽ tính thêm theo bước
        “Tăng thêm (G)” × “Cộng thêm”.
      </p>
    </div>
  );
}

function NumCell({ value, writable, onChange }: { value: number; writable: boolean; onChange: (v: number) => void }) {
  return (
    <td className="px-3 py-2 text-right">
      {writable ? (
        <Input
          className="h-8 w-full text-right"
          inputMode="numeric"
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
        />
      ) : (
        value.toLocaleString("vi-VN")
      )}
    </td>
  );
}

function ProductPricing({ writable }: { writable: boolean }) {
  const products = useStore((s) => s.productPricing);
  const upsert = useStore((s) => s.upsertProductPrice);
  const remove = useStore((s) => s.removeProductPrice);
  const [q, setQ] = useState("");

  const list = products.filter(
    (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.group.toLowerCase().includes(q.toLowerCase()),
  );
  const groups = Array.from(new Set(list.map((p) => p.group)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="h-9 w-64" placeholder="Tìm nhóm hàng / tên hàng hóa" value={q} onChange={(e) => setQ(e.target.value)} />
        {writable && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() =>
              upsert({ id: "PP-" + Date.now(), group: "Khác", name: "Hàng hóa mới", currentPrice: 0, price: 0 })
            }
          >
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
              <th className="px-3 py-2 w-16"></th>

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
                        {writable ? (
                          <Input
                            className="h-8"
                            value={g}
                            onChange={(e) => {
                              const next = e.target.value;
                              rows.forEach((row) => upsert({ ...row, group: next }));
                            }}
                          />
                        ) : (
                          g
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {writable ? (
                        <Input
                          className="h-8"
                          value={p.name}
                          onChange={(e) => upsert({ ...p, name: e.target.value })}
                        />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatVND(p.currentPrice)}</td>
                    <td className="px-3 py-2 text-right">
                      {writable ? (
                        <Input
                          className="h-8 w-full text-right"
                          inputMode="numeric"
                          value={String(p.price)}
                          onChange={(e) => upsert({ ...p, price: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
                        />
                      ) : (
                        formatVND(p.price)
                      )}
                    </td>

                    <td className={`px-3 py-2 text-right ${pct < 0 ? "text-emerald-600" : pct > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {pct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right">
                      {writable && (
                        <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                          Xóa
                        </Button>
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
        Giá đặc thù theo sản phẩm được ưu tiên áp dụng thay cho bảng giá theo cân nặng khi đơn hàng thuộc
        nhóm hàng tương ứng.
      </p>
    </div>
  );
}
