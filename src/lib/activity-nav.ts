import type { LucideIcon } from "lucide-react";
import {
  PackageCheck,
  Repeat,
  CheckCircle2,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import type { ScreenKey } from "@/lib/rbac";

export type ActivityNavItem = {
  to: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  screen: ScreenKey;
};

/**
 * 5 mục đầu Hoạt động — chỉ hiện trên top bar
 * (Chờ bàn giao → Ngoại lệ / Đơn huỷ). Sidebar không lặp lại.
 */
export const ACTIVITY_TOP_NAV: ActivityNavItem[] = [
  {
    to: "/cho-ban-giao",
    label: "Chờ bàn giao",
    shortLabel: "Chờ bàn giao",
    icon: PackageCheck,
    screen: "cho-ban-giao",
  },
  {
    to: "/nhap-kho-luan-chuyen",
    label: "Nhập kho - Luân chuyển - Đang giao",
    shortLabel: "Nhập kho - Luân chuyển",
    icon: Repeat,
    screen: "nhap-kho-luan-chuyen",
  },
  {
    to: "/giao-thanh-cong",
    label: "Giao thành công",
    shortLabel: "Thành công",
    icon: CheckCircle2,
    screen: "giao-thanh-cong",
  },
  {
    to: "/don-hoan",
    label: "Đơn hoàn",
    shortLabel: "Hoàn",
    icon: Undo2,
    screen: "don-hoan",
  },
  {
    to: "/ngoai-le",
    label: "Ngoại lệ - Thất lạc - Hư hỏng - Đơn huỷ",
    shortLabel: "Ngoại lệ - Hủy",
    icon: AlertTriangle,
    screen: "ngoai-le",
  },
];
