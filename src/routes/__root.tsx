import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "../lib/auth";
import { useRealtimeSync } from "../lib/use-realtime-sync";
import { Toaster } from "../components/ui/sonner";
import { WebCustomerMaintenanceGate } from "../components/MaintenanceGate";
import { AutoCallErrorAlert } from "../components/AutoCallErrorAlert";
import { TaxLookupErrorAlert } from "../components/TaxLookupErrorAlert";
import { installStaleChunkReload, isStaleChunkError, reloadForStaleChunk } from "../lib/stale-chunk-reload";

installStaleChunkReload();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Không tìm thấy trang</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trang bạn tìm không tồn tại hoặc đã được di chuyển.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (isStaleChunkError(error) && reloadForStaleChunk()) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Trang không tải được
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Đã xảy ra lỗi. Bạn có thể thử lại hoặc về trang chủ.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Thử lại
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}

const ADMIN_PREVIEW =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bf4bf033-7cf4-4b36-9f27-deb64ff427fc/id-preview-8ff23485--ef0c18a9-84ec-4e22-ab7e-569856a409cd.lovable.app-1784021441564.png";
const PICKUP_PREVIEW = "https://xe-cpn-web.vercel.app/og-lay-hang.png";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) => {
    const path = matches[matches.length - 1]?.pathname ?? "";
    const pickup = path.startsWith("/man-hinh-qr") || path.startsWith("/lay-hang");
    const title = path.startsWith("/lay-hang")
      ? "Tra cứu đơn lấy hàng — X.E Việt Nam"
      : pickup
        ? "Màn hình QR lấy hàng — X.E Việt Nam"
        : "X.E Việt Nam — Quản lý hàng hóa";
    const description = path.startsWith("/lay-hang")
      ? "Tra cứu đơn đến lấy sau khi quét mã QR tại quầy."
      : pickup
        ? "Mở trên máy tại quầy để chiếu mã QR. Khách quét mã để tra cứu đơn đến lấy."
        : "Hệ thống quản lý hàng hóa X.E Việt Nam: tạo đơn, chốt quầy, điều phối chuyến, giao nhận và đối soát.";
    const image = pickup ? PICKUP_PREVIEW : ADMIN_PREVIEW;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Ở root (không trong AppShell) để stream SSE không bị huỷ/mở lại mỗi lần chuyển trang. */
function RealtimeSync() {
  const { session, hydrated } = useAuth();
  useRealtimeSync(hydrated && !!session);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSync />
        <AutoCallErrorAlert />
        <TaxLookupErrorAlert />
        <WebCustomerMaintenanceGate>
          <Outlet />
        </WebCustomerMaintenanceGate>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
