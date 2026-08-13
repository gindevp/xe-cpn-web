import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";
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
  RotateCcw,
  Undo2,
  Ban,
  AlertTriangle,
  Receipt,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/mock-data";
import { canRead, type ScreenKey } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { GlobalTopBar } from "@/components/GlobalTopBar";
import { TaoDonDialog } from "@/components/TaoDonDialog";
import { useStore } from "@/lib/store";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; screen: ScreenKey };
type NavGroup = { title: string; items: NavItem[] };

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
        to: "/cho-giao-lai",
        label: "Chờ giao lại",
        icon: RotateCcw,
        screen: "cho-giao-lai",
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
    ],
  },
  {
    title: "Quản trị",
    items: [
      { to: "/bang-gia", label: "Bảng giá", icon: Tags, screen: "bang-gia" },
      { to: "/phu-phi", label: "Cài đặt phụ phí", icon: Tags, screen: "phu-phi" },
      { to: "/master", label: "Master dữ liệu", icon: Building2, screen: "master" },
      { to: "/tai-khoan", label: "Tài khoản", icon: Users2, screen: "tai-khoan" },
      { to: "/tich-hop", label: "Tích hợp", icon: Plug, screen: "tich-hop" },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const offices = useStore((s) => s.offices);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [office, setOffice] = useState(session?.office ?? offices[0]?.code ?? "");
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-4">
        <img src={xeLogo} alt="X.E" className="h-9 w-9 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">X.E Việt Nam</div>
          <div className="truncate text-xs opacity-70">Quản lý hàng hóa</div>
        </div>
      </div>

      {/* Create order button (above dashboard) */}
      <div className="px-2 pt-3">
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={() => setOpenCreate(true)}
          title="Tạo đơn hàng"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo đơn hàng</span>
        </Button>
      </div>

      <nav className="sidebar-nav-scroll flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((g) => {
          const visible = g.items.filter((i) => canRead(session?.role, i.screen));
          if (!visible.length) return null;
          return (
            <div key={g.title} className="mb-4">
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider opacity-60">
                {g.title}
              </div>
              <ul className="space-y-0.5">
                {visible.map((i) => {
                  const active =
                    pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to + "/"));
                  const Icon = i.icon;
                  return (
                    <li key={i.to}>
                      <Link
                        to={i.to}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{i.label}</span>
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
            onValueChange={setOffice}
            className="h-9 w-full bg-sidebar-accent/40 text-sidebar-foreground"
            placeholder="Chọn văn phòng"
            options={offices.map((o) => ({ value: o.code, label: o.name }))}
          />
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{session?.username}</div>
              <div className="truncate text-[11px] opacity-70">
                {session ? ROLE_LABELS[session.role] : ""}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="shrink-0 rounded-md p-1.5 hover:bg-sidebar-accent"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <TaoDonDialog open={openCreate} onOpenChange={setOpenCreate} />
    </aside>
  );
}

export function AppShell({ title, headerExtra, children }: { title: string; headerExtra?: ReactNode; children: ReactNode }) {
  const { session, hydrated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!hydrated) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!session) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:px-6">
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
        <GlobalTopBar />
        <main className="min-w-0 flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}

export function ProtectedPage({
  title,
  screen,
  headerExtra,
  children,
}: {
  title: string;
  screen: ScreenKey;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const { session, hydrated } = useAuth();
  if (!hydrated) return <div className="min-h-screen bg-background" />;
  if (!session) {
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
  return <AppShell title={title} headerExtra={headerExtra}>{children}</AppShell>;
}
