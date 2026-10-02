// CSV / Excel download helpers (client-side).

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

type ExcelCell = string | number | boolean | null | undefined;
export type ExcelSheet = { name: string; headers: string[]; rows: ExcelCell[][] };

/** Excel SpreadsheetML (.xls) — mở được bằng Excel/Google Sheets, không cần thư viện. */
export function downloadExcel(filename: string, headers: string[], rows: ExcelCell[][]) {
  downloadExcelSheets(filename, [{ name: "DonHang", headers, rows }]);
}

/** Như downloadExcel, dòng đầu của {@code rows} là tiêu đề (cùng dạng dữ liệu với downloadCSV). */
export function downloadExcelRows(filename: string, rows: ExcelCell[][], sheetName = "Sheet1") {
  const [headers = [], ...body] = rows;
  downloadExcelSheets(filename, [{ name: sheetName, headers: headers.map((h) => String(h ?? "")), rows: body }]);
}

/** Như downloadExcel nhưng nhiều sheet. Tên sheet tối đa 31 ký tự, không chứa : \ / ? * [ ]. */
export function downloadExcelSheets(filename: string, sheets: ExcelSheet[]) {
  const escXml = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const cell = (v: unknown) => {
    const s = String(v ?? "");
    // SĐT / MST / số HĐ có số 0 đầu phải giữ dạng chữ, không thì Excel cắt mất số 0;
    // chuỗi số dài (số TK, MST) cũng giữ dạng chữ — Excel làm tròn quá 15 chữ số.
    const num =
      typeof v === "number" ||
      (s !== "" &&
        !Number.isNaN(Number(s)) &&
        /^-?\d+(\.\d+)?$/.test(s) &&
        !/^0\d/.test(s) &&
        !/^\d{10,}$/.test(s));
    if (num && s !== "") {
      return `<Cell><Data ss:Type="Number">${escXml(s)}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${escXml(s)}</Data></Cell>`;
  };

  const worksheet = (s: ExcelSheet) => {
    const name = s.name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
    const headerRow = `<Row>${s.headers.map((h) => cell(h)).join("")}</Row>`;
    const body = s.rows.map((r) => `<Row>${r.map((c) => cell(c)).join("")}</Row>`).join("");
    return ` <Worksheet ss:Name="${escXml(name)}">
  <Table>
   ${headerRow}
   ${body}
  </Table>
 </Worksheet>`;
  };
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${sheets.map(worksheet).join("\n")}
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const name = filename.replace(/\.(csv|xlsx|xls)$/i, "") + ".xls";
  triggerDownload(blob, name);
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
