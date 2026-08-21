import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  PackageCheck,
  PackagePlus,
  PlusCircle,
} from "lucide-react";
import type { ScreenKey } from "@/lib/rbac";

export type MobileTaskCard = {
  id: string;
  label: string;
  to: string;
  screen: ScreenKey;
  icon: LucideIcon;
};

/** Task cards — mapped in docs/MOBILE_TASK_MAPPING.md */
export const MOBILE_TASK_CARDS: MobileTaskCard[] = [
  {
    id: "len-hang",
    label: "Lên hàng",
    to: "/hang-cho-len-xe",
    screen: "hang-cho-len-xe",
    icon: ArrowUpFromLine,
  },
  {
    id: "xuong-hang",
    label: "Xuống hàng",
    to: "/quet-nhap",
    screen: "quet-nhap",
    icon: ArrowDownToLine,
  },
  {
    id: "giao-khach",
    label: "Giao khách",
    to: "/pod-quay",
    screen: "pod-quay",
    icon: PackageCheck,
  },
  {
    id: "kiem-kho",
    label: "Kiểm kho",
    to: "/kiem-ke",
    screen: "kiem-ke",
    icon: ClipboardList,
  },
];

export type MobileBottomTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  screen?: ScreenKey;
  action?: "create-order" | "menu";
};

export const MOBILE_BOTTOM_TABS: MobileBottomTab[] = [
  { id: "tac-vu", label: "Tác vụ", icon: LayoutGrid, to: "/tac-vu", screen: "tac-vu" },
  { id: "tao-don", label: "Tạo đơn", icon: PlusCircle, action: "create-order" },
  { id: "kho-hang", label: "Kho hàng", icon: PackagePlus, to: "/ton-kho", screen: "ton-kho" },
  { id: "tong-quan", label: "Tổng quan", icon: LayoutDashboard, to: "/dashboard", screen: "dashboard" },
  { id: "menu", label: "Menu", icon: Menu, action: "menu" },
];

/** Align with Tailwind `md` used by AppShell sidebar (`hidden md:block`). */
export const MOBILE_MAX_WIDTH_PX = 767;

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}
