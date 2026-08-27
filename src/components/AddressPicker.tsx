import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { composeAddress } from "@/lib/vn-address";
import {
  findDistrictV1ByName,
  findProvinceV1ByName,
  findProvinceV2ByName,
  findWardV1ByName,
  findWardV2ByName,
  listCpnProvincesV1,
  listCpnProvincesV2,
  listDistrictsByProvinceV1,
  listWardsByDistrictV1,
  listWardsByProvinceV2,
} from "@/lib/vn-address-data";

function foldProvKey(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolvePreferredProvinceV2(name: string) {
  const hit = findProvinceV2ByName(name);
  if (hit) return hit;
  const key = foldProvKey(name);
  return listCpnProvincesV2().find((p) => foldProvKey(p.name).includes(key) || key.includes(foldProvKey(p.name)));
}

function resolvePreferredProvinceV1(name: string) {
  const hit = findProvinceV1ByName(name);
  if (hit) return hit;
  const key = foldProvKey(name);
  const fuzzy = listCpnProvincesV1().find(
    (p) => foldProvKey(p.name).includes(key) || key.includes(foldProvKey(p.name)),
  );
  if (fuzzy) return fuzzy;
  // Việt Trì không phải tỉnh V1 riêng → Phú Thọ
  if (key.includes("viettri")) return findProvinceV1ByName("Phú Thọ") ?? listCpnProvincesV1().find((p) => foldProvKey(p.name).includes("phutho"));
  return undefined;
}

type DraftV2 = {
  provinceCode: number | null;
  province: string;
  ward: string;
  street: string;
};

type DraftV1 = {
  provinceCode: number | null;
  districtCode: number | null;
  province: string;
  district: string;
  ward: string;
  street: string;
};

const emptyV2 = (): DraftV2 => ({ provinceCode: null, province: "", ward: "", street: "" });
const emptyV1 = (): DraftV1 => ({
  provinceCode: null,
  districtCode: null,
  province: "",
  district: "",
  ward: "",
  street: "",
});

/**
 * Ô địa chỉ dạng tóm tắt: bấm vào mở popup nhập chi tiết.
 * "Địa chỉ mới" ON  → V2 Province → Ward → Detail (local JSON, searchable).
 * "Địa chỉ mới" OFF → V1 Province → District → Ward → Detail (local JSON, searchable).
 */
export function AddressPicker({
  label,
  required,
  value,
  onChange,
  preferredProvince,
}: {
  label: string;
  required?: boolean;
  value?: string;
  onChange: (full: string) => void;
  /** Gợi ý tỉnh/TP theo lộ trình — chọn sẵn khi chưa có địa chỉ đã xác nhận. */
  preferredProvince?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [draftV2, setDraftV2] = useState<DraftV2>(emptyV2);
  const [draftV1, setDraftV1] = useState<DraftV1>(emptyV1);
  const appliedPreferredRef = useRef("");

  const provinceOptionsV2 = useMemo(
    () =>
      listCpnProvincesV2().map((p) => ({
        value: String(p.code),
        label: p.name,
        keywords: `${p.codename} ${p.code}`,
      })),
    [],
  );
  const provinceOptionsV1 = useMemo(
    () =>
      listCpnProvincesV1().map((p) => ({
        value: String(p.code),
        label: p.name,
        keywords: `${p.codename} ${p.code}`,
      })),
    [],
  );
  const districtOptionsV1 = useMemo(
    () =>
      listDistrictsByProvinceV1(draftV1.provinceCode).map((d) => ({
        value: String(d.code),
        label: d.name,
        keywords: `${d.codename} ${d.code}`,
      })),
    [draftV1.provinceCode],
  );
  const wardOptionsV2 = useMemo(
    () =>
      listWardsByProvinceV2(draftV2.provinceCode).map((w) => ({
        value: String(w.code),
        label: w.name,
        keywords: `${w.codename} ${w.code}`,
      })),
    [draftV2.provinceCode],
  );
  const wardOptionsV1 = useMemo(
    () =>
      listWardsByDistrictV1(draftV1.districtCode).map((w) => ({
        value: String(w.code),
        label: w.name,
        keywords: `${w.codename} ${w.code}`,
      })),
    [draftV1.districtCode],
  );

  useEffect(() => {
    if (!value) return;
    const parts = value.split(",").map((s) => s.trim());
    if (parts.length >= 4) {
      setIsNew(false);
      const provName = parts[parts.length - 1] ?? "";
      const distName = parts[parts.length - 2] ?? "";
      const wardName = parts[parts.length - 3] ?? "";
      const street = parts.slice(0, parts.length - 3).join(", ");
      const p = findProvinceV1ByName(provName);
      const d = p ? findDistrictV1ByName(p.code, distName) : undefined;
      const w = d ? findWardV1ByName(d.code, wardName) : undefined;
      setDraftV1({
        provinceCode: p?.code ?? null,
        districtCode: d?.code ?? null,
        province: p?.name ?? provName,
        district: d?.name ?? distName,
        ward: w?.name ?? wardName,
        street,
      });
    } else if (parts.length === 3) {
      setIsNew(true);
      const provName = parts[2] ?? "";
      const wardName = parts[1] ?? "";
      const street = parts[0] ?? "";
      const p = findProvinceV2ByName(provName);
      const w = p ? findWardV2ByName(p.code, wardName) : undefined;
      setDraftV2({
        provinceCode: p?.code ?? null,
        province: p?.name ?? provName,
        ward: w?.name ?? wardName,
        street,
      });
    } else {
      setDraftV2((d) => ({ ...d, street: value }));
      setDraftV1((d) => ({ ...d, street: value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chọn sẵn tỉnh/TP theo lộ trình khi chưa có địa chỉ đã lưu.
  useEffect(() => {
    if (!preferredProvince?.trim()) return;
    if (value?.trim()) return;

    const raw = preferredProvince.trim();
    const p2 = resolvePreferredProvinceV2(raw);
    const p1 = resolvePreferredProvinceV1(raw);
    if (!p2 && !p1) return;

    const appliedLabel = p2?.name ?? p1?.name ?? raw;

    setDraftV2((d) => {
      const wasAuto =
        !d.province ||
        d.province === appliedPreferredRef.current ||
        (p2 != null && d.province === p2.name);
      if ((d.street || d.ward) && !wasAuto) return d;
      if (p2 && d.provinceCode === p2.code && d.province === p2.name) return d;
      return {
        provinceCode: p2?.code ?? null,
        province: p2?.name ?? "",
        ward: "",
        street: d.street,
      };
    });
    setDraftV1((d) => {
      const wasAuto =
        !d.province ||
        d.province === appliedPreferredRef.current ||
        (p1 != null && d.province === p1.name);
      if ((d.street || d.ward || d.district) && !wasAuto) return d;
      if (p1 && d.provinceCode === p1.code && d.province === p1.name) return d;
      return {
        provinceCode: p1?.code ?? null,
        province: p1?.name ?? "",
        districtCode: null,
        district: "",
        ward: "",
        street: d.street,
      };
    });
    appliedPreferredRef.current = appliedLabel;
  }, [preferredProvince, value]);

  const selectedWardCodeV2 = useMemo(() => {
    if (!draftV2.provinceCode || !draftV2.ward) return "";
    return String(findWardV2ByName(draftV2.provinceCode, draftV2.ward)?.code ?? "");
  }, [draftV2.provinceCode, draftV2.ward]);

  const selectedWardCodeV1 = useMemo(() => {
    if (!draftV1.districtCode || !draftV1.ward) return "";
    return String(findWardV1ByName(draftV1.districtCode, draftV1.ward)?.code ?? "");
  }, [draftV1.districtCode, draftV1.ward]);

  const compose = () => {
    if (isNew) {
      return composeAddress({
        street: draftV2.street,
        ward: draftV2.ward,
        province: draftV2.province,
      });
    }
    return composeAddress({
      street: draftV1.street,
      ward: draftV1.ward,
      district: draftV1.district,
      province: draftV1.province,
    });
  };

  const canConfirm = isNew
    ? Boolean(draftV2.street && draftV2.provinceCode && draftV2.ward)
    : Boolean(draftV1.street && draftV1.provinceCode && draftV1.districtCode && draftV1.ward);

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
                  {isNew ? (
                    <SearchableSelect
                      value={draftV2.provinceCode != null ? String(draftV2.provinceCode) : ""}
                      onValueChange={(codeStr) => {
                        if (!codeStr) {
                          setDraftV2((d) => ({ ...d, provinceCode: null, province: "", ward: "" }));
                          return;
                        }
                        const code = Number(codeStr);
                        const p = listCpnProvincesV2().find((x) => x.code === code);
                        setDraftV2((d) => ({
                          ...d,
                          provinceCode: p?.code ?? null,
                          province: p?.name ?? "",
                          ward: "",
                        }));
                      }}
                      options={provinceOptionsV2}
                      placeholder="Chọn tỉnh/thành phố"
                      searchPlaceholder="Tìm tỉnh/thành phố..."
                      className="h-9"
                    />
                  ) : (
                    <SearchableSelect
                      value={draftV1.provinceCode != null ? String(draftV1.provinceCode) : ""}
                      onValueChange={(codeStr) => {
                        if (!codeStr) {
                          setDraftV1((d) => ({
                            ...d,
                            provinceCode: null,
                            province: "",
                            districtCode: null,
                            district: "",
                            ward: "",
                          }));
                          return;
                        }
                        const code = Number(codeStr);
                        const p = listCpnProvincesV1().find((x) => x.code === code);
                        setDraftV1((d) => ({
                          ...d,
                          provinceCode: p?.code ?? null,
                          province: p?.name ?? "",
                          districtCode: null,
                          district: "",
                          ward: "",
                        }));
                      }}
                      options={provinceOptionsV1}
                      placeholder="Chọn tỉnh/thành phố"
                      searchPlaceholder="Tìm tỉnh/thành phố..."
                      className="h-9"
                    />
                  )}
                </div>

                {!isNew && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Quận - Huyện <span className="text-destructive">*</span>
                    </Label>
                    <SearchableSelect
                      value={draftV1.districtCode != null ? String(draftV1.districtCode) : ""}
                      onValueChange={(codeStr) => {
                        if (!codeStr) {
                          setDraftV1((d) => ({ ...d, districtCode: null, district: "", ward: "" }));
                          return;
                        }
                        const code = Number(codeStr);
                        const dist = listDistrictsByProvinceV1(draftV1.provinceCode).find((x) => x.code === code);
                        setDraftV1((d) => ({
                          ...d,
                          districtCode: dist?.code ?? null,
                          district: dist?.name ?? "",
                          ward: "",
                        }));
                      }}
                      options={districtOptionsV1}
                      placeholder={draftV1.provinceCode == null ? "Chọn tỉnh trước" : "Chọn quận/huyện"}
                      searchPlaceholder="Tìm quận/huyện..."
                      className="h-9"
                      disabled={draftV1.provinceCode == null}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Phường - Xã <span className="text-destructive">*</span>
                  </Label>
                  {isNew ? (
                    <SearchableSelect
                      value={selectedWardCodeV2}
                      onValueChange={(codeStr) => {
                        if (!codeStr) {
                          setDraftV2((d) => ({ ...d, ward: "" }));
                          return;
                        }
                        const code = Number(codeStr);
                        const w = listWardsByProvinceV2(draftV2.provinceCode).find((x) => x.code === code);
                        setDraftV2((d) => ({ ...d, ward: w?.name ?? "" }));
                      }}
                      options={wardOptionsV2}
                      placeholder={draftV2.provinceCode == null ? "Chọn tỉnh trước" : "Chọn phường/xã"}
                      searchPlaceholder="Tìm phường/xã..."
                      className="h-9"
                      disabled={draftV2.provinceCode == null}
                    />
                  ) : (
                    <SearchableSelect
                      value={selectedWardCodeV1}
                      onValueChange={(codeStr) => {
                        if (!codeStr) {
                          setDraftV1((d) => ({ ...d, ward: "" }));
                          return;
                        }
                        const code = Number(codeStr);
                        const w = listWardsByDistrictV1(draftV1.districtCode).find((x) => x.code === code);
                        setDraftV1((d) => ({ ...d, ward: w?.name ?? "" }));
                      }}
                      options={wardOptionsV1}
                      placeholder={draftV1.districtCode == null ? "Chọn quận/huyện trước" : "Chọn phường/xã"}
                      searchPlaceholder="Tìm phường/xã..."
                      className="h-9"
                      disabled={draftV1.districtCode == null}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {label} <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Số nhà, ngõ ngách, tên đường"
                  value={isNew ? draftV2.street : draftV1.street}
                  onChange={(e) => {
                    const street = e.target.value;
                    if (isNew) setDraftV2((d) => ({ ...d, street }));
                    else setDraftV1((d) => ({ ...d, street }));
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={confirm} disabled={!canConfirm}>
              Xong
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
