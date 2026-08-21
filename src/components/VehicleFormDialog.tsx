import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore, type VehicleRec } from "@/lib/store";
import { toast } from "sonner";

const VEHICLE_TYPES = [
  "Xe tải thùng kín",
  "Xe tải mui bạt",
  "Xe tải đông lạnh",
  "Xe tải 1.25 tấn",
  "Xe tải 2.5 tấn",
  "Xe tải 5 tấn",
  "Xe tải 8 tấn",
  "Xe container",
];

export function VehicleFormDialog({
  mode,
  initial,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: VehicleRec;
  onClose: () => void;
}) {
  const offices = useStore((s) => s.offices);
  const drivers = useStore((s) => s.drivers);
  const [bks, setBks] = useState(initial?.bks ?? "");
  const [vehicleType, setVehicleType] = useState(initial?.vehicleType ?? "");
  const [cap, setCap] = useState(initial ? String(initial.capacity) : "");
  const [volume, setVolume] = useState(initial?.volumeM3 != null ? String(initial.volumeM3) : "");
  const [officeCode, setOfficeCode] = useState(initial?.officeCode ?? "");
  const [driverName, setDriverName] = useState(initial?.driverName ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [active, setActive] = useState(initial?.active !== false);

  const typeOptions = Array.from(new Set([...VEHICLE_TYPES, vehicleType].filter(Boolean))).map((t) => ({
    value: t,
    label: t,
  }));

  const submit = () => {
    if (!bks.trim()) return toast.error("Nhập biển số");
    if (!vehicleType.trim()) return toast.error("Chọn loại xe");
    if (!cap) return toast.error("Nhập định mức (kg)");
    const rec: VehicleRec = {
      ...initial,
      bks: bks.trim(),
      vehicleType: vehicleType.trim(),
      capacity: Number(cap),
      volumeM3: volume ? Number(volume) : undefined,
      officeCode: officeCode || undefined,
      driverName: driverName || undefined,
      note: note.trim() || undefined,
      active,
    };
    if (mode === "create") useStore.getState().addVehicle(rec);
    else useStore.getState().updateVehicle(initial!.bks, rec);
    toast.success(mode === "create" ? "Đã thêm xe tải" : "Đã lưu xe tải");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Tạo xe tải" : "Sửa xe tải"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Biển số *</Label>
            <Input value={bks} onChange={(e) => setBks(e.target.value.toUpperCase())} placeholder="VD: 29H-123.45" />
          </div>
          <div className="space-y-1.5">
            <Label>Loại xe *</Label>
            <SearchableSelect
              value={vehicleType}
              onValueChange={setVehicleType}
              placeholder="Chọn loại xe"
              options={typeOptions}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Định mức (kg) *</Label>
            <Input type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Thể tích (m³)</Label>
            <Input type="number" min={0} step="0.1" value={volume} onChange={(e) => setVolume(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>VP quản lý</Label>
            <SearchableSelect
              value={officeCode}
              onValueChange={setOfficeCode}
              placeholder="Chọn văn phòng"
              allowClear
              options={offices.map((o) => ({ value: o.code, label: o.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tài xế mặc định</Label>
            <SearchableSelect
              value={driverName}
              onValueChange={setDriverName}
              placeholder="Chọn tài xế"
              allowClear
              options={drivers.map((d) => ({ value: d, label: d }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thùng, đăng kiểm, ghi chú khác…" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} />
            Đang hoạt động
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
