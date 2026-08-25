// Auth wrapper — delegates to global store; giữ API cũ để không phá màn hiện có.
import { useEffect, type ReactNode } from "react";
import { useStore } from "./store";
import { getToken, isApiEnabled } from "./api/client";
import { fetchAccount, officeFromAccount } from "./api/auth-api";
import { clearApiSession, syncAllFromApi } from "./api/sync";
import { isNativeWebView, NATIVE_AUTH_EVENT } from "./native-shell";

export type Session = { username: string; role: import("./mock-data").Role; office: string };

function nativeOffice() {
  if (typeof window === "undefined") return "";
  return window.__XE_NATIVE_OFFICE__?.trim() ?? "";
}

function seedSessionFromNative() {
  if (typeof window === "undefined") return;
  const office = nativeOffice();
  const username = window.__XE_NATIVE_LOGIN__?.trim() ?? "";
  const role = (window.__XE_NATIVE_ROLE__?.trim() || "DH") as Session["role"];
  if (!office || !username) return;
  const cur = useStore.getState().session;
  if (cur?.office?.trim() && cur.office !== "ALL") return;
  useStore.setState({
    session: {
      username: cur?.username || username,
      role: cur?.role || role,
      office,
    },
    viewOffice: useStore.getState().viewOffice || office,
  });
}

function sessionMissingOffice() {
  const office = useStore.getState().session?.office?.trim();
  return !office || office === "ALL";
}

async function hydrateFromToken(): Promise<boolean> {
  if (!isApiEnabled() || !getToken()) return false;
  try {
    const account = await fetchAccount();
    const role = (account.roleCode ?? "DH") as Session["role"];
    const office =
      officeFromAccount(account) ||
      useStore.getState().session?.office ||
      nativeOffice() ||
      "";
    const assigned = office && office !== "ALL" ? office : "";
    useStore.setState({
      session: {
        username: account.login,
        role,
        office,
      },
      viewOffice: office === "ALL" ? assigned || useStore.getState().viewOffice || "ALL" : assigned,
    });
    await syncAllFromApi();
    return true;
  } catch {
    seedSessionFromNative();
    if (!isNativeWebView()) {
      clearApiSession();
      useStore.setState({ session: null, viewOffice: "" });
    }
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const setOnline = useStore((s) => s.setOnline);
  const expireDrafts = useStore((s) => s.expireDrafts);
  const flushOffline = useStore((s) => s.flushOffline);

  useEffect(() => {
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
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      seedSessionFromNative();
      if (!getToken()) return;
      // Session persist only saves office/role — orders/master stay in memory.
      // After F5 must sync again, otherwise every màn hiện 0 đơn / "Chọn văn phòng".
      if (sessionMissingOffice()) {
        void hydrateFromToken();
        return;
      }
      void import("./api/sync")
        .then((m) => m.syncAllFromApi())
        .catch(() => undefined);
    };
    run();
    window.addEventListener(NATIVE_AUTH_EVENT, run);
    const poll =
      isNativeWebView() && !getToken()
        ? window.setInterval(() => {
            if (getToken()) {
              window.clearInterval(poll);
              run();
            }
          }, 150)
        : 0;
    const stopPoll = poll ? window.setTimeout(() => window.clearInterval(poll), 8000) : 0;
    return () => {
      cancelled = true;
      window.removeEventListener(NATIVE_AUTH_EVENT, run);
      if (poll) window.clearInterval(poll);
      if (stopPoll) window.clearTimeout(stopPoll);
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
