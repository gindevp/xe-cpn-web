import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { isApiEnabled } from "@/lib/api/client";

export const Route = createFileRoute("/ton-kho")({
  head: () => ({
    meta: [
      { title: "Tồn kho — X.E" },
      {
        name: "description",
        content: "Theo dõi tồn kho theo bưu cục và số giờ tồn: lấy, giao, trả, tồn luân chuyển.",
      },
      { property: "og:title", content: "Tồn kho — X.E" },
      { property: "og:description", content: "Bảng tồn kho theo bưu cục và khung giờ tồn kho." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Tồn kho" screen="ton-kho">
      <Page />
    </ProtectedPage>
  ),
});

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "00 - 06", min: 0, max: 6 },
  { label: "06 - 12", min: 6, max: 12 },
  { label: "12 - 24", min: 12, max: 24 },
  { label: "24 - 36", min: 24, max: 36 },
  { label: "36 - 48", min: 36, max: 48 },
  { label: "48 - 72", min: 48, max: 72 },
  { label: "72 - 96", min: 72, max: 96 },
  { label: "96 - 120", min: 96, max: 120 },
  { label: "120 - 192", min: 120, max: 192 },
  { label: "192+", min: 192, max: Infinity },
];

const KINDS = [
  { key: "LAY", label: "Lấy" },
  { key: "GIAO", label: "Giao" },
  { key: "TRA", label: "Trả" },
  { key: "TON_LC_GIAO", label: "Tồn luân chuyển giao" },
  { key: "TON_LC_TRA", label: "Tồn luân chuyển trả" },
] as const;

type KindKey = (typeof KINDS)[number]["key"];

function classify(o: any): { kind: KindKey; office: string } | null {
  const rs = o.returnStage as string | undefined;
  if (rs) {
    if (rs === "RETURN_PENDING" || rs === "RT_DELIVERING" || rs === "RT_ORIGIN_WH_IN")
      return { kind: "TRA", office: o.fromOffice };
    return { kind: "TON_LC_TRA", office: o.toOffice ?? o.fromOffice };
  }
  const st = o.stage as string | undefined;
  if (!st) {
    if (o.homePickup && !o.pickedUpAt) return { kind: "LAY", office: o.fromOffice };
    return null;
  }
  if (st === "PICKED") return { kind: "LAY", office: o.fromOffice };
  if (st === "WH_IN" || st === "TRANSFER_PENDING" || st === "TRANSFERRING")
    return { kind: "TON_LC_GIAO", office: o.fromOffice };
  if (st === "DEST_WH_IN" || st === "DELIVERING" || st === "FAILED")
    return { kind: "GIAO", office: o.toOffice };
  return null;
}

function hoursAged(o: any) {
  const base = o.updatedAt ?? o.createdAt;
  return (Date.now() - new Date(base).getTime()) / 3600000;
}

// Dữ liệu minh hoạ (dùng khi chưa có đơn thật) — sinh tất định theo mã bưu cục
function demoRows(code: string): Record<KindKey, number[]> {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) % 100000;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const gen = (peak: number, scale: number) =>
    BUCKETS.map((_, i) => {
      const decay = Math.exp(-Math.abs(i - peak) / 1.6);
      const v = Math.round(rnd() * scale * decay);
      return v;
    });
  return {
    LAY: gen(1, 26),
    GIAO: gen(2, 34),
    TRA: gen(4, 9),
    TON_LC_GIAO: gen(3, 18),
    TON_LC_TRA: gen(5, 7),
  };
}

