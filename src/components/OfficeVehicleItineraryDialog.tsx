import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getOfficeVehicleItineraries,
  saveOfficeVehicleItineraries,
  type OfficeVehicleItineraryConfig,
} from "@/lib/api/vehicle-events-api";

/** Lộ trình VP báo giờ xe đến/đi — app chỉ hiện các lộ trình được tích; không tích gì thì hiện mọi lộ trình qua điểm VP. */
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOfficeVehicleItineraries(officeId)
      .then((r) => {
        setCfg(r);
        setSelected(new Set(r.options.filter((o) => o.selected).map((o) => o.code)));
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
      await saveOfficeVehicleItineraries(officeId, codes);
      toast.success(codes.length ? `Đã lưu ${codes.length} lộ trình báo giờ` : "Đã bỏ giới hạn — hiện mọi lộ trình qua điểm VP");
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
          <DialogTitle>Lộ trình báo giờ xe — {officeName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tích các lộ trình có xe dừng ở văn phòng này. Màn <b>Báo cáo giờ xe đến/đi</b> trên app chỉ hiện các lộ trình
          được tích. Không tích lộ trình nào thì hiện mọi lộ trình có điểm đầu hoặc cuối là điểm của VP.
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
