import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ApiError, apiRequest, isApiEnabled } from "@/lib/api/client";

export const Route = createFileRoute("/man-hinh-qr/$key")({
  head: () => ({
    meta: [
      { title: "Màn hình QR lấy hàng — X.E Việt Nam" },
      {
        name: "description",
        content: "Mở trên máy tại quầy để chiếu mã QR. Khách quét mã để tra cứu đơn đến lấy.",
      },
      { property: "og:title", content: "Màn hình QR lấy hàng — X.E Việt Nam" },
      {
        property: "og:description",
        content: "Mở trên máy tại quầy để chiếu mã QR. Khách quét mã để tra cứu đơn đến lấy.",
      },
      { property: "og:image", content: "https://xe-cpn-web.vercel.app/og-lay-hang.png" },
    ],
  }),
  component: ScreenPage,
});

type Pulse = {
  officeName?: string;
  refreshSeconds?: number;
  token?: string | null;
  expiresAt?: string;
  quiet?: boolean;
  quietUntil?: string | null;
};

function screenDeviceId() {
  const key = "xe.screenDeviceId";
  try {
    const cur = localStorage.getItem(key);
    if (cur && /^[A-Za-z0-9._-]{8,80}$/.test(cur)) return cur;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `scr-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return "screen-no-storage";
  }
}

function ScreenPage() {
  const { key } = Route.useParams();
  const [officeName, setOfficeName] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [blocked, setBlocked] = useState("");
  const [quietUntil, setQuietUntil] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let token = "";
    const deviceId = screenDeviceId();

    const draw = async (next: string) => {
      const url = `${window.location.origin}/lay-hang?t=${encodeURIComponent(next)}`;
      const img = await QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: "M" });
      if (alive) setQrUrl(img);
    };

    const tick = async () => {
      if (!isApiEnabled()) {
        if (alive) setBlocked("Chưa cấu hình máy chủ");
        timer = window.setTimeout(() => void tick(), 15000);
        return;
      }
      try {
        const res = await apiRequest<Pulse>(`/api/public/office-screen/${encodeURIComponent(key)}/pulse`, {
          method: "POST",
          auth: false,
          body: { deviceId, holding: token ? "true" : "false" },
        });
        if (!alive) return;
        setBlocked("");
        setOfficeName(res.officeName || "");
        if (res.quiet) {
          token = "";
          setQrUrl("");
          setExpiresAt(null);
          setQuietUntil(res.quietUntil || "");
        } else {
          setQuietUntil("");
          if (res.expiresAt) setExpiresAt(res.expiresAt);
          if (res.token) {
            token = res.token;
            await draw(token);
          }
        }
        timer = window.setTimeout(() => void tick(), 4000);
      } catch (e) {
        if (!alive) return;
        const busy = e instanceof ApiError && e.status === 409;
        setBlocked(busy ? e.message : e instanceof Error ? e.message : "Không phát được mã QR");
        if (busy) {
          token = "";
          setQrUrl("");
          setExpiresAt(null);
        }
        timer = window.setTimeout(() => void tick(), busy ? 15000 : 8000);
      }
    };

    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key]);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-10 text-center">
      <div className="text-sm font-semibold tracking-wide text-primary">X.E VIỆT NAM</div>
      <h1 className="mt-2 text-3xl font-bold">{officeName || "Màn hình văn phòng"}</h1>
      <p className="mt-1 text-muted-foreground">Quét mã để tra cứu đơn đến lấy</p>
      {blocked ? (
        <div className="mt-10 max-w-md rounded-xl border bg-muted/40 px-6 py-8 text-base">{blocked}</div>
      ) : quietUntil ? (
        <div className="mt-10 max-w-md rounded-xl border bg-muted/40 px-6 py-8 text-lg">
          QR tạm ngưng đến {quietUntil}. Hết giờ màn hình tự hiện mã mới.
        </div>
      ) : qrUrl ? (
        <img src={qrUrl} alt="Mã QR tra cứu" className="mt-8 w-[min(80vw,520px)]" />
      ) : (
        <div className="mt-10 text-muted-foreground">Đang tạo mã…</div>
      )}
      {qrUrl && left != null ? (
        <div className="mt-4 text-sm text-muted-foreground">Mã đổi sau {left} giây</div>
      ) : null}
    </div>
  );
}
