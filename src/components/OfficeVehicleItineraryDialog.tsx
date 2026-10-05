import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getOfficeVehicleItineraries,
  saveOfficeVehicleItineraries,
  type OfficeVehicleItineraryConfig,
} from "@/lib/api/vehicle-events-api";

const MAX_OFFSET = 720;

/** Lộ trình áp dụng của VP (báo giờ xe trên app + trang khách tạo đơn); không tích gì = mọi lộ trình qua điểm VP. */
export function OfficeVehicleItineraryDialog({
  officeId,
  officeName,
  writable,
  onClose,
}: {
  officeId: number;
  officeName: string;
  writable: boolean;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<OfficeVehicleItineraryConfig | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offsets, setOffsets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOfficeVehicleItineraries(officeId)
      .then((r) => {
        setCfg(r);
        setSelected(new Set(r.options.filter((o) => o.selected).map((o) => o.code)));
        setOffsets(
          Object.fromEntries(
            r.options.filter((o) => o.offsetMinutes != null).map((o) => [o.code, String(o.offsetMinutes)]),
          ),
        );
      })
      .catch((e: any) => toast.error(e?.message || "Không tải được lộ trình"));
  }, [officeId]);

  const toggle = (code: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      const codes = cfg.options.filter((o) => selected.has(o.code)).map((o) => o.code);
      const offsetList: { code: string; offsetMinutes: number }[] = [];
      for (const c of codes) {
        const raw = (offsets[c] ?? "").trim();
        if (!raw) continue;
        if (!/^[+-]?\d+$/.test(raw) || Math.abs(Number(raw)) > MAX_OFFSET) {
          const name = cfg.options.find((o) => o.code === c)?.name ?? c;
          toast.error(`Phút lệch của "${name}" phải là số nguyên trong khoảng ±${MAX_OFFSET} (vd -120 hoặc 30)`);
          return;
        }
        if (Number(raw) !== 0) offsetList.push({ code: c, offsetMinutes: Number(raw) });
      }
      await saveOfficeVehicleItineraries(officeId, codes, offsetList);
      toast.success(codes.length ? `Đã lưu ${codes.length} lộ trình áp dụng` : "Đã bỏ giới hạn — áp dụng mọi lộ trình qua điểm VP");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lộ trình áp dụng — {officeName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tích các lộ trình có xe dừng ở văn phòng này. Áp dụng cho màn{" "}
          <b>Báo cáo giờ xe đến/đi</b> trên app và trang <b>khách tự tạo đơn</b> (khách gửi từ VP này chỉ chọn được VP
          nhận nằm trên các lộ trình xuất phát được tích). Không tích lộ trình nào thì áp dụng mọi lộ trình có điểm đầu hoặc cuối là điểm của VP.
        </p>
        <p className="text-sm text-muted-foreground">
          Ô <b>phút</b> cạnh lộ trình đã tích là giờ đón khách tại VP lệch so với giờ xuất bến của xe: <b>-120</b> = sớm 120
          phút, <b>30</b> = muộn 30 phút, để trống = đúng giờ xuất bến. Giờ đón này hiển thị là "Xuất bến" trên app và
          "Xuất bến KH" ở báo cáo giờ xe.
        </p>

        <div className="mt-2 max-h-[420px] overflow-y-auto rounded-md border">
          {!cfg ? (
            <div className="p-3 text-sm text-muted-foreground">Đang tải…</div>
          ) : cfg.options.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              Chưa có lộ trình nào đi qua điểm của VP — kiểm tra điểm lộ trình của VP.
            </div>
          ) : (
            cfg.options.map((o) => (
              <label key={o.code} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0">
                <Checkbox
                  checked={selected.has(o.code)}
                  disabled={!writable}
                  onCheckedChange={(v) => toggle(o.code, v === true)}
                />
                <span className="flex-1 text-sm">{o.name}</span>
                {selected.has(o.code) && (
                  <span className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                    <Input
                      value={offsets[o.code] ?? ""}
                      disabled={!writable}
                      inputMode="numeric"
                      placeholder="0"
                      title="Phút lệch giờ đón so với giờ xuất bến: -120 = sớm 120 phút, 30 = muộn 30 phút"
                      className="h-8 w-20 text-right"
                      onChange={(e) => setOffsets((prev) => ({ ...prev, [o.code]: e.target.value.replace(/[^\d+-]/g, "") }))}
                    />
                    <span className="text-xs text-muted-foreground">phút</span>
                  </span>
                )}
              </label>
            ))
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {cfg ? (selected.size ? `Đã chọn ${selected.size}/${cfg.options.length}` : "Chưa giới hạn") : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
            {writable && (
              <Button onClick={() => void save()} disabled={busy || !cfg}>
                Lưu
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
