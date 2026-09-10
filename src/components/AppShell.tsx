import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { useState, useEffect, useRef, type ReactNode } from "react";
import xeLogo from "@/assets/xe-logo.png";
import {
  LayoutDashboard,
  PackageCheck,
  Tags,
  Building2,
  Users2,
  Plug,
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Plus,
  Repeat,
  CheckCircle2,
  Undo2,
  Ban,
  AlertTriangle,
  Receipt,
  ClipboardList,
  ShieldCheck,
  Banknote,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/mock-data";
import { canRead, useRbacVersion, type ScreenKey } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { GlobalTopBar } from "@/components/GlobalTopBar";
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

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; screen: ScreenKey };
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
      { to: "/cho-ban-giao", label: "Chờ bàn giao", icon: PackageCheck, screen: "cho-ban-giao" },
      {
        to: "/nhap-kho-luan-chuyen",
        label: "Nhập kho - Luân chuyển - Đang giao",
        icon: Repeat,
        screen: "nhap-kho-luan-chuyen",
      },
      {
        to: "/giao-thanh-cong",
        label: "Giao thành công",
        icon: CheckCircle2,
        screen: "giao-thanh-cong",
      },
      {
        to: "/don-hoan",
        label: "Đơn hoàn",
        icon: Undo2,
        screen: "don-hoan",
      },
      {
        to: "/don-huy",
        label: "Đơn huỷ",
        icon: Ban,
        screen: "don-huy",
      },
      {
        to: "/ngoai-le",
        label: "Ngoại lệ - Thất lạc - Hư hỏng",
        icon: AlertTriangle,
        screen: "ngoai-le",
      },
      {
        to: "/ton-kho",
        label: "Tồn kho",
        icon: ClipboardList,
        screen: "ton-kho",
      },
      {
        to: "/kiem-ke",
        label: "Thông tin kiểm kê",
        icon: ClipboardList,
        screen: "kiem-ke",
      },
      {
        to: "/bao-cao-gio",
        label: "Báo cáo đơn theo giờ",
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
  const { session, logout } = useAuth();
  useRbacVersion();
  const navigate = useNavigate();
  const offices = useStore((s) => s.offices);
  const viewOffice = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openCreate, setOpenCreate] = useState(false);
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const admin = hasAllOfficeScope(session);
  const office = resolveViewOffice(session, viewOffice);
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
          <div className="truncate text-sm font-semibold">X.E Việt Nam</div>
          <div className="truncate text-xs opacity-70">Quản lý hàng hóa</div>
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

      {/* Bottom section: office select + user + logout */}
      <div className="border-t border-sidebar-border p-2">
        <div className="space-y-2">
          <SearchableSelect
            value={office}
            onValueChange={setViewOffice}
            disabled={!admin}
            className={cn(
              "h-9 w-full bg-sidebar-accent/40 text-sidebar-foreground",
              collapsed && "hidden",
            )}
            placeholder="Chọn văn phòng"
            options={
              admin
                ? adminOfficeSelectOptions(offices)
                : [
                    ...offices.map((o) => ({ value: o.code, label: o.name })),
                    ...(office && !offices.some((o) => o.code === office)
                      ? [{ value: office, label: office }]
                      : []),
                  ]
            }
          />
          {/* px-1: avatar nằm đúng chỗ của rail nên cũng không nhảy khi thu (như dòng logo). */}
          <div
            className="flex items-center gap-2 rounded-md px-1 py-1.5"
            title={collapsed ? session?.username : undefined}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
              <div className="truncate text-sm font-medium">{session?.username}</div>
              <div className="truncate text-[11px] opacity-70">
                {session ? ROLE_LABELS[session.role] : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenChangePassword(true)}
              className={cn("shrink-0 rounded-md p-1.5 hover:bg-sidebar-accent", collapsed && "hidden")}
              aria-label="Đổi mật khẩu"
              title="Đổi mật khẩu"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className={cn("shrink-0 rounded-md p-1.5 hover:bg-sidebar-accent", collapsed && "hidden")}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <TaoDonDialog open={openCreate} onOpenChange={setOpenCreate} />
      <ChangePasswordDialog open={openChangePassword} onOpenChange={setOpenChangePassword} />
    </aside>
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
  useOrdersPolling(5000, hydrated && !!session);
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
            className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:px-6"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <button
              className="rounded-md p-2 hover:bg-muted md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 shrink-0 truncate text-base font-semibold md:text-lg">{title}</h1>
            {headerExtra && <div className="ml-2 flex min-w-0 flex-1 items-center gap-2">{headerExtra}</div>}
          </header>
        )}
        {/* Desktop: always show search bar. Mobile Task home: compact header actions instead. */}
        {!scanImmersive && (
          <div className={cn(hideTopBarMobile ? "hidden md:block" : "block")}>
            <GlobalTopBar />
          </div>
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
  return (
    <AppShell title={title} headerExtra={headerExtra} hideGlobalTopBarOnMobile={hideGlobalTopBarOnMobile}>
      <OrderHistoryProvider>{children}</OrderHistoryProvider>
    </AppShell>
  );
}
