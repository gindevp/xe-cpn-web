import provincesV1 from "@/data/vn-address/provinces.v1.json";
import districtsV1 from "@/data/vn-address/districts.v1.json";
import wardsV1 from "@/data/vn-address/wards.v1.json";
import metaV1 from "@/data/vn-address/meta.v1.json";
import provincesV2 from "@/data/vn-address/provinces.v2.json";
import wardsV2 from "@/data/vn-address/wards.v2.json";
import metaV2 from "@/data/vn-address/meta.v2.json";

export type ProvinceV1 = {
  code: number;
  name: string;
  codename: string;
  divisionType: string;
  phoneCode?: number;
};

export type DistrictV1 = {
  code: number;
  name: string;
  codename: string;
  divisionType: string;
  provinceCode: number;
};

export type WardV1 = {
  code: number;
  name: string;
  codename: string;
  divisionType: string;
  districtCode: number;
};

export type ProvinceV2 = {
  code: number;
  name: string;
  codename: string;
  divisionType: string;
  phoneCode?: number;
};

export type WardV2 = {
  code: number;
  name: string;
  codename: string;
  divisionType: string;
  provinceCode: number;
};

export type AddressDatasetMetaV1 = {
  version: string;
  source: string;
  generatedAt: string;
  provinceCount: number;
  districtCount: number;
  wardCount: number;
  districtsWithoutWardCount?: number;
};

export type AddressDatasetMetaV2 = {
  version: string;
  source: string;
  generatedAt: string;
  provinceCount: number;
  wardCount: number;
};

export const VN_ADDRESS_META_V1 = metaV1 as AddressDatasetMetaV1;
export const VN_ADDRESS_META_V2 = metaV2 as AddressDatasetMetaV2;
/** @deprecated use VN_ADDRESS_META_V2 */
export const VN_ADDRESS_META = VN_ADDRESS_META_V2;

export const VN_PROVINCES_V1 = provincesV1 as ProvinceV1[];
export const VN_DISTRICTS_V1 = districtsV1 as DistrictV1[];
export const VN_WARDS_V1 = wardsV1 as WardV1[];
export const VN_PROVINCES_V2 = provincesV2 as ProvinceV2[];
export const VN_WARDS_V2 = wardsV2 as WardV2[];

const districtsByProvince = (() => {
  const map = new Map<number, DistrictV1[]>();
  for (const d of VN_DISTRICTS_V1) {
    const list = map.get(d.provinceCode);
    if (list) list.push(d);
    else map.set(d.provinceCode, [d]);
  }
  return map;
})();

const wardsByDistrict = (() => {
  const map = new Map<number, WardV1[]>();
  for (const w of VN_WARDS_V1) {
    const list = map.get(w.districtCode);
    if (list) list.push(w);
    else map.set(w.districtCode, [w]);
  }
  return map;
})();

const wardsByProvinceV2 = (() => {
  const map = new Map<number, WardV2[]>();
  for (const w of VN_WARDS_V2) {
    const list = map.get(w.provinceCode);
    if (list) list.push(w);
    else map.set(w.provinceCode, [w]);
  }
  return map;
})();

// ---------- V1 ----------
export function listProvincesV1(): ProvinceV1[] {
  return VN_PROVINCES_V1;
}

export function listDistrictsByProvinceV1(provinceCode: number | null | undefined): DistrictV1[] {
  if (provinceCode == null) return [];
  return districtsByProvince.get(provinceCode) ?? [];
}

export function listWardsByDistrictV1(districtCode: number | null | undefined): WardV1[] {
  if (districtCode == null) return [];
  return wardsByDistrict.get(districtCode) ?? [];
}

export function findProvinceV1ByCode(code: number | null | undefined): ProvinceV1 | undefined {
  if (code == null) return undefined;
  return VN_PROVINCES_V1.find((p) => p.code === code);
}

export function findProvinceV1ByName(name: string): ProvinceV1 | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return VN_PROVINCES_V1.find((p) => p.name.toLowerCase() === key);
}

export function findDistrictV1ByCode(code: number | null | undefined): DistrictV1 | undefined {
  if (code == null) return undefined;
  return VN_DISTRICTS_V1.find((d) => d.code === code);
}

