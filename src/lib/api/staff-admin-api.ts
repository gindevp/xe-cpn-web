import { apiRequest } from "./client";

export type StaffUserDTO = {
  username: string;
  roleCode: string;
  officeCode: string;
  active: boolean;
  password?: string | null;
  /** Permission group (chức danh). Omitted = keep built-in group of roleCode. */
  roleGroupCode?: string | null;
};

export async function listStaffUsers() {
  return apiRequest<StaffUserDTO[]>("/api/staff-admin/users");
}

export async function upsertStaffUser(body: StaffUserDTO) {
  return apiRequest<StaffUserDTO>("/api/staff-admin/users", {
    method: "PUT",
    body: {
      username: body.username,
      roleCode: body.roleCode,
      officeCode: body.officeCode,
      active: body.active,
      password: body.password || undefined,
      roleGroupCode: body.roleGroupCode || undefined,
    },
  });
}

export async function deleteStaffUser(username: string) {
  await apiRequest(`/api/staff-admin/users/${encodeURIComponent(username.trim().toLowerCase())}`, {
    method: "DELETE",
  });
}

/** Đổi mật khẩu tài khoản đang đăng nhập. */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  await apiRequest("/api/account/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}
