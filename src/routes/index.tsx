import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { isNativeWebView } from "@/lib/native-shell";
import { getToken } from "@/lib/api/client";
import xeLogo from "@/assets/xe-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "X.E Việt Nam" },
      {
        name: "description",
        content: "X.E Việt Nam — tạo đơn và tra cứu vận đơn.",
      },
    ],
  }),
  component: IndexPage,
});

function GuestLanding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] px-6">
      <div className="flex w-full max-w-[280px] flex-col items-center">
        <div className="flex flex-col items-center">
          <img
            src={xeLogo}
            alt=""
            className="h-[122px] w-[122px] object-contain"
            width={122}
            height={122}
          />
          <p className="mt-1 text-[17px] font-bold leading-none tracking-[0.04em] text-primary">
            X.EVIETNAM
          </p>
        </div>

        <div className="mt-10 flex w-full flex-col gap-3">
          <Link
            to="/tao-don"
            className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <span className="text-xl leading-none" aria-hidden>
              +
            </span>
            Tạo đơn
          </Link>
          <Link
            to="/tra-cuu"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border-2 border-primary bg-white text-base font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            Tra cứu đơn
          </Link>
        </div>
      </div>
    </div>
  );
}

function IndexPage() {
  const { session, hydrated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!session) return;

    if (isNativeWebView()) {
      navigate({ to: "/native", replace: true });
      return;
    }

    if (session.role === "KT") {
      navigate({ to: "/danh-sach-phieu-thu", replace: true });
      return;
    }
    if (session.role === "AD") {
      navigate({ to: "/tai-khoan", replace: true });
      return;
    }
    if (session.role === "TX" || session.role === "NV") {
      navigate({ to: "/tac-vu", replace: true });
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }, [hydrated, session, navigate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
        Đang tải…
      </div>
    );
  }

  // Native WebView: wait for token injection before showing guest landing.
  if (!session && isNativeWebView() && !getToken()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
        Đang kết nối ứng dụng…
      </div>
    );
  }

  if (!session) {
    return <GuestLanding />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
      Đang chuyển hướng…
    </div>
  );
}
