import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Đơn hoàn đã gộp vào /nhap-kho-luan-chuyen (status RETURNING + forwardStage + tag HOÀN).
 * Giữ route để bookmark/cũ không 404.
 */
export const Route = createFileRoute("/don-hoan")({
  head: () => ({
    meta: [
      { title: "Đơn hoàn — X.E" },
      {
        name: "description",
        content: "Luồng hoàn đã chuyển sang Nhập kho — Luân chuyển.",
      },
    ],
  }),
  component: () => <Navigate to="/nhap-kho-luan-chuyen" replace />,
});
