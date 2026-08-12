import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { composeAddress } from "@/lib/vn-address";

/**
 * Ô địa chỉ dạng tóm tắt: bấm vào mở popup nhập chi tiết.
 * Bật "Địa chỉ mới" → chỉ 3 ô (địa chỉ, tỉnh/TP, phường/xã).
 * Tắt → thêm ô Quận/Huyện.
 */
export function AddressPicker({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value?: string;
  onChange: (full: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isNew, setIsNew] = useState(true);

  const [street, setStreet] = useState("");
  const [ward, setWard] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("");

  // Nạp giá trị ban đầu (chuỗi đã ghép) 1 lần
  useEffect(() => {
    if (!value) return;
    const parts = value.split(",").map((s) => s.trim());
    if (parts.length >= 4) {
      setIsNew(false);
      setProvince(parts[parts.length - 1] ?? "");
      setDistrict(parts[parts.length - 2] ?? "");
      setWard(parts[parts.length - 3] ?? "");
      setStreet(parts.slice(0, parts.length - 3).join(", "));
    } else if (parts.length === 3) {
      setProvince(parts[2] ?? "");
      setWard(parts[1] ?? "");
      setStreet(parts[0] ?? "");
    } else {
      setStreet(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compose = () =>
    composeAddress({ street, ward, district: isNew ? "" : district, province });

  const confirm = () => {
    onChange(compose());
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <span className={`text-sm ${value ? "" : "text-muted-foreground"}`}>
          {value || "Nhập địa chỉ"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Thông tin địa chỉ</div>
              <div className="flex items-center gap-2">
                <Switch checked={isNew} onCheckedChange={setIsNew} />
                <span className="text-sm">Địa chỉ mới</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className={`grid grid-cols-1 gap-3 ${isNew ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Tỉnh - Thành phố <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Tỉnh/Thành phố"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                  />
                </div>
                {!isNew && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quận - Huyện</Label>
                    <Input
                      placeholder="Quận/Huyện"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Phường - Xã <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Phường/Xã"
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {label} <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Số nhà, ngõ ngách, tên đường"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </div>
            </div>

          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={confirm} disabled={!street || !province || !ward}>
              Xong
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
