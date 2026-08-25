import { apiRequest, setToken } from "./client";
import type { Role } from "../mock-data";
import { setRuntimePermissions } from "../rbac";

export type AccountDTO = {
  login: string;
  roleCode?: string;
  officeCode?: string;
  office?: { code?: string } | string;
  staffDisplayName?: string;
  authorities?: string[];
  roleGroupCode?: string;
  permissions?: Record<string, string>;
};

export function officeFromAccount(account: AccountDTO): string {
  if (account.officeCode?.trim()) return account.officeCode.trim();
  if (typeof account.office === "string" && account.office.trim()) return account.office.trim();
  if (account.office && typeof account.office === "object" && account.office.code?.trim()) {
    return account.office.code.trim();
  }
  return "";
}

export async function authenticate(username: string, password: string): Promise<string> {
  const data = await apiRequest<{ id_token: string }>("/api/authenticate", {
    method: "POST",
    auth: false,
    body: { username, password, rememberMe: true },
  });
  setToken(data.id_token);
  return data.id_token;
}

export async function fetchAccount(): Promise<AccountDTO> {
  const account = await apiRequest<AccountDTO>("/api/account");
  setRuntimePermissions(account.permissions, (account.authorities ?? []).includes("ROLE_ADMIN"));
  return account;
}

export async function loginWithApi(
  username: string,
  password: string,
): Promise<{ ok: true; role: Role; office: string; username: string } | { ok: false; error: string }> {
  try {
    await authenticate(username.trim().toLowerCase(), password);
    const account = await fetchAccount();
    const role = (account.roleCode ?? "DH") as Role;
    const office = officeFromAccount(account);
    return { ok: true, role, office, username: account.login };
  } catch (e: any) {
    setToken(null);
    const status = e?.status;
    if (status === 401) return { ok: false, error: "Sai thông tin đăng nhập" };
    return { ok: false, error: e?.message || "Không kết nối được máy chủ" };
  }
}
