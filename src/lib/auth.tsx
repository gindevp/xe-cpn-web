// Auth wrapper — delegates to global store; giữ API cũ để không phá màn hiện có.
import { useEffect, type ReactNode } from "react";
import { useStore } from "./store";
import { getToken, isApiEnabled } from "./api/client";
import { fetchAccount } from "./api/auth-api";
import { clearApiSession, syncAllFromApi } from "./api/sync";

export type Session = { username: string; role: import("./mock-data").Role; office: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const setOnline = useStore((s) => s.setOnline);
  const expireDrafts = useStore((s) => s.expireDrafts);
  const flushOffline = useStore((s) => s.flushOffline);

  useEffect(() => {
    // hydrate zustand persist runs onRehydrateStorage; also run expire on mount
    expireDrafts();
    const on = () => {
      setOnline(true);
      flushOffline();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline, expireDrafts, flushOffline]);

  useEffect(() => {
    if (!isApiEnabled() || !getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const account = await fetchAccount();
        if (cancelled) return;
        useStore.setState({
          session: {
            username: account.login,
            role: (account.roleCode ?? "Q") as Session["role"],
            office: account.officeCode ?? "GP",
          },
        });
        await syncAllFromApi();
      } catch {
        if (!cancelled) {
          clearApiSession();
          useStore.setState({ session: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}

export function useAuth() {
  const session = useStore((s) => s.session);
  const hydrated = useStore((s) => s.hydrated);
  const loginFn = useStore((s) => s.login);
  const logoutFn = useStore((s) => s.logout);
  return {
    session,
    hydrated,
    login: async (username: string, password: string) => {
      if (!username || password.length < 1) return { ok: false as const, error: "Sai thông tin đăng nhập" };
      return loginFn(username, password);
    },
    logout: logoutFn,
  };
}
