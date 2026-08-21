// Kiểm tra vòng ghi/đọc tag loại hàng + tên hàng trong note đơn.
// Chạy: node scripts/check-package-note.mjs
import { pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "cpn-note-"));
for (const f of ["mock-data.ts", "package-label.ts"]) {
  const src = readFileSync(path.resolve("src/lib", f), "utf8").replaceAll('from "./mock-data"', 'from "./mock-data.ts"');
  writeFileSync(path.join(dir, f), src);
}
const m = await import(pathToFileURL(path.join(dir, "package-label.ts")).href);

let failed = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) console.log(`     got=${JSON.stringify(actual)}\n     exp=${JSON.stringify(expected)}`);
};

// --- Đường ghi: 2 kiện, kiện 2 là "Khác" + tên tự nhập ---
let note = m.embedPackageGoods("Ghi chú đơn", ["Quần áo", "Khác"], ["", "Bình gốm cổ"]);
note = m.embedPackageFares(note, [30000, 20000]);
note = m.embedPackageItemQtys(note, [1, 1]);
note = m.embedPackageWeightsKg(note, [1, 2]);

eq(
  "note ghi ra đúng định dạng",
  note,
  "[LOAI]Quần áo|Khác[/LOAI]\n[TENHANG]|Bình gốm cổ[/TENHANG]\n[CUOC]30000,20000[/CUOC]\n[SLQTY]1,1[/SLQTY]\n[PKGKG]1,2[/PKGKG]\nGhi chú đơn",
);

// --- Đường đọc ---
const order = { code: "XE26ND000060", quantity: 2, goodsType: "THUONG", fare: 50000, weightKg: 3, note };
const rows = m.packageRows(order);
eq("kiện 1 nhãn", rows[0].label, "Quần áo");
eq("kiện 2 nhãn", rows[1].label, "Khác (Bình gốm cổ)");
eq("kiện 2 tách loại/tên", [rows[1].kind, rows[1].goodsName], ["Khác", "Bình gốm cổ"]);
eq("nhãn mức đơn", m.orderGoodsLabel(order), "Quần áo, Khác (Bình gốm cổ)");
eq("packageNameOf kiện 2", m.packageNameOf(order, 2), "Khác (Bình gốm cổ)");
eq("ghi chú người dùng không dính tag", m.displayOrderNote(note), "Ghi chú đơn");
eq("cước/KL từng kiện giữ nguyên", [rows[0].fare, rows[1].fare, rows[0].weightKg, rows[1].weightKg], [30000, 20000, 1, 2]);

// --- Nhập kho không được làm mất tag tên hàng ---
const afterWhIn = m.embedWarehouseInSeqs(note, [2]);
eq("giữ [TENHANG] sau khi nhập kho", afterWhIn.includes("[TENHANG]|Bình gốm cổ[/TENHANG]"), true);
eq("nhãn vẫn đúng sau nhập kho", m.orderGoodsLabel({ ...order, note: afterWhIn }), "Quần áo, Khác (Bình gốm cổ)");
eq("cước từng kiện còn nguyên sau nhập kho", m.packageRows({ ...order, note: afterWhIn }).map((r) => r.fare), [30000, 20000]);

// --- Đơn cũ: [KIEN] tách bằng dấu phẩy, không có [TENHANG] ---
const legacy = { code: "XE26GP000001", quantity: 2, goodsType: "THUONG", fare: 40000, note: "[KIEN]Bưu kiện, Quần áo[/KIEN]" };
eq("đơn cũ vẫn đọc được", m.packageRows(legacy).map((r) => r.label), ["Bưu kiện", "Quần áo"]);
eq("đơn cũ nhãn mức đơn", m.orderGoodsLabel(legacy), "Bưu kiện, Quần áo");

// --- Đơn không có tên hàng: rơi về nhãn enum ---
eq("đơn không có tên hàng", m.orderGoodsLabel({ code: "X", quantity: 1, goodsType: "DE_VO", fare: 0, note: undefined }), "Dễ vỡ");

// --- Tên hàng có dấu phẩy không bị tách nhầm ---
const comma = m.embedPackageGoods(undefined, ["Khác"], ["Bình gốm cổ, loại to"]);
eq("tên hàng chứa dấu phẩy", m.packageNameOf({ code: "X", quantity: 1, goodsType: "THUONG", fare: 0, note: comma }, 1), "Khác (Bình gốm cổ, loại to)");

rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} kiểm tra THẤT BẠI` : "\nTất cả kiểm tra PASS");
process.exit(failed ? 1 : 0);