export function findDistrictV1ByName(provinceCode: number | null | undefined, name: string): DistrictV1 | undefined {
  const key = name.trim().toLowerCase();
  if (!key || provinceCode == null) return undefined;
  return listDistrictsByProvinceV1(provinceCode).find((d) => d.name.toLowerCase() === key);
}

export function findWardV1ByCode(code: number | null | undefined): WardV1 | undefined {
  if (code == null) return undefined;
  return VN_WARDS_V1.find((w) => w.code === code);
}

export function findWardV1ByName(districtCode: number | null | undefined, name: string): WardV1 | undefined {
  const key = name.trim().toLowerCase();
  if (!key || districtCode == null) return undefined;
  return listWardsByDistrictV1(districtCode).find((w) => w.name.toLowerCase() === key);
}

// ---------- V2 ----------
export function listProvincesV2(): ProvinceV2[] {
  return VN_PROVINCES_V2;
}

export function listWardsByProvinceV2(provinceCode: number | null | undefined): WardV2[] {
  if (provinceCode == null) return [];
  return wardsByProvinceV2.get(provinceCode) ?? [];
}

export function findProvinceV2ByCode(code: number | null | undefined): ProvinceV2 | undefined {
  if (code == null) return undefined;
  return VN_PROVINCES_V2.find((p) => p.code === code);
}

export function findProvinceV2ByName(name: string): ProvinceV2 | undefined {
  const raw = name.trim().toLowerCase();
  if (!raw) return undefined;
  const exact = VN_PROVINCES_V2.find((p) => p.name.toLowerCase() === raw);
  if (exact) return exact;
  // Thái Bình sáp nhập vào Hưng Yên (V2); old saved labels still resolve.
  if (raw.includes("thái bình") || raw.includes("thai binh") || raw.includes("hưng yên") || raw.includes("hung yen")) {
    return VN_PROVINCES_V2.find((p) => p.codename === "hung_yen");
  }
  return undefined;
}

export function findWardV2ByCode(code: number | null | undefined): WardV2 | undefined {
  if (code == null) return undefined;
  return VN_WARDS_V2.find((w) => w.code === code);
}

export function findWardV2ByName(provinceCode: number | null | undefined, name: string): WardV2 | undefined {
  const key = name.trim().toLowerCase();
  if (!key || provinceCode == null) return undefined;
  return listWardsByProvinceV2(provinceCode).find((w) => w.name.toLowerCase() === key);
}

/** CPN operating cities — only shown if present in the official province JSON. */
/** Địa chỉ cũ (V1, còn quận/huyện): danh sách gốc, không gồm Hưng Yên / Lào Cai. */
export const CPN_PROVINCE_NAME_FILTER_V1 = [
  "Hà Nội",
  "Ninh Bình",
  "Thái Bình",
  "Nam Định",
  "Phú Thọ",
  "Việt Trì",
  "Yên Bái",
];

/** Địa chỉ mới (V2): sau sáp nhập — Thái Bình → Hưng Yên; thêm Lào Cai. */
export const CPN_PROVINCE_NAME_FILTER_V2 = [
  "Hà Nội",
  "Ninh Bình",
  "Hưng Yên",
  "Nam Định",
  "Phú Thọ",
  "Việt Trì",
  "Yên Bái",
  "Lào Cai",
];

/** @deprecated use CPN_PROVINCE_NAME_FILTER_V2 */
export const CPN_PROVINCE_NAME_FILTER = CPN_PROVINCE_NAME_FILTER_V2;

function foldVn(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesCpnProvinceFilter(officialName: string, filter: string[]): boolean {
  const key = foldVn(officialName);
  return filter.some((city) => key.includes(foldVn(city)));
}

export function listCpnProvincesV1(): ProvinceV1[] {
  return listProvincesV1().filter((p) => matchesCpnProvinceFilter(p.name, CPN_PROVINCE_NAME_FILTER_V1));
}

export function listCpnProvincesV2(): ProvinceV2[] {
  return listProvincesV2().filter((p) => matchesCpnProvinceFilter(p.name, CPN_PROVINCE_NAME_FILTER_V2));
}
