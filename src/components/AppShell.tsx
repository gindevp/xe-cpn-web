import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { useState, useEffect, useRef, type ReactNode } from "react";
import xeLogo from "@/assets/xe-logo.png";
import {
  LayoutDashboard,
  Tags,
  Building2,
  Users2,
  Plug,
  Menu,
  X,
  LogOut,
  Plus,
  Receipt,
  ClipboardList,
  ShieldCheck,
  Banknote,
  KeyRound,
  ChevronDown,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, officeName } from "@/lib/mock-data";
import { canRead, useRbacVersion, type ScreenKey } from "@/lib/rbac";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { GlobalTopBar, GlobalHeaderSearch } from "@/components/GlobalTopBar";
import { TaoDonDialog } from "@/components/TaoDonDialog";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useStore } from "@/lib/store";
import { hasAllOfficeScope, resolveViewOffice, VIEW_ALL_OFFICES, adminOfficeSelectOptions } from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { isNativeWebView } from "@/lib/native-shell";
import { useOrdersPolling } from "@/lib/use-orders-poll";
import { OrderHistoryProvider } from "@/components/OrderHistoryDialog";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { getToken } from "@/lib/api/client";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  screen: ScreenKey;
  shortLabel?: string;
};
type NavGroup = { title: string; items: NavItem[] };

/** Bề rộng thanh rail khi thu gọn — vừa đủ thấy icon để hover vào. */
const SIDEBAR_RAIL_W = "w-14";
/** Trễ khi rời chuột để menu không giật khi đi chéo qua. */
const SIDEBAR_CLOSE_DELAY_MS = 140;

/** Desktop: mặc định thu gọn thành rail icon, hover thì sổ ra và đẩy nội dung như bấm nút menu. */
function useDesktopSidebarHover() {
  const [hovering, setHovering] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  useEffect(() => clearCloseTimer, []);

  const openByHover = () => {
    clearCloseTimer();
    setHovering(true);
  };
  const closeSoon = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setHovering(false), SIDEBAR_CLOSE_DELAY_MS);
  };

  return {
    expanded: hovering,
    hoverHandlers: {
      onMouseEnter: openByHover,
      onMouseLeave: closeSoon,
      onFocusCapture: openByHover,
      onBlurCapture: closeSoon,
    },
  };
}

const GROUPS: NavGroup[] = [
  {
    title: "Dashboard",
    items: [{ to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, screen: "dashboard" }],
  },
  {
    title: "Hoạt động",
    items: [
      // 5 mục đầu (Chờ bàn giao → Ngoại lệ) chỉ trên top bar — không lặp sidebar
      {
        to: "/kiem-ke",
        label: "Thông tin kiểm kê",
        icon: ClipboardList,
        screen: "kiem-ke",
      },
      {
        to: "/bao-cao-gio",
        label: "Báo cáo theo giờ",
        icon: ClipboardList,
        screen: "bao-cao-gio",
      },
    ],
  },
  {
    title: "Tài chính",
    items: [
      {
        to: "/phieu-thu",
        label: "Phiếu thu",
        icon: Receipt,
        screen: "phieu-thu",
      },
      {
        to: "/danh-sach-phieu-thu",
        label: "Danh sách phiếu thu",
        icon: ClipboardList,
        screen: "danh-sach-phieu-thu",
      },
      {
        to: "/quan-ly-don-cod",
        label: "Quản lý đơn COD",
        icon: Banknote,
        screen: "quan-ly-don-cod",
      },
    ],
  },
  {
    title: "Quản trị",
    items: [
      { to: "/bang-gia", label: "Bảng giá", icon: Tags, screen: "bang-gia" },
      { to: "/phu-phi", label: "Cài đặt phụ phí", icon: Tags, screen: "phu-phi" },
      { to: "/master", label: "Master dữ liệu", icon: Building2, screen: "master" },
      { to: "/tai-khoan", label: "Tài khoản", icon: Users2, screen: "tai-khoan" },
      { to: "/nhom-quyen", label: "Nhóm quyền", icon: ShieldCheck, screen: "nhom-quyen" },
      { to: "/tich-hop", label: "Tích hợp", icon: Plug, screen: "tich-hop" },
      { to: "/bao-tri", label: "Bảo trì", icon: Wrench, screen: "bao-tri" },
    ],
  },
];

