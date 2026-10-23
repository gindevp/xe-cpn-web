// CSV download helpers (client-side). Nhẹ hơn SpreadsheetML/.xls cũ.

type CsvCell = string | number | boolean | null | undefined;
export type ExcelSheet = { name: string; headers: string[]; rows: CsvCell[][] };

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  // SĐT / MST / số dài: ép Excel mở CSV vẫn giữ dạng chữ → ô dạng ="0xxx"
  if (s !== "" && (/^0\d/.test(s) || /^\d{10,}$/.test(s))) {
    return `"=""${s.replace(/"/g, '""')}"""`;
  }
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(filename: string) {
  return filename.replace(/\.(csv|xlsx|xls)$/i, "");
}

function sheetFileSuffix(name: string) {
  return name.replace(/[:\\/?*[\]]/g, "_").replace(/\s+/g, "-").slice(0, 40) || "sheet";
}

/** Xuất một file CSV (UTF-8 BOM). */
export function downloadCSV(filename: string, rows: CsvCell[][]) {
  const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${baseName(filename)}.csv`);
}

/** Một sheet → CSV (tên cũ downloadExcel để khỏi sửa từng màn). */
export function downloadExcel(filename: string, headers: string[], rows: CsvCell[][]) {
  downloadCSV(filename, [headers, ...rows]);
}

/** Dòng đầu là tiêu đề. */
export function downloadExcelRows(filename: string, rows: CsvCell[][], _sheetName = "Sheet1") {
  downloadCSV(filename, rows);
}

/**
 * Nhiều sheet → mỗi sheet một file CSV (`ten_Sheet.csv`).
 * Trình duyệt có thể hỏi cho phép tải nhiều file.
 */
export function downloadExcelSheets(filename: string, sheets: ExcelSheet[]) {
  const base = baseName(filename);
  const list = sheets.filter((s) => s && (s.headers?.length || s.rows?.length));
  list.forEach((s, i) => {
    const rows: CsvCell[][] = [s.headers ?? [], ...(s.rows ?? [])];
    const name = list.length === 1 ? base : `${base}_${sheetFileSuffix(s.name || `sheet${i + 1}`)}`;
    // Trễ nhẹ để Chrome không gộp/chặn multi-download.
    window.setTimeout(() => downloadCSV(name, rows), i * 250);
  });
}
