import { apiRequest } from "./client";

export type StaffUserDTO = {
  username: string;
  roleCode: string;
  officeCode: string;
  active: boolean;
  password?: string | null;
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
    },
  });
}