function Sidebar({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void;
  /** Desktop: đang ở dạng rail (chỉ thấy icon) */
  collapsed?: boolean;
}) {
  const { session } = useAuth();
  useRbacVersion();
  const viewOffice = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openCreate, setOpenCreate] = useState(false);
  const admin = hasAllOfficeScope(session);
  const orders = useStore((s) => s.orders);
  // Đếm theo đúng phạm vi màn Chờ bàn giao (admin thấy tất cả, còn lại chỉ VP mình).
  const navBadges: Record<string, number> = {
    "/cho-ban-giao": pendingHandoverOrders(orders, { allOffices: admin, office: session?.office })
      .length,
  };

  useEffect(() => {
    if (!session) return;
    if (!admin) {
      const assigned = resolveViewOffice(session, "");
      if (assigned && viewOffice !== assigned) setViewOffice(assigned);
      return;
    }
    if (!viewOffice) setViewOffice(VIEW_ALL_OFFICES);
  }, [session, admin, viewOffice, setViewOffice]);

  return (
    // Chiều rộng do khung ngoài animate; aside chỉ ăn theo để không có 2 transition width lệch nhịp.
    <aside className="flex h-screen w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* pl-2.5 = đúng vị trí logo khi đã thu thành rail (w-14, logo 36px) nên logo đứng yên suốt lúc
          thu/mở, y như các icon menu. Dùng justify-center thì lúc chữ vừa ẩn logo nhảy ra giữa panel
          còn rộng rồi mới trượt về — chính là cảm giác khựng. */}
      <div className="flex items-center gap-2 border-b border-sidebar-border py-4 pl-2.5 pr-3">
        <img src={xeLogo} alt="X.E" className="h-9 w-9 shrink-0 rounded-md" />
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <div className="truncate text-base font-semibold tracking-tight">X.E Việt Nam</div>
          <div className="truncate text-[13px] opacity-70">Quản lý hàng hóa</div>
        </div>
      </div>

      {/* Create order button (above dashboard) */}
      <div className="px-2 pt-3">
        {/* Icon "+" neo ở cùng cột với icon menu (justify-start pl-3) để lúc thu nó không bị
            nhảy ra giữa nút rồi trượt về như trước. */}
        <Button
          size="sm"
          className="w-full justify-start gap-1.5 pl-3 pr-2"
          onClick={() => setOpenCreate(true)}
          title="Tạo đơn hàng"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className={cn("truncate", collapsed && "hidden")}>Tạo đơn hàng</span>
        </Button>
      </div>

      <nav className="sidebar-nav-scroll flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((g) => {
          const visible = g.items.filter((i) => canRead(session?.role, i.screen));
          if (!visible.length) return null;
          return (
            <div key={g.title} className="mb-4">
              <div
                className={cn(
                  "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider opacity-60",
                  collapsed && "hidden",
                )}
              >
                {g.title}
              </div>
              <ul className="space-y-0.5">
                {visible.map((i) => {
                  const active =
                    pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to + "/"));
                  const Icon = i.icon;
                  const badge = navBadges[i.to] ?? 0;
                  return (
                    <li key={i.to}>
                      <Link
                        to={i.to}
                        onClick={onNavigate}
                        title={badge > 0 ? `${i.label} (${badge})` : i.label}
                        className={cn(
                          // px-3 cho cả hai trạng thái: rail (w-14, nav px-2) còn đúng 40px nên icon 16px
                          // với px-3 là đã căn giữa sẵn. Nếu đổi sang justify-center thì lúc nhãn vừa ẩn,
                          // icon nhảy ra giữa panel còn rộng rồi trượt về suốt 200ms — nav trôi chậm hơn logo.
                          "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className={cn("truncate", collapsed && "hidden")}>{i.label}</span>
                        {badge > 0 ? (
                          <span
                            className={cn(
                              "rounded-full text-[10px] font-semibold leading-4",
                              // Rail chỉ có icon nên số đè lên góc icon — neo theo lề trái (icon ở x=12)
                              // chứ không theo lề phải, vì lề phải chạy theo bề rộng panel đang co.
                              collapsed ? "absolute left-4 top-0.5 px-1" : "ml-auto shrink-0 px-1.5",
                              active
                                ? "bg-sidebar-primary-foreground/25 text-sidebar-primary-foreground"
                                : "bg-sidebar-primary text-sidebar-primary-foreground",
                            )}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <TaoDonDialog open={openCreate} onOpenChange={setOpenCreate} />
    </aside>
  );
}

function HeaderAccount() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const offices = useStore((s) => s.offices);
  const viewOffice = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const admin = hasAllOfficeScope(session);
  const officeCode = resolveViewOffice(session, viewOffice);
  const officeLabel =
    !officeCode || officeCode === VIEW_ALL_OFFICES
      ? "Toàn hệ thống"
      : offices.find((o) => o.code === officeCode)?.name || officeName(officeCode) || officeCode;
  const roleLabel = session ? ROLE_LABELS[session.role] ?? session.role : "";
  const initial = (session?.username?.trim()?.[0] || "?").toLocaleUpperCase("vi-VN");

  if (!session) return null;

  return (
    <div className="flex min-w-0 max-w-[min(72vw,32rem)] items-center gap-2.5 sm:max-w-[36rem]">
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right sm:flex-nowrap sm:gap-x-3">
        {admin ? (
          <SearchableSelect
            value={officeCode || VIEW_ALL_OFFICES}
            onValueChange={setViewOffice}
            options={adminOfficeSelectOptions(offices)}
            placeholder="Chọn văn phòng"
            searchPlaceholder="Tìm văn phòng…"
            className="h-auto min-h-0 w-auto max-w-[min(100%,14rem)] justify-end gap-1 border-0 bg-transparent px-1 py-0.5 text-[15px] font-semibold tracking-tight text-slate-900 shadow-none hover:bg-slate-50 focus-visible:ring-0 sm:max-w-[16rem] sm:text-base [&>span]:line-clamp-1 [&>span]:text-right [&>svg]:ml-0 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-50"
            contentClassName="w-72 min-w-[16rem]"
          />
        ) : (
          <div
            className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-900 sm:max-w-[16rem] sm:text-base"
            title={officeLabel}
          >
            {officeLabel}
          </div>
        )}
        <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-lg py-0.5 pl-1 pr-0.5 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#274EA1]/25"
              title={`${session.username} · ${roleLabel}`}
            >
              <div className="hidden min-w-0 truncate text-[13px] leading-snug text-slate-500 sm:block sm:text-sm">
                <span className="font-medium text-slate-700">{session.username}</span>
                <span className="text-slate-400"> · {roleLabel}</span>
              </div>
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8EEF8] text-sm font-semibold text-[#274EA1] ring-1 ring-[#274EA1]/15"
                aria-hidden
              >
                {initial}
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 sm:block" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 sm:hidden">
              <div className="truncate text-sm font-medium text-foreground">{session.username}</div>
              <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
            </div>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem onSelect={() => setOpenChangePassword(true)}>
              <KeyRound className="mr-2 h-4 w-4" /> Đổi mật khẩu
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                logout();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ChangePasswordDialog open={openChangePassword} onOpenChange={setOpenChangePassword} />
    </div>
  );
}

function NativeSyncing() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Đang đồng bộ đăng nhập…
    </div>
  );
}

function useNativeAuthWait() {
  const [readyToRedirect, setReadyToRedirect] = useState(!isNativeWebView());
  useEffect(() => {
    if (!isNativeWebView()) return;
    const t = window.setTimeout(() => setReadyToRedirect(true), 5000);
    return () => window.clearTimeout(t);
  }, []);
  return readyToRedirect;
}

export function AppShell({
  title,
  headerExtra,
  hideGlobalTopBarOnMobile,
  children,
}: {
  title: string;
  headerExtra?: ReactNode;
  hideGlobalTopBarOnMobile?: boolean;
  children: ReactNode;
}) {
  const { session, hydrated } = useAuth();
  useOrdersPolling(4000, hydrated && !!session);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const { expanded: sidebarExpanded, hoverHandlers } = useDesktopSidebarHover();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideTopBarMobile = hideGlobalTopBarOnMobile || pathname === "/tac-vu";
  /** Web: full-bleed camera UI. App: vẫn giữ header/tab native. */
  const scanImmersive = pathname === "/quet-nhap";
  const [nativeShell, setNativeShell] = useState(false);
  const nativeAuthWaitDone = useNativeAuthWait();

  useEffect(() => {
    const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
    const native = !!w.ReactNativeWebView;
    setNativeShell(native);
    document.documentElement.classList.toggle("xe-native-shell", native);
    document.documentElement.classList.toggle("xe-scan-immersive", scanImmersive);
    if (native) {
      w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "SCAN_LAYOUT", immersive: false }));
    }
    return () => {
      document.documentElement.classList.remove("xe-scan-immersive");
      if (native) {
        w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "SCAN_LAYOUT", immersive: false }));
      }
    };
  }, [scanImmersive]);

  if (!hydrated) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!session) {
    if (isNativeWebView() && (!nativeAuthWaitDone || getToken())) {
      return <NativeSyncing />;
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <div
      className={cn(
        "flex overflow-hidden bg-background",
        nativeShell ? "h-full min-h-0" : "h-screen",
      )}
    >
      {/* Desktop sidebar — mặc định thu gọn thành rail, hover sổ ra và đẩy nội dung y như bấm nút
          menu trước đây (không dùng trong WebView app). Một khối duy nhất animate width nên logo và
          nav luôn cùng nhịp, không còn panel phủ lên page. */}
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out md:block",
          nativeShell && "!hidden",
          sidebarExpanded ? "w-64" : SIDEBAR_RAIL_W,
        )}
        {...hoverHandlers}
      >
        <Sidebar collapsed={!sidebarExpanded} />
      </div>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Đóng menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!scanImmersive && (
          <header
            className="sticky top-0 z-30 shrink-0 border-b border-slate-200/90 bg-card"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 md:h-14 md:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  className="rounded-md p-2 hover:bg-muted md:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Mở menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-slate-900 md:text-xl">
                  {title}
                </h1>
                {headerExtra && (
                  <div className="ml-1 hidden min-w-0 items-center gap-2 sm:flex">{headerExtra}</div>
                )}
              </div>
              <div className="flex justify-center">
                <GlobalHeaderSearch />
              </div>
              <div className="flex min-w-0 justify-end">
                <HeaderAccount />
              </div>
            </div>
            {/* Một dải tab phẳng dưới title — không khung/nền phụ. */}
            <div className={cn("border-t border-slate-100", hideTopBarMobile ? "hidden md:block" : "block")}>
              <GlobalTopBar />
            </div>
          </header>
        )}
        <main
          className={cn(
            "min-w-0 flex-1 overflow-y-auto",
            scanImmersive
              ? "flex min-h-0 flex-col p-0"
              : "px-3 py-4 md:px-6 md:py-6 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-6",
          )}
        >
          {children}
        </main>
        {!scanImmersive && (
          <MobileBottomNav
            onCreateOrder={() => setOpenCreate(true)}
            onOpenMenu={() => setMobileOpen(true)}
          />
        )}
        <TaoDonDialog open={openCreate} onOpenChange={setOpenCreate} />
      </div>
    </div>
  );
}

