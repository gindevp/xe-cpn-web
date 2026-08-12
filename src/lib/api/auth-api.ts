import { apiRequest, setToken } from "./client";
import type { Role } from "../mock-data";

export type AccountDTO = {
  login: string;
  roleCode?: string;
  officeCode?: string;
  staffDisplayName?: string;
  authorities?: string[];
};

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
  return apiRequest<AccountDTO>("/api/account");
}

export async function loginWithApi(
  username: string,
  password: string,
): Promise<{ ok: true; role: Role; office: string; username: string } | { ok: false; error: string }> {
  try {
    await authenticate(username.trim().toLowerCase(), password);
    const account = await fetchAccount();
    const role = (account.roleCode ?? "Q") as Role;
    const office = account.officeCode ?? "GP";
    return { ok: true, role, office, username: account.login };
  } catch (e: any) {
    setToken(null);
    const status = e?.status;
    if (status === 401) return { ok: false, error: "Sai thông tin đăng nhập" };
    return { ok: false, error: e?.message || "Không kết nối được máy chủ" };
  }
}
