import { createFileRoute, notFound } from "@tanstack/react-router";
import { PublicOrderForm } from "./tao-don";

/** Link QR đặt tại văn phòng: /{ID ở Danh mục VP} → form khách tạo đơn, điền sẵn VP gửi. */
export const Route = createFileRoute("/$vp")({
  beforeLoad: ({ params }) => {
    if (!/^\d+$/.test(params.vp)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Tạo đơn — X.E Việt Nam" },
      { name: "description", content: "Khách tạo đơn hàng qua QR — X.E Việt Nam." },
    ],
  }),
  component: function OfficeQrOrderPage() {
    const { vp } = Route.useParams();
    return <PublicOrderForm presetFromOffice={vp} />;
  },
});
