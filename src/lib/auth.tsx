// Auth wrapper — delegates to global store; giữ API cũ để không phá màn hiện có.
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { useStore } from "./store";
import { ApiError, getToken, isApiEnabled } from "./api/client";
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
  } catch (e) {
    seedSessionFromNative();
    if (e instanceof ApiError && e.status === 401) {
      if (!isNativeWebView()) {
        clearApiSession();
        useStore.setState({ session: null, viewOffice: "" });
      }
      return false;
    }
    // Lỗi mạng / cold-start: giữ JWT + session persist để retry; đừng logout oan.
    if (!isNativeWebView() && !(e instanceof ApiError && e.status >= 500)) {
      // 403/4xx khác: vẫn thử sync bằng session persist
    }
    throw e;
  }
}

async function bootSyncAfterHydrate(attempt = 1): Promise<void> {
  seedSessionFromNative();
  if (!isApiEnabled() || !getToken()) return;

  try {
    if (sessionMissingOffice() || !useStore.getState().session) {
      const ok = await hydrateFromToken();
      if (ok) return;
      // Token còn nhưng account fail không phải 401 — thử sync trực tiếp nếu còn session.
      if (!getToken() || !useStore.getState().session) return;
    }
    await syncAllFromApi();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      if (!isNativeWebView()) {
        clearApiSession();
        useStore.setState({ session: null, viewOffice: "" });
      }
      return;
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 600 * attempt));
      return bootSyncAfterHydrate(attempt + 1);
    }
    console.warn("[auth] sync after F5 failed", e);
    toast.error("Không tải được dữ liệu — thử F5 lại hoặc kiểm tra mạng");
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
    let started = false;

    const run = () => {
      if (cancelled || started) return;
      started = true;
      void bootSyncAfterHydrate(1);
    };

    // Đợi zustand persist đọc session từ localStorage — tránh sync lúc session còn null (F5 trống đơn).
    const persistApi = useStore.persist;
    const unsub = persistApi.onFinishHydration(() => {
      if (!cancelled) run();
    });
    if (persistApi.hasHydrated()) {
      run();
    }

    const runNative = () => {
      if (cancelled) return;
      started = false; // cho phép sync lại khi native inject token
      run();
    };

    window.addEventListener(NATIVE_AUTH_EVENT, runNative);
    const poll =
      isNativeWebView() && !getToken()
        ? window.setInterval(() => {
            if (getToken()) {
              window.clearInterval(poll);
              runNative();
            }
          }, 150)
        : 0;
    const stopPoll = poll ? window.setTimeout(() => window.clearInterval(poll), 8000) : 0;
    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener(NATIVE_AUTH_EVENT, runNative);
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
