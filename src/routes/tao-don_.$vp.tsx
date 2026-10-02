import { createFileRoute } from "@tanstack/react-router";
import { PublicOrderForm } from "./tao-don";

/** Link QR đặt tại văn phòng: /tao-don/{id hoặc mã VP} → điền sẵn VP gửi. */
export const Route = createFileRoute("/tao-don_/$vp")({
  head: () => ({
    meta: [
      { title: "Tạo đơn — X.E Việt Nam" },
      { name: "description", content: "Khách tạo đơn hàng qua QR — X.E Việt Nam." },
    ],
  }),
  component: function TaoDonOfficePage() {
    const { vp } = Route.useParams();
    return <PublicOrderForm presetFromOffice={vp} />;
  },
});
