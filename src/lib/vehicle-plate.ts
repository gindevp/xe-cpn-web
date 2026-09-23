/** Khớp BE `VehiclePlates`: bỏ "-", ".", khoảng trắng; viết hoa. */
export function normalizePlate(raw?: string | null): string {
  return (raw ?? "").replace(/[\s.-]/g, "").toUpperCase();
}

/** 2 số tỉnh + 1–2 chữ seri + 4–6 số, vd 29H88524, 29H-885.24, 29LD12345. */
export function isValidVnPlate(raw?: string | null): boolean {
  return /^\d{2}[A-Z]{1,2}\d{4,6}$/.test(normalizePlate(raw));
}
