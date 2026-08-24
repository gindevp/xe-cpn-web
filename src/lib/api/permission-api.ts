import { apiRequest } from "./client";

export type ScreenMeta = {
  key: string;
  label: string;
  module: string;
  /** Màn có route nhưng chưa nối vào menu/luồng nào — mặc định ẩn khỏi ma trận. */
  hidden?: boolean;
};

export type PermLevel = "Y" | "R" | "N";

export type PermissionGroup = {
  code: string;
  name: string;
  description?: string | null;
  baseRoleCode?: string | null;
  builtin?: boolean;
  active?: boolean;
  /** Admin group — full access, not editable. */
  locked?: boolean;
  screens: Record<string, PermLevel>;
  staffCount?: number;
};

export async function listScreens() {
  return apiRequest<ScreenMeta[]>("/api/permissions/screens");
}

export async function listPermissionGroups() {
  return apiRequest<PermissionGroup[]>("/api/permission-groups");
}

export async function createPermissionGroup(body: PermissionGroup) {
  return apiRequest<PermissionGroup>("/api/permission-groups", { method: "POST", body });
}

export async function updatePermissionGroup(code: string, body: PermissionGroup) {
  return apiRequest<PermissionGroup>(`/api/permission-groups/${encodeURIComponent(code)}`, {
    method: "PUT",
    body,
  });
}

export async function deletePermissionGroup(code: string) {
  return apiRequest<void>(`/api/permission-groups/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}
