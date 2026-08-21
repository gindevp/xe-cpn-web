import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isNativeWebView } from "@/lib/native-shell";
import { getToken } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import xeLogo from "@/assets/xe-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Đăng nhập — X.E Việt Nam" },
      { name: "description", content: "Đăng nhập nội bộ hệ thống X.E Việt Nam — nền tảng quản lý vận tải đa công ty." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, hydrated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giveUpNative, setGiveUpNative] = useState(false);

  useEffect(() => {
    if (!isNativeWebView()) return;
    const t = window.setTimeout(() => setGiveUpNative(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  const routeForRole = (role: string): string => {
    switch (role) {
      case "Q": return "/van-don";
      case "BX": return "/chuyen";
      case "G": return "/giao-tan-nha";
      case "KT": return "/bao-cao-thu";
      case "AD": return "/tai-khoan";
      default: return "/dashboard";
    }
  };


  useEffect(() => {
    if (!hydrated) return;
    if (session) {
      navigate({ to: isNativeWebView() ? "/tac-vu" : routeForRole(session.role), replace: true });
    }
  }, [hydrated, session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Vui lòng nhập đầy đủ tài khoản và mật khẩu. (E-AUTH-001)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 200));
      const r = await login(username, password);
      if (!r.ok) {
        setError(`${r.error} (E-AUTH-001)`);
      } else {
        toast.success("Đăng nhập thành công");
        navigate({ to: isNativeWebView() ? "/tac-vu" : routeForRole(r.role) });
      }
    } finally {
      setLoading(false);
    }
  };

  if (isNativeWebView() && (session || getToken()) && !error && !giveUpNative) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Đang vào hệ thống…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left brand panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(1200px 600px at -10% -20%, rgba(59,111,209,0.35), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(39,78,161,0.45), transparent 55%)",
          }}
        />
        <header className="relative z-10 flex items-center gap-3 px-10 pt-10">
          <img src={xeLogo} alt="X.E Việt Nam" className="h-10 w-10 rounded-md" />
          <div className="text-base font-semibold tracking-tight">X.E Việt Nam</div>
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-center px-10">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Nền tảng quản lý vận tải đa công ty
          </h1>
          <p className="mt-4 max-w-md text-sm text-sidebar-foreground/70">
            Điều phối chuyến, quản lý vận đơn, đội xe, tuân thủ và tài chính — tất cả trên một hệ thống enterprise-grade.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            <Stat n="15+" label="Phân hệ nghiệp vụ" />
            <Stat n="14" label="Vai trò RBAC" />
            <Stat n="24/7" label="Theo dõi thời gian thực" />
          </div>
        </div>

        <footer className="relative z-10 px-10 pb-8 text-xs text-sidebar-foreground/60">
          © {new Date().getFullYear()} X.E Việt Nam — Enterprise SaaS
        </footer>
      </aside>

      {/* Right form panel */}
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={xeLogo} alt="X.E Việt Nam" className="h-10 w-10 rounded-md" />
            <div>
              <div className="text-base font-semibold">X.E Việt Nam</div>
              <div className="text-xs text-muted-foreground">Quản lý vận tải hàng hóa</div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Đăng nhập</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sử dụng tài khoản phân hệ vận tải</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u">Tài khoản / Email</Label>
              <Input
                id="u"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="vd: quay.hn"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="p"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Ẩn" : "Hiện"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Đăng nhập
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Khách hàng: tạo đơn tại <a href="/tao-don" className="text-primary underline">/tao-don</a>{" "}
            · tra cứu tại <a href="/tra-cuu" className="text-primary underline">/tra-cuu</a>
          </p>
        </div>
      </main>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <div className="text-2xl font-bold text-white">{n}</div>
      <div className="mt-0.5 text-[11px] text-sidebar-foreground/70">{label}</div>
    </div>
  );
}
