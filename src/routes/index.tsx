import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { canRead } from "@/lib/rbac";
import { isMobileViewport } from "@/lib/mobile-tasks";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, hydrated } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      navigate({ to: "/login", replace: true });
      return;
    }
    const mobileHome = isMobileViewport() && canRead(session.role, "tac-vu");
    navigate({ to: mobileHome ? "/tac-vu" : "/dashboard", replace: true });
  }, [session, hydrated, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Đang chuyển hướng…
    </div>
  );
}