export function ProtectedPage({
  title,
  screen,
  headerExtra,
  hideGlobalTopBarOnMobile,
  children,
}: {
  title: string;
  screen: ScreenKey;
  headerExtra?: ReactNode;
  hideGlobalTopBarOnMobile?: boolean;
  children: ReactNode;
}) {
  const { session, hydrated } = useAuth();
  const nativeAuthWaitDone = useNativeAuthWait();
  useRbacVersion();
  if (!hydrated) return <div className="min-h-screen bg-background" />;
  if (!session) {
    if (isNativeWebView() && (!nativeAuthWaitDone || getToken())) {
      return <NativeSyncing />;
    }
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  if (!canRead(session.role, screen)) {
    return (
      <AppShell title={title}>
        <div className="rounded-lg border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">Không có quyền truy cập</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Vai trò {ROLE_LABELS[session.role]} không thể xem màn này.
          </p>
        </div>
      </AppShell>
    );
  }
  const adminBypass = session.role === "AD";
  return (
    <MaintenanceGate channel="WEB_STAFF" bypass={adminBypass}>
      <AppShell title={title} headerExtra={headerExtra} hideGlobalTopBarOnMobile={hideGlobalTopBarOnMobile}>
        <OrderHistoryProvider>{children}</OrderHistoryProvider>
      </AppShell>
    </MaintenanceGate>
  );
}
