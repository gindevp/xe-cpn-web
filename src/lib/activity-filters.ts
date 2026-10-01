import { create } from "zustand";

/** Bộ lọc ngày + từ khoá dùng chung các màn Hoạt động (đặt trên top bar, giữ khi chuyển màn). */
type ActivityFilters = {
  from: string;
  to: string;
  q: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  setQ: (v: string) => void;
};

export const useActivityFilters = create<ActivityFilters>((set) => ({
  from: "",
  to: "",
  q: "",
  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),
  setQ: (q) => set({ q }),
}));
