import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NameInput } from "@/components/NameInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore, type VehicleRec } from "@/lib/store";
import { toast } from "sonner";
import { isValidVnPlate, normalizePlate } from "@/lib/vehicle-plate";

/** Giống form «Xe tải» ở màn gán xe. */
export const TAI_TRONG_OPTIONS = [
  "1.5 tấn",
  "2.5 tấn",
  "5 tấn",
  "8 tấn",
  "10 tấn",
  "15 tấn",
];

export function truckTypeFromTaiTrong(taiTrong: string): { vehicleType: string; capacity: number } {
  const n = Number.parseFloat(taiTrong.replace(",", "."));
  const tons = Number.isFinite(n) ? n : 5;
  return {
    vehicleType: `Xe tải ${taiTrong}`,
    capacity: Math.round(tons * 1000),
  };
}

function taiTrongFromVehicle(v?: VehicleRec | null): string {
  if (!v) return "";
  const tons = v.capacity > 0 ? v.capacity / 1000 : 0;
  const fromType = (v.vehicleType ?? "").match(/([\d.,]+)\s*ton/i)?.[1];
  const label =
    TAI_TRONG_OPTIONS.find((o) => Math.abs(Number.parseFloat(o) - tons) < 0.01) ??
    (fromType
      ? TAI_TRONG_OPTIONS.find((o) => Math.abs(Number.parseFloat(o) - Number.parseFloat(fromType.replace(",", "."))) < 0.01)
      : undefined) ??
    (tons > 0 ? `${tons} tấn` : "");
  return label;
}

export function VehicleFormDialog({
  mode,
  initial,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: VehicleRec;
  onClose: () => void;
}) {
  const drivers = useStore((s) => s.drivers);
  const [bks, setBks] = useState(initial?.bks ?? "");
  const [driverName, setDriverName] = useState(initial?.driverName ?? "");
  const [taiTrong, setTaiTrong] = useState(() => taiTrongFromVehicle(initial));
  const [note, setNote] = useState(initial?.note ?? "");
  const [active, setActive] = useState(initial?.active !== false);
  const [saving, setSaving] = useState(false);

  const taiTrongOptions = useMemo(() => {
    const extra = taiTrong && !TAI_TRONG_OPTIONS.includes(taiTrong) ? [taiTrong] : [];
    return [...TAI_TRONG_OPTIONS, ...extra];
  }, [taiTrong]);

  const submit = async () => {
    const plate = normalizePlate(bks.trim());
    const drv = driverName.trim();
    if (!plate) return toast.error("Nhập biển kiểm soát");
    if (!isValidVnPlate(plate) && !isValidVnPlate(bks.trim())) {
      return toast.error("Biển không đúng định dạng (vd 29H88524 hoặc 29H-885.24)");
    }
    if (!drv) return toast.error("Nhập tên tài xế");
    if (!taiTrong.trim()) return toast.error("Chọn tải trọng");

    const { vehicleType, capacity } = truckTypeFromTaiTrong(taiTrong.trim());
    const rec: VehicleRec = {
      ...initial,
      bks: plate || bks.trim().toUpperCase(),
      vehicleType,
      capacity,
      driverName: drv,
      note: note.trim() || undefined,
      active,
      volumeM3: undefined,
      officeCode: initial?.officeCode,
    };

    setSaving(true);
    try {
      if (mode === "create") useStore.getState().addVehicle(rec);
      else useStore.getState().updateVehicle(initial!.bks, rec);
      toast.success(mode === "create" ? "Đã thêm xe tải" : "Đã lưu xe tải");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Thêm xe tải" : "Sửa xe tải"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Biển kiểm soát *</Label>
            <Input
              value={bks}
              onChange={(e) => setBks(e.target.value.toUpperCase())}
              placeholder="Nhập BKS, vd 29H88524"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tên tài xế *</Label>
            <NameInput
              preserveCase
              value={driverName}
              onChange={setDriverName}
              placeholder="Nhập tên tài xế…"
              list="master-truck-driver-suggestions"
            />
            <datalist id="master-truck-driver-suggestions">
              {drivers.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tải trọng *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={taiTrong}
              onChange={(e) => setTaiTrong(e.target.value)}
            >
              <option value="">Chọn tải trọng</option>
              {taiTrongOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuỳ chọn" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} />
            Đang hoạt động
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
