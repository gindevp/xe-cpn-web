import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchMaintenancePolicy,
  isMaintenanceChannelBlocked,
  type MaintenanceChannel,
  type MaintenancePolicy,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { isViewableImageUrl } from "@/components/ImageLightbox";
import { Button } from "@/components/ui/button";

const CHECK_TIMEOUT_MS = 10_000;

async function loadPolicy(): Promise<MaintenancePolicy | null> {
  if (!isApiEnabled()) return null;
  try {
    return await Promise.race([
      fetchMaintenancePolicy(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

function MaintenanceBlock({ policy }: { policy: MaintenancePolicy }) {
  const img = policy.imageUrl && isViewableImageUrl(policy.imageUrl) ? policy.imageUrl : null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-4 text-center">
        {img ? (
          <img
            src={img}
            alt="Bảo trì"
            className="mx-auto max-h-56 w-full rounded-lg object-contain"
          />
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{policy.title}</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{policy.message}</p>
      </div>
    </div>
  );
}

/**
 * Chặn theo kênh bảo trì. Fail-open nếu API lỗi/timeout.
 * bypass=true (admin web NV) → vẫn vào được để tắt bảo trì.
 */
export function MaintenanceGate({
  channel,
  bypass = false,
  children,
}: {
  channel: MaintenanceChannel;
  bypass?: boolean;
  children: ReactNode;
}) {
  const [policy, setPolicy] = useState<MaintenancePolicy | null>(null);
  const [ready, setReady] = useState(false);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      setPolicy(await loadPolicy());
    } finally {
      running.current = false;
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [check]);

  if (!ready) {
    return <div className="min-h-screen bg-background" />;
  }

  const blocked = !bypass && isMaintenanceChannelBlocked(policy, channel);
  if (blocked && policy) {
    return <MaintenanceBlock policy={policy} />;
  }

  return (
    <>
      {bypass && policy && isMaintenanceChannelBlocked(policy, channel) ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          Web nhân viên đang bảo trì — bạn vào được vì là admin.{" "}
          <Link to="/bao-tri" className="font-medium underline">
            Mở Cấu hình
          </Link>
        </div>
      ) : null}
      {children}
    </>
  );
}

/** Guest / public paths — áp WEB_CUSTOMER. Không chặn /login (admin cần đăng nhập). */
const GUEST_EXACT = new Set(["/", "/tra-cuu", "/tao-don"]);

export function WebCustomerMaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, hydrated } = useAuth();
  const apply =
    hydrated &&
    !session &&
    (GUEST_EXACT.has(pathname) || pathname.startsWith("/tra-cuu"));
  if (!apply) return <>{children}</>;
  return <MaintenanceGate channel="WEB_CUSTOMER">{children}</MaintenanceGate>;
}

/** Banner nhỏ cho admin khi đang bypass — dùng lại ở màn bảo trì. */
export function MaintenanceAdminHint({ onOpen }: { onOpen?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span>Web nhân viên đang ở chế độ bảo trì.</span>
      {onOpen ? (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onOpen}>
          Mở cấu hình
        </Button>
      ) : null}
    </div>
  );
}
