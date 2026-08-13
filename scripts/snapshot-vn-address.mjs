/**
 * Snapshot VN administrative address data from provinces.open-api.vn
 * — API v1 (pre-merger) + API v2 (post-merger).
 *
 * Usage (from FE_react/Pixel Perfect):
 *   npm run snapshot:vn-address
 *   node --use-system-ca scripts/snapshot-vn-address.mjs
 *   node --use-system-ca scripts/snapshot-vn-address.mjs --v1
 *   node --use-system-ca scripts/snapshot-vn-address.mjs --v2
 *
 * Writes under src/data/vn-address/:
 *   provinces.v1.json, districts.v1.json, wards.v1.json, meta.v1.json
 *   provinces.v2.json, wards.v2.json, meta.v2.json
 *   meta.json  (alias of meta.v2 for backward compatibility)
 *
 * Fails (exit 1) on HTTP errors, empty data, duplicate codes, or orphan refs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_V1 = "https://provinces.open-api.vn/api/v1";
const BASE_V2 = "https://provinces.open-api.vn/api/v2";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "vn-address");

const args = new Set(process.argv.slice(2));
const doV1 = args.has("--v1") || (!args.has("--v1") && !args.has("--v2"));
const doV2 = args.has("--v2") || (!args.has("--v1") && !args.has("--v2"));

async function fetchJson(base, path) {
  const url = `${base}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function assertUnique(items, field, label) {
  const seen = new Map();
  const dups = [];
  for (const item of items) {
    const key = item[field];
    if (seen.has(key)) dups.push(key);
    else seen.set(key, true);
  }
  if (dups.length) fail(`${label}: duplicate ${field}: ${dups.slice(0, 10).join(", ")}`);
}

function sortByName(a, b) {
  return a.name.localeCompare(b.name, "vi") || a.code - b.code;
}

function mapProvince(p) {
  return {
    code: Number(p.code),
    name: String(p.name ?? ""),
    codename: String(p.codename ?? ""),
    divisionType: String(p.division_type ?? ""),
    phoneCode: p.phone_code != null ? Number(p.phone_code) : undefined,
  };
}

function mapDistrict(d) {
  return {
    code: Number(d.code),
    name: String(d.name ?? ""),
    codename: String(d.codename ?? ""),
    divisionType: String(d.division_type ?? ""),
    provinceCode: Number(d.province_code),
  };
}

function mapWardV1(w) {
  return {
    code: Number(w.code),
    name: String(w.name ?? ""),
    codename: String(w.codename ?? ""),
    divisionType: String(w.division_type ?? ""),
    districtCode: Number(w.district_code),
  };
}

function mapWardV2(w) {
  return {
    code: Number(w.code),
    name: String(w.name ?? ""),
    codename: String(w.codename ?? ""),
    divisionType: String(w.division_type ?? ""),
    provinceCode: Number(w.province_code),
  };
}

async function snapshotV1() {
  console.log("[v1] Fetching provinces / districts / wards...");
  const [rawP, rawD, rawW] = await Promise.all([
    fetchJson(BASE_V1, "/p/"),
    fetchJson(BASE_V1, "/d/"),
    fetchJson(BASE_V1, "/w/"),
  ]);

  if (!Array.isArray(rawP) || !rawP.length) fail("v1 provinces empty");
  if (!Array.isArray(rawD) || !rawD.length) fail("v1 districts empty");
  if (!Array.isArray(rawW) || !rawW.length) fail("v1 wards empty");

  const provinces = rawP.map(mapProvince);
  const districts = rawD.map(mapDistrict);
  const wards = rawW.map(mapWardV1);

  for (const p of provinces) if (!p.code || !p.name) fail(`v1 invalid province ${JSON.stringify(p)}`);
  for (const d of districts) if (!d.code || !d.name || !d.provinceCode) fail(`v1 invalid district ${JSON.stringify(d)}`);
  for (const w of wards) if (!w.code || !w.name || !w.districtCode) fail(`v1 invalid ward ${JSON.stringify(w)}`);

  assertUnique(provinces, "code", "v1 provinces");
  assertUnique(districts, "code", "v1 districts");
  assertUnique(wards, "code", "v1 wards");

  const pCodes = new Set(provinces.map((p) => p.code));
  const dCodes = new Set(districts.map((d) => d.code));

  const orphanD = districts.filter((d) => !pCodes.has(d.provinceCode));
  if (orphanD.length) fail(`v1 orphan districts: ${orphanD.slice(0, 5).map((d) => d.code).join(", ")}`);

  const orphanW = wards.filter((w) => !dCodes.has(w.districtCode));
  if (orphanW.length) fail(`v1 orphan wards: ${orphanW.slice(0, 5).map((w) => w.code).join(", ")}`);

  const districtsWithProvince = new Set(districts.map((d) => d.provinceCode));
  const emptyProvinces = provinces.filter((p) => !districtsWithProvince.has(p.code));
  if (emptyProvinces.length) {
    fail(`v1 provinces without districts: ${emptyProvinces.map((p) => `${p.code}:${p.name}`).join(", ")}`);
  }

  const wardsByDistrict = new Set(wards.map((w) => w.districtCode));
  const districtsWithoutWard = districts.filter((d) => !wardsByDistrict.has(d.code));
  // Known island/special districts may have 0 wards — warn, do not fail
  if (districtsWithoutWard.length) {
    console.warn(
      `[v1] WARN ${districtsWithoutWard.length} districts without wards:`,
      districtsWithoutWard.map((d) => `${d.code}:${d.name}`).join(", "),
    );
  }

  if (provinces.length < 50 || provinces.length > 70) fail(`v1 unexpected province count ${provinces.length}`);
  if (districts.length < 500 || districts.length > 900) fail(`v1 unexpected district count ${districts.length}`);
  if (wards.length < 8000 || wards.length > 12000) fail(`v1 unexpected ward count ${wards.length}`);

  provinces.sort(sortByName);
  districts.sort(sortByName);
  wards.sort(sortByName);

  const meta = {
    version: "pre-2025.07-v1",
    source: "provinces.open-api.vn/api/v1",
    generatedAt: new Date().toISOString(),
    provinceCount: provinces.length,
    districtCount: districts.length,
    wardCount: wards.length,
    districtsWithoutWardCount: districtsWithoutWard.length,
  };

  await writeFile(join(OUT_DIR, "provinces.v1.json"), JSON.stringify(provinces, null, 2), "utf8");
  await writeFile(join(OUT_DIR, "districts.v1.json"), JSON.stringify(districts, null, 2), "utf8");
  await writeFile(join(OUT_DIR, "wards.v1.json"), JSON.stringify(wards, null, 2), "utf8");
  await writeFile(join(OUT_DIR, "meta.v1.json"), JSON.stringify(meta, null, 2), "utf8");
  console.log("[v1] OK", JSON.stringify(meta));
  return meta;
}

async function snapshotV2() {
  console.log("[v2] Fetching provinces / wards...");
  const [rawP, rawW] = await Promise.all([fetchJson(BASE_V2, "/p/"), fetchJson(BASE_V2, "/w/")]);

  if (!Array.isArray(rawP) || !rawP.length) fail("v2 provinces empty");
  if (!Array.isArray(rawW) || !rawW.length) fail("v2 wards empty");

  const provinces = rawP.map(mapProvince);
  const wards = rawW.map(mapWardV2);

  for (const p of provinces) if (!p.code || !p.name) fail(`v2 invalid province ${JSON.stringify(p)}`);
  for (const w of wards) if (!w.code || !w.name || !w.provinceCode) fail(`v2 invalid ward ${JSON.stringify(w)}`);

  assertUnique(provinces, "code", "v2 provinces");
  assertUnique(wards, "code", "v2 wards");

  const pCodes = new Set(provinces.map((p) => p.code));
  const orphanW = wards.filter((w) => !pCodes.has(w.provinceCode));
  if (orphanW.length) fail(`v2 orphan wards: ${orphanW.slice(0, 5).map((w) => w.code).join(", ")}`);

  const withWards = new Set(wards.map((w) => w.provinceCode));
  const emptyP = provinces.filter((p) => !withWards.has(p.code));
  if (emptyP.length) fail(`v2 provinces without wards: ${emptyP.map((p) => `${p.code}:${p.name}`).join(", ")}`);

  if (provinces.length < 30 || provinces.length > 40) fail(`v2 unexpected province count ${provinces.length}`);
  if (wards.length < 2000 || wards.length > 5000) fail(`v2 unexpected ward count ${wards.length}`);

  provinces.sort(sortByName);
  wards.sort(sortByName);

  const meta = {
    version: "2025.07-v2",
    source: "provinces.open-api.vn/api/v2",
    generatedAt: new Date().toISOString(),
    provinceCount: provinces.length,
    wardCount: wards.length,
  };

  await writeFile(join(OUT_DIR, "provinces.v2.json"), JSON.stringify(provinces, null, 2), "utf8");
  await writeFile(join(OUT_DIR, "wards.v2.json"), JSON.stringify(wards, null, 2), "utf8");
  await writeFile(join(OUT_DIR, "meta.v2.json"), JSON.stringify(meta, null, 2), "utf8");
  await writeFile(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  console.log("[v2] OK", JSON.stringify(meta));
  return meta;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const out = {};
  if (doV1) out.v1 = await snapshotV1();
  if (doV2) out.v2 = await snapshotV2();
  console.log("DONE snapshot →", OUT_DIR);
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
