import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { StageTabButton, StageTabRow } from "@/components/StageTabs";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TonKhoPanel } from "./ton-kho";
import { CountButton, OrderListDialog, type OrderListRow } from "@/components/OrderListDialog";

export const Route = createFileRoute("/bao-cao-gio")({
  head: () => ({
    meta: [
      { title: "Báo cáo theo giờ — X.E" },
      {
        name: "description",
        content:
          "Báo cáo số lượng đơn lấy, đơn giao - trả và đơn luân chuyển theo từng khung giờ trong ngày; kèm bảng tồn kho.",
      },
      { property: "og:title", content: "Báo cáo theo giờ — X.E" },
      {
        property: "og:description",
        content: "Thống kê đơn lấy, giao - trả, luân chuyển theo giờ và tồn kho theo bưu cục.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo cáo theo giờ" screen="bao-cao-gio">
      <Page />
    </ProtectedPage>
  ),
});

type MainTab = "GIO" | "TON";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const KINDS = [
  { key: "LAY", label: "Đơn lấy", hint: "Tính từ lúc tạo đơn thành công" },
  { key: "GIAO_TRA", label: "Đơn giao - trả", hint: "Tính từ khi nhập kho" },
  { key: "LUAN_CHUYEN", label: "Đơn luân chuyển", hint: "Tính từ lúc scan để đợi luân chuyển" },
] as const;

type KindKey = (typeof KINDS)[number]["key"];

// Mốc thời gian tính báo cáo cho từng loại
function pointsOf(o: any): { kind: KindKey; at: string; office: string }[] {
  const out: { kind: KindKey; at: string; office: string }[] = [];
  if (o.status !== "DRAFT" && o.createdAt)
    out.push({ kind: "LAY", at: o.createdAt, office: o.fromOffice });
  const wh = ["WH_IN", "DEST_WH_IN", "DELIVERING", "FAILED"].includes(o.stage) ||
    ["RT_WH_IN", "RT_DELIVERING", "RT_FAILED", "RT_DONE"].includes(o.returnStage);
  if (wh)
    out.push({
      kind: "GIAO_TRA",
      at: o.warehouseInAt ?? o.updatedAt,
      office: o.returnStage ? o.fromOffice : (o.toOffice ?? o.fromOffice),
    });
  const lc =
    ["TRANSFER_PENDING", "TRANSFERRING", "DEST_WH_IN"].includes(o.stage) ||
    ["RT_TRANSFER_PENDING", "RT_TRANSFERRING"].includes(o.returnStage);
  if (lc)
    out.push({
      kind: "LUAN_CHUYEN",
      at: o.transferScanAt ?? o.updatedAt,
      office: o.fromOffice,
    });
  return out;
}

function BaoCaoGioPanel() {
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const [office, setOffice] = useState("ALL");
  const [tick, setTick] = useState(0);

  const [detail, setDetail] = useState<{ title: string; rows: OrderListRow[] } | null>(null);

  const { data, lists } = useMemo(() => {
    void tick;
    const lists = KINDS.reduce((acc, k) => {
      acc[k.key] = HOURS.map(() => [] as OrderListRow[]);
      return acc;
    }, {} as Record<KindKey, OrderListRow[][]>);

    orders.forEach((o: any) => {
      pointsOf(o).forEach((p) => {
        if (!p.at) return;
        if (office !== "ALL" && p.office !== office) return;
        const h = new Date(p.at).getHours();
        if (Number.isNaN(h)) return;
        lists[p.kind][h].push({ order: o, at: p.at });
      });
    });
    const data = KINDS.reduce((acc, k) => {
      acc[k.key] = lists[k.key].map((l) => l.length);
      return acc;
    }, {} as Record<KindKey, number[]>);
    return { data, lists };
  }, [orders, offices, office, tick]);

  const openCell = (kind: (typeof KINDS)[number], hour?: number) => {
    const rows =
      hour === undefined ? lists[kind.key].flat() : lists[kind.key][hour];
    const sorted = [...rows].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    const officeLabel = office === "ALL" ? "Tất cả kho" : offices.find((o) => o.code === office)?.name ?? office;
    setDetail({
      title: `${kind.label} · ${hour === undefined ? "cả ngày" : `${String(hour).padStart(2, "0")}h`} · ${officeLabel}`,
      rows: sorted,
    });
  };

  const max = Math.max(1, ...KINDS.flatMap((k) => data[k.key]));

  const exportExcel = () => {
    downloadCSV(
      `bao-cao-don-theo-gio-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ["Loại", "Tổng", ...HOURS.map((h) => `${String(h).padStart(2, "0")}h`)],
        ...KINDS.map((k) => [
          k.label,
          data[k.key].reduce((a, b) => a + b, 0),
          ...data[k.key],
        ]),
      ],
    );
  };

  return (
    <>
      <Section>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label className="text-xs">Chọn kho</Label>
            <SearchableSelect
              value={office}
              onValueChange={setOffice}
              options={[
                { value: "ALL", label: "Tất cả kho" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
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
              <RefreshCw className="h-4 w-4" /> Cập nhật dữ liệu
            </Button>
            <Button size="sm" className="gap-2" onClick={exportExcel}>
              <Download className="h-4 w-4" /> Xuất Excel
            </Button>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        {KINDS.map((k) => {
          const total = data[k.key].reduce((a, b) => a + b, 0);
          return (
            <Section key={k.key} title={k.label}>
              <div className="text-2xl font-semibold tabular-nums">{total}</div>
              <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
            </Section>
          );
        })}
      </div>

      {KINDS.map((k) => (
        <Section key={k.key} title={`${k.label} theo khung giờ`}>
          <div className="flex h-48 items-end gap-1">
            {HOURS.map((h) => {
              const v = data[k.key][h];
              return (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted-foreground">{v || ""}</span>
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${(v / max) * 140}px` }}
                    title={`${String(h).padStart(2, "0")}h: ${v} đơn`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {String(h).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      <Section title="Bảng chi tiết theo giờ">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 w-48">Loại</th>
                <th className="px-3 py-2 text-right">Tổng</th>
                {HOURS.map((h) => (
                  <th key={h} className="px-2 py-2 text-right">{String(h).padStart(2, "0")}h</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KINDS.map((k) => (
                <tr key={k.key} className="border-b">
                  <td className="px-3 py-2 font-medium text-primary">{k.label}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    <CountButton value={data[k.key].reduce((a, b) => a + b, 0)} onClick={() => openCell(k)} />
                  </td>
                  {data[k.key].map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums">
                      <CountButton value={v} onClick={() => openCell(k, i)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <OrderListDialog
        title={detail?.title ?? ""}
        timeLabel="Mốc tính giờ"
        rows={detail?.rows ?? null}
        onClose={() => setDetail(null)}
      />
    </>
  );
}

function Page() {
  const [tab, setTab] = useState<MainTab>("GIO");

  return (
    <div className="space-y-4">
      <StageTabRow className="gap-2.5 md:gap-3">
        <StageTabButton active={tab === "GIO"} onClick={() => setTab("GIO")}>
          Báo cáo theo giờ
        </StageTabButton>
        <StageTabButton active={tab === "TON"} onClick={() => setTab("TON")}>
          Tồn kho
        </StageTabButton>
      </StageTabRow>
      {tab === "GIO" ? <BaoCaoGioPanel /> : <TonKhoPanel />}
    </div>
  );
}
