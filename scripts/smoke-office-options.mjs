/** Smoke: office select / matching after VP_* master rename. */
function foldOfficeKey(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(vp|vanphong)/, "");
}

function preferredOfficeCodesForPoint(f) {
  if (!f) return [];
  if (f === "nd" || f.includes("namdinh")) return ["ND", "VP_ND", "SHN"];
  if (f === "nb" || f.includes("ninhbinh") || f.includes("tamcoc")) return ["NB", "VP_NB"];
  if (f === "tb" || f.includes("thaibinh")) return ["TB", "VP_TB"];
  if (f === "pt" || f.includes("phutho")) return ["PT", "VP_PT"];
  if (f === "vt" || f.includes("viettri")) return ["VT", "VP_VT"];
  if (f === "yb" || f.includes("yenbai") || f.startsWith("yb")) return ["YB", "YB1", "YB3", "VP_YB"];
  return [];
}

function officesMatchingPoint(offices, point) {
  const key = foldOfficeKey(point);
  if (!key) return [];
  const exact = offices.filter((o) => foldOfficeKey(o.name) === key || foldOfficeKey(o.code) === key);
  if (exact.length) return exact;
  const preferredFolds = new Set(preferredOfficeCodesForPoint(key).map(foldOfficeKey).filter(Boolean));
  return offices.filter((o) => preferredFolds.has(foldOfficeKey(o.code)));
}

const HN_OFFICE_CODES = new Set(["gp", "hd", "bc", "vphn", "ngh", "ld", "pv", "tdn", "nh", "hn"]);
function isHnRegionOffice(o) {
  const codeKey = foldOfficeKey(o.code);
  if (HN_OFFICE_CODES.has(codeKey)) return true;
  const nameKey = foldOfficeKey(o.name);
  return nameKey.endsWith("hn");
}

const offices = await fetch("https://xe-cpn-api-production.up.railway.app/api/offices").then((r) => r.json());
console.log("offices", offices.length);
const all = offices.length;
const nd = officesMatchingPoint(offices, "Nam Định");
const tb = officesMatchingPoint(offices, "Thái Bình");
const hn = offices.filter(isHnRegionOffice);
console.log("all selectable", all);
console.log(
  "Nam Dinh",
  nd.map((o) => `${o.id}:${o.code}`).join(", "),
);
console.log(
  "Thai Binh",
  tb.map((o) => `${o.id}:${o.code}`).join(", "),
);
console.log(
  "HN",
  hn.length,
  hn.map((o) => o.code).join(","),
);
const dups = Object.entries(
  offices.reduce((m, o) => {
    m[o.code] = (m[o.code] || 0) + 1;
    return m;
  }, {}),
).filter(([, n]) => n > 1);
console.log("dup codes", dups);
if (all < 16) throw new Error("expected >=16 offices");
if (nd.length < 2) throw new Error("expected both VP_ND");
if (hn.length < 7) throw new Error("expected HN offices");
console.log("OK");