function Page() {
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const [office, setOffice] = useState("ALL");
  const [tick, setTick] = useState(0);

  const data = useMemo(() => {
    void tick;
    const map = new Map<string, Record<KindKey, number[]>>();
    const ensure = (code: string) => {
      let row = map.get(code);
      if (!row) {
        row = {
          LAY: BUCKETS.map(() => 0),
          GIAO: BUCKETS.map(() => 0),
          TRA: BUCKETS.map(() => 0),
          TON_LC_GIAO: BUCKETS.map(() => 0),
          TON_LC_TRA: BUCKETS.map(() => 0),
        };
        map.set(code, row);
      }
      return row;
    };
    orders.forEach((o) => {
      const c = classify(o);
      if (!c || !c.office) return;
      if (office !== "ALL" && c.office !== office) return;
      const h = hoursAged(o);
      const idx = BUCKETS.findIndex((b) => h >= b.min && h < b.max);
      if (idx < 0) return;
      ensure(c.office)[c.kind][idx] += 1;
    });
    const codes = office === "ALL" ? offices.map((o) => o.code) : [office];
    const useDemo = !isApiEnabled();
    return codes.map((c) => {
      const real = map.get(c);
      const demo = useDemo ? demoRows(c) : {
        LAY: BUCKETS.map(() => 0),
        GIAO: BUCKETS.map(() => 0),
        TRA: BUCKETS.map(() => 0),
        TON_LC_GIAO: BUCKETS.map(() => 0),
        TON_LC_TRA: BUCKETS.map(() => 0),
      };
      const rows = (Object.keys(demo) as KindKey[]).reduce((acc, k) => {
        acc[k] = demo[k].map((v, i) => v + (real?.[k][i] ?? 0));
        return acc;
      }, {} as Record<KindKey, number[]>);
      return {
        code: c,
        name: offices.find((o) => o.code === c)?.name ?? c,
        rows,
      };
    });
  }, [orders, offices, office, tick]);

  const exportExcel = () => {
    const head = ["Bưu cục", "Loại", "Tổng", ...BUCKETS.map((b) => b.label)];
    const body: (string | number)[][] = [];
    data.forEach((g) => {
      KINDS.forEach((k) => {
        const cells = g.rows[k.key];
        body.push([
          `${g.code} - ${g.name}`,
          k.label,
          cells.reduce((a, b) => a + b, 0),
          ...cells,
        ]);
      });
    });
    downloadCSV(`ton-kho-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...body]);
  };

  return (
    <div className="space-y-4">
      <Section title="Bộ lọc">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label className="text-xs">Chọn kho</Label>
            <Select value={office} onValueChange={setOffice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả kho</SelectItem>
                {offices.map((o) => (
                  <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setTick((t) => t + 1);
                toast.success("Đã cập nhật dữ liệu");
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Cập nhật dữ liệu
            </Button>
            <Button size="sm" className="gap-2" onClick={exportExcel} disabled={data.length === 0}>
              <Download className="h-4 w-4" />
              Xuất Excel
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Bảng tồn kho theo số giờ đã tồn">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 w-56">Bưu cục</th>
                <th className="px-3 py-2 w-56">Loại</th>
                {BUCKETS.map((b) => (
                  <th key={b.label} className="px-3 py-2 text-right whitespace-nowrap">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={2 + BUCKETS.length} className="px-3 py-8 text-center text-muted-foreground">
                    Không có dữ liệu tồn kho
                  </td>
                </tr>
              ) : (
                data.map((g) => (
                  KINDS.map((k, i) => {
                    const cells = g.rows[k.key];
                    const total = cells.reduce((a, b) => a + b, 0);
                    return (
                      <tr key={g.code + k.key} className={`border-b ${i === KINDS.length - 1 ? "border-b-2" : ""}`}>
                        {i === 0 && (
                          <td rowSpan={KINDS.length} className="px-3 py-2 align-middle font-medium border-r">
                            {g.code} – {g.name}
                          </td>
                        )}
                        <td className="px-3 py-2 font-medium text-primary">{k.label} ({total})</td>
                        {cells.map((v, ci) => (
                          <td key={ci} className="px-3 py-2 text-right tabular-nums">
                            {v === 0 ? <span className="text-muted-foreground">-</span> : <span className="font-semibold text-primary">{v}</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
