import { ACCOUNT_LOCKED_MESSAGE, apiRequest, isAccountLockedError, setToken } from "./client";
import type { Role } from "../mock-data";
import { setRuntimePermissions } from "../rbac";
import { setAllowedOffices } from "../allowed-offices";

export type AccountDTO = {
  login: string;
  roleCode?: string;
  officeCode?: string;
  office?: { code?: string } | string;
  staffDisplayName?: string;
  authorities?: string[];
  roleGroupCode?: string;
  permissions?: Record<string, string>;
  officeId?: number | null;
  allowedOffices?: AllowedOffice[];
};

export type AllowedOffice = { id: number; code: string; name: string };

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
  setAllowedOffices(account.allowedOffices ?? [], account.officeId ?? null);
  return account;
}

/** Chuyển VP đang dùng; BE lưu lại nên F5 / app mở lại vẫn ở VP này. */
export async function switchActiveOffice(officeId: number): Promise<AccountDTO> {
  const account = await apiRequest<AccountDTO>("/api/account/active-office", {
    method: "PUT",
    body: { officeId },
  });
  setAllowedOffices(account.allowedOffices ?? [], account.officeId ?? null);
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
    if (isAccountLockedError(e)) return { ok: false, error: ACCOUNT_LOCKED_MESSAGE };
    if (status === 401) return { ok: false, error: "Sai thông tin đăng nhập" };
    return { ok: false, error: e?.message || "Không kết nối được máy chủ" };
  }
}
