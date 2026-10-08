import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { isShortGoogleMapsLink, latLngFromGoogleMapsLink, resolveGoogleMapsLink } from "@/lib/google-maps-link";
import { composeAddress } from "@/lib/vn-address";
import { cn } from "@/lib/utils";

const softSelectClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 shadow-none hover:bg-[#E1E8F2] focus-visible:ring-1 focus-visible:ring-primary";
const softInputClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 shadow-none focus-visible:ring-1 focus-visible:ring-primary";
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
 * "Trước sáp nhập" ON  → V1 Province → District → Ward → Detail
 * "Trước sáp nhập" OFF → V2 Province → Ward → Detail
 */
export function AddressPicker({
  label,
  required,
  value,
  onChange,
  preferredProvince,
  disabled,
  triggerClassName,
  placeholder = "Chọn",
  allowMapLink = false,
  onPinChange,
}: {
  label: string;
  required?: boolean;
  value?: string;
  onChange: (full: string) => void;
  /** Chỉ xem — không mở được popup nhập địa chỉ. */
  disabled?: boolean;
  /** Gợi ý tỉnh/TP theo lộ trình — chọn sẵn khi chưa có địa chỉ đã xác nhận. */
  preferredProvince?: string;
  triggerClassName?: string;
  placeholder?: string;
  /** Dán link Google Maps trong popup. Có link thì chỉ bắt địa chỉ chi tiết. */
  allowMapLink?: boolean;
  /** GPS lấy từ link. null khi xác nhận địa chỉ không kèm link. */
  onPinChange?: (pin: { lat: number; lng: number } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  /** false = trước sáp nhập (V1 có quận/huyện); true = sau sáp nhập (V2). */
  const [isNew, setIsNew] = useState(false);
  const [draftV2, setDraftV2] = useState<DraftV2>(emptyV2);
  const [draftV1, setDraftV1] = useState<DraftV1>(emptyV1);
  const [mapLink, setMapLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [mapPin, setMapPin] = useState<{ lat: number; lng: number } | null>(null);
  const linkReq = useRef(0);
  const [detailOnly, setDetailOnly] = useState("");
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

  const acceptPin = (hit: { lat: number; lng: number }) => {
    setLinkError(null);
    setMapPin(hit);
    setDetailOnly((d) => d || (isNew ? draftV2.street : draftV1.street));
  };

  const applyMapLink = (raw: string) => {
    setMapLink(raw);
    const text = raw.trim();
    const req = ++linkReq.current;
    if (!text) {
      setLinkBusy(false);
      setLinkError(null);
      setMapPin(null);
      return;
    }
    const hit = latLngFromGoogleMapsLink(text);
    if (hit) {
      setLinkBusy(false);
      acceptPin(hit);
      return;
    }
    setMapPin(null);
    if (!isShortGoogleMapsLink(text)) {
      setLinkBusy(false);
      setLinkError(
        /google\.|goo\.gl|maps\.app/i.test(text)
          ? "Không thấy GPS trong link. Dán link maps.app.goo.gl hoặc link có @vĩ độ,kinh độ."
          : null,
      );
      return;
    }
    setLinkError(null);
    setLinkBusy(true);
    void resolveGoogleMapsLink(text)
      .then((pin) => {
        if (req !== linkReq.current) return;
        if (pin) acceptPin(pin);
        else setLinkError("Không lấy được GPS từ link rút gọn.");
      })
      .catch((e: unknown) => {
        if (req !== linkReq.current) return;
        setLinkError(e instanceof Error ? e.message : "Không mở được link Google Maps.");
      })
      .finally(() => {
        if (req === linkReq.current) setLinkBusy(false);
      });
  };

  const fromLink = allowMapLink && mapPin != null;
  const canConfirm = fromLink
    ? Boolean(detailOnly.trim())
    : isNew
      ? Boolean(draftV2.street && draftV2.provinceCode && draftV2.ward)
      : Boolean(draftV1.street && draftV1.provinceCode && draftV1.districtCode && draftV1.ward);

  const confirm = () => {
    if (fromLink) {
      onChange(detailOnly.trim());
      onPinChange?.(mapPin);
    } else {
      onChange(compose());
      onPinChange?.(null);
    }
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-left transition-colors",
          disabled ? "cursor-default opacity-70" : "hover:bg-muted",
          triggerClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className={cn("truncate text-sm", !value && "text-muted-foreground")}>
            {value || (disabled ? "—" : placeholder)}
          </span>
        </span>
        {!disabled && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md gap-0 overflow-y-auto rounded-2xl border-0 p-5 sm:max-w-md">
          <DialogHeader className="mb-4 space-y-0 text-left">
            <DialogTitle className="pr-8 text-lg font-semibold text-foreground">{label}</DialogTitle>
          </DialogHeader>

          {allowMapLink ? (
            <div className="mb-4 space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Link Google Maps</Label>
              <Input
                className={softInputClass}
                value={mapLink}
                onChange={(e) => applyMapLink(e.target.value)}
                placeholder="Dán link, ví dụ https://www.google.com/maps/@20.97,105.84,14z"
                aria-label="Link Google Maps"
              />
              {linkBusy ? <p className="text-xs text-muted-foreground">Đang mở link để lấy GPS…</p> : null}
              {linkError ? <p className="text-xs text-destructive">{linkError}</p> : null}
              {fromLink ? (
                <p className="text-xs text-muted-foreground">
                  Đã lấy GPS từ link. Chỉ cần địa chỉ chi tiết — dòng này gửi cho Ahamove.
                </p>
              ) : null}
            </div>
          ) : null}

          {!fromLink ? (
          <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <Checkbox
              checked={!isNew}
              onCheckedChange={(v) => setIsNew(!Boolean(v))}
            />
            Trước sáp nhập
          </label>
          ) : null}

          <div className="space-y-3.5">
            {!fromLink ? (
            <>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Tỉnh/Thành phố</Label>
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
                  placeholder="Chọn"
                  searchPlaceholder="Tìm tỉnh/thành phố..."
                  className={softSelectClass}
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
                  placeholder="Chọn"
                  searchPlaceholder="Tìm tỉnh/thành phố..."
                  className={softSelectClass}
                />
              )}
            </div>

            {!isNew && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">Quận/Huyện</Label>
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
                  placeholder={draftV1.provinceCode == null ? "Chọn tỉnh trước" : "Chọn"}
                  searchPlaceholder="Tìm quận/huyện..."
                  className={softSelectClass}
                  disabled={draftV1.provinceCode == null}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Phường/Xã</Label>
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
                  placeholder={draftV2.provinceCode == null ? "Chọn tỉnh trước" : "Chọn"}
                  searchPlaceholder="Tìm phường/xã..."
                  className={softSelectClass}
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
                  placeholder={draftV1.districtCode == null ? "Chọn quận/huyện trước" : "Chọn"}
                  searchPlaceholder="Tìm phường/xã..."
                  className={softSelectClass}
                  disabled={draftV1.districtCode == null}
                />
              )}
            </div>
            </>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Địa chỉ chi tiết</Label>
              <Input
                className={softInputClass}
                placeholder={fromLink ? "Số nhà, ngõ, tòa nhà… tài xế nhìn dòng này" : "Số nhà, ngõ ngách..."}
                value={fromLink ? detailOnly : isNew ? draftV2.street : draftV1.street}
                onChange={(e) => {
                  const street = e.target.value;
                  if (fromLink) {
                    setDetailOnly(street);
                    return;
                  }
                  if (isNew) setDraftV2((d) => ({ ...d, street }));
                  else setDraftV1((d) => ({ ...d, street }));
                }}
              />
            </div>
          </div>

          <Button
            type="button"
            className="mt-6 h-12 w-full rounded-xl text-base font-semibold"
            onClick={confirm}
            disabled={!canConfirm}
          >
            Xác nhận
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
