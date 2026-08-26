import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStore, DEFAULT_SURCHARGES, DEFAULT_COD_TIERS, type SurchargeConfig, type DoorFeeRule, type CodFeeTier } from "@/lib/store";
import { formatVND } from "@/lib/mock-data";
import { MoneyInput } from "@/components/MoneyInput";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/phu-phi")({
  head: () => ({
    meta: [
      { title: "Cài đặt phụ phí — X.E" },
      { name: "description", content: "Thiết lập các loại phụ phí: giao tận nơi, thu hộ COD, ship giao lại, bảo hiểm hàng hóa, hoàn đơn." },
      { property: "og:title", content: "Cài đặt phụ phí — X.E" },
      { property: "og:description", content: "Thiết lập các loại phụ phí áp dụng cho đơn hàng." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Cài đặt phụ phí" screen="phu-phi">
      <Page />
    </ProtectedPage>
  ),
});

/** Ô nhập số có hậu tố đơn vị */
function NumBox({
  value,
  onChange,
  suffix,
  disabled,
  className = "w-40",
  money = false,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  disabled?: boolean;
  className?: string;
  /** Format #.###.### khi là ô tiền VNĐ */
  money?: boolean;
}) {
  const isMoney = money || suffix === "VNĐ";
  if (isMoney) {
    return (
      <MoneyInput
        value={value}
        onChange={onChange}
        suffix={suffix}
        disabled={disabled}
        className={className}
      />
    );
  }
  return (
    <div className={`relative ${className}`}>
      <Input
        inputMode="decimal"
        disabled={disabled}
        className="h-9 pr-12 text-right"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}

function Row({
  index,
  label,
  enabled,
  onToggle,
  hint,
  children,
}: {
  index: number;
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">
          {index}. {label}
        </span>
        <Switch checked={enabled} onCheckedChange={onToggle} />
        {!enabled && hint && <span className="text-xs italic text-muted-foreground">{hint}</span>}
      </div>
      {enabled && children && <div className="mt-3 space-y-3 pl-4">{children}</div>}
    </div>
  );
}

function CodTiersEditor({
  tiers,
  onChange,
}: {
  tiers: CodFeeTier[];
  onChange: (tiers: CodFeeTier[]) => void;
}) {
  const rows = tiers.length ? tiers : DEFAULT_COD_TIERS;

  const patchAt = (idx: number, patch: Partial<CodFeeTier>) => {
    const next = rows.map((t, i) => (i === idx ? { ...t, ...patch } : { ...t }));
    // Giữ chuỗi bậc liền nhau: Đến mức i = Trên mức i+1
    if (patch.maxAmount != null && idx + 1 < next.length) {
      next[idx + 1] = { ...next[idx + 1], minAmount: Number(patch.maxAmount) || 0 };
    }
    if (patch.minAmount != null && idx > 0) {
      next[idx - 1] = { ...next[idx - 1], maxAmount: Number(patch.minAmount) || 0 };
    }
    onChange(next);
  };

  const addFixedBeforeLast = () => {
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2] ?? rows[0];
    const min = Number(prev?.maxAmount ?? prev?.minAmount ?? 0);
    const mid = min + 5_000_000;
    const fixed: CodFeeTier = {
      minAmount: min,
      maxAmount: mid,
      feeAmount: 0,
      feePercent: null,
    };
    const open: CodFeeTier = {
      minAmount: mid,
      maxAmount: null,
      feeAmount: null,
      feePercent: last?.feePercent ?? 1,
    };
    const body = rows.slice(0, -1);
    if (body.length) body[body.length - 1] = { ...body[body.length - 1], maxAmount: min };
    onChange([...body, fixed, open]);
  };

  const removeAt = (idx: number) => {
    if (rows.length <= 2) {
      toast.error("Cần ít nhất 1 bậc cố định và 1 bậc %");
      return;
    }
    if (idx === rows.length - 1) {
      toast.error("Không xoá bậc % cuối — sửa % hoặc thêm bậc cố định phía trên");
      return;
    }
    const next = rows.filter((_, i) => i !== idx);
    if (idx > 0 && next[idx]) {
      next[idx] = { ...next[idx], minAmount: next[idx - 1].maxAmount ?? next[idx].minAmount };
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {rows.map((t, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === rows.length - 1;
        const isPercent = isLast || (t.feePercent != null && t.feeAmount == null);
        return (
          <div
            key={idx}
            className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 px-3 py-3"
          >
            <div className="w-16 shrink-0 pb-2 text-sm font-medium">Mức {idx + 1}</div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{isFirst ? "Từ" : "Trên"}</div>
              <MoneyInput
                className="w-40"
                value={t.minAmount}
                onChange={(v) => patchAt(idx, { minAmount: v })}
                disabled={isFirst}
              />
            </div>
            {!isPercent && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Đến</div>
                <MoneyInput
                  className="w-40"
                  value={t.maxAmount ?? 0}
                  onChange={(v) => patchAt(idx, { maxAmount: v })}
                />
              </div>
            )}
            {isPercent ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Phí thu hộ (%)</div>
                <NumBox
                  className="w-28"
                  value={t.feePercent ?? 0}
                  onChange={(v) => patchAt(idx, { feePercent: v, feeAmount: null, maxAmount: null })}
                  suffix="%"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Phí thu hộ (VNĐ)</div>
                <MoneyInput
                  className="w-40"
                  value={t.feeAmount ?? 0}
                  onChange={(v) => patchAt(idx, { feeAmount: v, feePercent: null })}
                />
              </div>
            )}
            {!isFirst && !isLast && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="mb-0.5 h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removeAt(idx)}
                title="Xoá mức"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addFixedBeforeLast}>
        <Plus className="h-4 w-4" /> Thêm mức cố định
      </Button>
      <p className="text-xs text-muted-foreground">
        Mức 1 gồm biên trên (vd 2.000.000 thuộc mức 1). Từ mức 2 trở đi là{" "}
        <strong>trên</strong> mức dưới — đúng bằng biên dưới thuộc mức trước. Mức cuối không có
        &quot;Đến&quot;: phí = % × tiền thu hộ.
      </p>
    </div>
  );
}

function Page() {
  const raw = useStore((s) => s.surcharges);
  const saved: SurchargeConfig = {
    ...DEFAULT_SURCHARGES,
    ...(raw ?? {}),
    cod: {
      ...DEFAULT_SURCHARGES.cod,
      ...(raw?.cod ?? {}),
      tiers: raw?.cod?.tiers?.length ? raw.cod.tiers : DEFAULT_COD_TIERS.map((t) => ({ ...t })),
    },
  };
  const setSurcharges = useStore((s) => s.setSurcharges);
  const [f, setF] = useState<SurchargeConfig>(saved);

  const patch = <K extends keyof SurchargeConfig>(k: K, v: Partial<SurchargeConfig[K]>) =>
    setF((s) => ({ ...s, [k]: { ...(s[k] as object), ...v } }) as SurchargeConfig);

  return (
    <div className="space-y-4">
      <Section title="Danh sách phụ phí">
        <div className="rounded-md border px-4">
          <Row
            index={1}
            label="Phí lấy / giao hàng tận nơi"
            enabled={f.homeDelivery.enabled}
            onToggle={(v) => patch("homeDelivery", { enabled: v })}
            hint="Không thu phí !"
          >
            <p className="text-xs text-muted-foreground">
              Tính theo bảng phí riêng bên dưới (khoảng cân × khoảng cách). Mức mặc định khi không khớp
              dòng nào:
            </p>
            <div className="flex items-center gap-3">
              <NumBox
                value={f.homeDelivery.amount}
                onChange={(v) => patch("homeDelivery", { amount: v })}
                suffix="VNĐ"
              />
              <span className="text-sm text-muted-foreground">/ đơn</span>
            </div>
          </Row>

          <Row
            index={2}
            label="Phí thu hộ COD"
            enabled={f.cod.enabled}
            onToggle={(v) => patch("cod", { enabled: v })}
            hint="Không thu phí !"
          >
            <CodTiersEditor
              tiers={f.cod.tiers?.length ? f.cod.tiers : DEFAULT_COD_TIERS}
              onChange={(tiers) => {
                const last = tiers[tiers.length - 1];
                patch("cod", {
                  tiers,
                  percent: last?.feePercent ?? f.cod.percent,
                });
              }}
            />
          </Row>

          <Row
            index={3}
            label="Phí tồn kho tại kho giao"
            enabled={f.storage.enabled}
            onToggle={(v) => patch("storage", { enabled: v })}
            hint="Không thu phí !"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Miễn phí</span>
              <NumBox
                value={f.storage.freeDays}
                onChange={(v) => patch("storage", { freeDays: v })}
                suffix="ngày"
                className="w-28"
              />
              <span className="text-muted-foreground">kể từ ngày hàng đến kho giao, sau đó thu</span>
              <NumBox
                value={f.storage.feePerDay}
                onChange={(v) => patch("storage", { feePerDay: v })}
                suffix="VNĐ"
              />
              <span>/ ngày</span>
            </div>
          </Row>


          <Row
            index={4}
            label="Hàng hoá khai báo giá trị"
            enabled={f.insurance.enabled}
            onToggle={(v) => patch("insurance", { enabled: v })}
            hint="Kèm hoá đơn, chứng từ thể hiện giá trị khai báo"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-40 text-muted-foreground">Giá trị khai báo dưới</span>
              <NumBox
                value={f.insurance.threshold}
                onChange={(v) => patch("insurance", { threshold: v })}
                suffix="VNĐ"
              />
              <span>= thu</span>
              <NumBox
                value={f.insurance.percentUnder}
                onChange={(v) => patch("insurance", { percentUnder: v })}
                suffix="%"
                className="w-24"
              />
              <span>× giá trị khai báo</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-40 text-muted-foreground">Giá trị khai báo trên</span>
              <span className="text-muted-foreground">{formatVND(f.insurance.threshold)} = thu</span>
              <NumBox
                value={f.insurance.percentOver}
                onChange={(v) => patch("insurance", { percentOver: v })}
                suffix="%"
                className="w-24"
              />
              <span>× giá trị khai báo</span>
            </div>
          </Row>


          <Row
            index={5}
            label="Phí hoàn đơn"
            enabled={f.refund.enabled}
            onToggle={(v) => patch("refund", { enabled: v })}
            hint="Không thu phí !"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <NumBox
                value={f.refund.percent}
                onChange={(v) => patch("refund", { percent: v })}
                suffix="%"
                className="w-28"
              />
              <span>× Phí vận chuyển</span>
            </div>
          </Row>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          {saved.updatedAt && (
            <span className="mr-auto text-xs text-muted-foreground">
              Cập nhật lần cuối: {new Date(saved.updatedAt).toLocaleString("vi-VN")}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setF(DEFAULT_SURCHARGES)}>
            Khôi phục mặc định
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSurcharges(f);
              toast.success("Đã lưu cài đặt phụ phí");
            }}
          >
            Lưu cài đặt
          </Button>
        </div>
      </Section>

      <DoorFeeTable />

    </div>
  );
}

/** Bảng phí lấy / giao hàng tận nơi theo khoảng cân × khoảng cách */
function DoorFeeTable() {
  const doorFees = useStore((s) => s.doorFees) ?? [];
  const setDoorFees = useStore((s) => s.setDoorFees);
  const [kind, setKind] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const rows = doorFees.filter((r) => r.kind === kind);

  const patchRow = (id: string, p: Partial<DoorFeeRule>) =>
    setDoorFees(doorFees.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const addRow = () =>
    setDoorFees([
      ...doorFees,
      { id: `${kind}-${Date.now()}`, kind, minKg: 0, maxKg: 5, minKm: 0, maxKm: 3, fee: 20000 },
    ]);

  return (
    <Section title="Bảng phí lấy / giao hàng tận nơi">
      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" variant={kind === "PICKUP" ? "default" : "outline"} onClick={() => setKind("PICKUP")}>
          Lấy tận nơi
        </Button>
        <Button size="sm" variant={kind === "DELIVERY" ? "default" : "outline"} onClick={() => setKind("DELIVERY")}>
          Giao tận nơi
        </Button>
        <Button size="sm" variant="outline" className="ml-auto" onClick={addRow}>
          Thêm dòng
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Khoảng cân (kg)</th>
              <th className="px-3 py-2">Khoảng cách (km)</th>
              <th className="px-3 py-2">Phí (VNĐ)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <NumBox value={r.minKg} onChange={(v) => patchRow(r.id, { minKg: v })} suffix="KG" className="w-28" />
                    <span className="text-muted-foreground">→</span>
                    <NumBox value={r.maxKg} onChange={(v) => patchRow(r.id, { maxKg: v })} suffix="KG" className="w-28" />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <NumBox value={r.minKm} onChange={(v) => patchRow(r.id, { minKm: v })} suffix="km" className="w-28" />
                    <span className="text-muted-foreground">→</span>
                    <NumBox value={r.maxKm} onChange={(v) => patchRow(r.id, { maxKm: v })} suffix="km" className="w-28" />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <NumBox value={r.fee} onChange={(v) => patchRow(r.id, { fee: v })} suffix="VNĐ" />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDoorFees(doorFees.filter((x) => x.id !== r.id))}
                  >
                    Xóa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Hệ thống chọn dòng có khoảng cân và khoảng cách khớp với đơn hàng; nếu không khớp sẽ dùng mức mặc
        định ở mục 1.
      </p>
    </Section>
  );
}
