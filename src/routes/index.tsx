import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, hydrated } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!hydrated) return;
    navigate({ to: session ? "/dashboard" : "/login", replace: true });
  }, [session, hydrated, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Đang chuyển hướng…
    </div>
  );
}
