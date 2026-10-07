import { create } from "zustand";
import type { AllowedOffice } from "./api/auth-api";

/** VP tài khoản đang đăng nhập được phép chuyển sang (lấy từ /api/account, gồm VP đang dùng). */
export const useAllowedOffices = create<{ offices: AllowedOffice[]; activeId: number | null }>(() => ({
  offices: [],
  activeId: null,
}));

export function setAllowedOffices(offices: AllowedOffice[], activeId: number | null) {
  useAllowedOffices.setState({ offices, activeId });
}
