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

/** Excel SpreadsheetML (.xls) — mở được bằng Excel/Google Sheets, không cần thư viện. */
export function downloadExcel(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
) {
  const escXml = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const cell = (v: unknown) => {
    const s = String(v ?? "");
    const num =
      typeof v === "number" || (s !== "" && !Number.isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s));
    if (num && s !== "") {
      return `<Cell><Data ss:Type="Number">${escXml(s)}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${escXml(s)}</Data></Cell>`;
  };

  const headerRow = `<Row>${headers.map((h) => cell(h)).join("")}</Row>`;
  const body = rows.map((r) => `<Row>${r.map((c) => cell(c)).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="DonHang">
  <Table>
   ${headerRow}
   ${body}
  </Table>
 </Worksheet>
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
