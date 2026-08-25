import type { Role } from "./mock-data";
import { canonicalOfficeCode } from "./mock-data";

export const VIEW_ALL_OFFICES = "ALL";

export function isAdminRole(role?: Role) {
  return role === "AD";
}

/**
 * Toàn hệ thống hay bó theo VP là thuộc tính của tài khoản (scopeAllOffices), không phải chức danh.
 * BE trả officeCode = "ALL" cho tài khoản được cấp phạm vi toàn hệ thống.
 */
export function hasAllOfficeScope(session?: { role?: Role; office?: string | null } | null) {
  if (!session) return false;
  return isAdminRole(session.role) || session.office === VIEW_ALL_OFFICES;
}

export function assignedOfficeCode(office?: string | null) {
  const c = office?.trim() ?? "";
  if (!c || c === VIEW_ALL_OFFICES) return "";
  return c;
}

/** Mã VP nhân viên: session, native shell, user master, hoặc VP đang xem. */
export function resolveAssignedOffice(opts: {
  sessionOffice?: string | null;
  viewOffice?: string | null;
  nativeOffice?: string | null;
  userOffice?: string | null;
}): string {
  for (const raw of [opts.sessionOffice, opts.nativeOffice, opts.userOffice, opts.viewOffice]) {
    const code = canonicalOfficeCode(assignedOfficeCode(raw));
    if (code) return code;
    const fallback = assignedOfficeCode(raw);
    if (fallback) return fallback;
  }
  return "";
}

/** VP đang xem: tài khoản bó VP = VP được gán; tài khoản toàn hệ thống = VP chọn. */
export function resolveViewOffice(
  session: { role: Role; office: string } | null | undefined,
  viewOffice?: string | null,
): string {
  if (!hasAllOfficeScope(session)) {
    return assignedOfficeCode(session?.office);
  }
  if (viewOffice === VIEW_ALL_OFFICES) return VIEW_ALL_OFFICES;
  const picked = assignedOfficeCode(viewOffice);
  if (picked) return picked;
  return VIEW_ALL_OFFICES;
}

export function adminOfficeSelectOptions(offices: { code: string; name: string }[]) {
  return [
    { value: VIEW_ALL_OFFICES, label: "Toàn hệ thống" },
    ...offices.map((o) => ({ value: o.code, label: o.name })),
  ];
}
