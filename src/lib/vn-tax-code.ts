/**
 * MST Việt Nam — 10 số / 13 số chi nhánh có checksum (TT 105/2020/TT-BTC),
 * hoặc 12 số CCCD chủ hộ kinh doanh / cá nhân (TT 86/2024, không checksum; 3 số đầu mã tỉnh 001–096).
 */
const WEIGHTS = [31, 29, 23, 19, 17, 13, 7, 5, 3] as const;

export function compactTaxCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[\s.\-]/g, "");
}

export function isValidVietnamTaxCode(raw: string | null | undefined): boolean {
  const number = compactTaxCode(raw);
  if (!/^\d+$/.test(number)) return false;
  if (number.length === 12) {
    const province = Number(number.slice(0, 3));
    return province >= 1 && province <= 96;
  }
  if (number.length !== 10 && number.length !== 13) return false;
  if (number.slice(2, 9) === "0000000") return false;
  if (number.length === 13 && number.slice(10) === "000") return false;
  let total = 0;
  for (let i = 0; i < 9; i++) total += WEIGHTS[i]! * Number(number[i]);
  const check = 10 - (total % 11);
  if (check < 0 || check > 9) return false;
  return Number(number[9]) === check;
}

export function normalizeTaxCode(raw: string): string {
  const number = compactTaxCode(raw);
  if (!isValidVietnamTaxCode(number)) return number;
  if (number.length === 13) return `${number.slice(0, 10)}-${number.slice(10)}`;
  return number;
}
