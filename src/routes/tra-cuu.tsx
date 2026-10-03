import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ImageUp, Package } from "lucide-react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND, type OrderStatus } from "@/lib/mock-data";
import { customerTrackStatusLabel } from "@/lib/customer-track-status";
import { useStore } from "@/lib/store";
import { digitsOnly } from "@/lib/order-search";
import { orderGoodsLabel } from "@/lib/package-label";
import { cn } from "@/lib/utils";
import { isHandheldCameraDevice } from "@/lib/device";
import { toast } from "sonner";

export const Route = createFileRoute("/tra-cuu")({
  head: () => ({
    meta: [
      { title: "Tra cứu đơn — X.E Việt Nam" },
      { name: "description", content: "Tra cứu vận đơn X.E Việt Nam bằng mã và 4 số cuối SĐT." },
    ],
  }),
  component: TracuuPage,
});

type TrackResult = {
  found: boolean;
  order?: {
    code: string;
    draftCode?: string;
    status: OrderStatus | string;
    statusLabel?: string;
    receiverName?: string;
    receiverPhone?: string;
    address?: string;
    goodsLabel?: string;
    goodsFare?: number;
    deliveryFee?: number;
    pickupFee?: number;
    fare?: number;
    homeDelivery?: boolean;
    homePickup?: boolean;
    route?: string;
    journey?: JourneyStep[];
  };
};

type JourneyStep = { key: string; label: string; at?: string | null };

function routeText(from?: string, to?: string, itinerary?: string): string | undefined {
  const path = [from, to].filter(Boolean).join(" → ");
  if (!path) return itinerary || undefined;
  return itinerary ? `${path} (${itinerary})` : path;
}

function formatJourneyTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

type ScanPhase = "camera" | "phone" | "result";

const fieldInputClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 shadow-none focus-visible:ring-1 focus-visible:ring-primary";

function phoneTailMatches(input: string, sender?: string, receiver?: string): boolean {
  const inDigits = digitsOnly(input);
  if (!inDigits) return false;
  const s = digitsOnly(sender);
  const r = digitsOnly(receiver);
  if (inDigits.length === 4) {
    return (!!s && s.endsWith(inDigits)) || (!!r && r.endsWith(inDigits));
  }
  return inDigits === s || inDigits === r;
}

const ORDER_CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,29}$/;

function orderCodeFromScan(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text =
        url.searchParams.get("code") ||
        url.searchParams.get("ma") ||
        url.pathname.split("/").filter(Boolean).pop() ||
        "";
    } catch {
      return null;
    }
  }
  const code = (text.split(/[_\s]/)[0] ?? "").toUpperCase();
  return ORDER_CODE_RE.test(code) ? code : null;
}

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Chưa được cấp quyền camera. Hãy cho phép trình duyệt truy cập camera (iPhone: Cài đặt → Safari → Camera → Cho phép; Android: biểu tượng ổ khóa cạnh địa chỉ web → Quyền → Camera), rồi bấm Thử lại.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Không tìm thấy camera trên thiết bị. Dùng tab Tra cứu theo mã.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi bấm Thử lại.";
  }
  return "Không mở được camera. Bấm Thử lại hoặc dùng tab Tra cứu theo mã.";
}

type NativeDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

function createNativeDetector(): NativeDetector | null {
  const Ctor = (window as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => NativeDetector;
  }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code", "code_128"] });
  } catch {
    return null;
  }
}

function decodeWithJsQr(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | undefined {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return undefined;
  const scale = Math.min(1, 720 / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(video, 0, 0, cw, ch);
  const img = ctx.getImageData(0, 0, cw, ch);
  return jsQR(img.data, cw, ch, { inversionAttempts: "dontInvert" })?.data;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Đọc mã QR từ ảnh chụp tem / biên nhận (thử vài kích thước vì ảnh điện thoại rất lớn). */
async function decodeImageFile(file: File): Promise<string | undefined> {
  const img = await loadImage(file);
  const detector = createNativeDetector();
  if (detector) {
    try {
      const codes = await (detector as unknown as {
        detect: (s: HTMLImageElement) => Promise<Array<{ rawValue?: string }>>;
      }).detect(img);
      const raw = codes?.[0]?.rawValue;
      if (raw) return raw;
    } catch {
      // fall back to jsQR
    }
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return undefined;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  for (const maxSide of [1024, 1600, 2400, 640]) {
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    canvas.width = cw;
    canvas.height = ch;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch);
    const raw = jsQR(data.data, cw, ch, { inversionAttempts: "attemptBoth" })?.data;
    if (raw) return raw;
    if (scale === 1) break;
  }
  return undefined;
}

async function cameraPermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

function TracuuPage() {
  const navigate = useNavigate();
  const orders = useStore((s) => s.orders);
  const [canScan] = useState(() => isHandheldCameraDevice());
  const [tab, setTab] = useState<"code" | "scan">("code");
  const [code, setCode] = useState("");
  const [phoneTail, setPhoneTail] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("camera");
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [decodingImage, setDecodingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraAllowedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLoopRef = useRef(0);
  const scanSessionRef = useRef(0);

  const stopScan = useCallback(() => {
    scanSessionRef.current += 1;
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setCameraStarting(false);
  }, []);

  useEffect(() => stopScan, [stopScan]);

  const acceptScan = (raw: string): boolean => {
    const scanned = orderCodeFromScan(raw);
    if (!scanned) return false;
    stopScan();
    setCode(scanned);
    setPhoneTail("");
    setResult(null);
    setScanError(null);
    setScanPhase("phone");
    if (navigator.vibrate) navigator.vibrate(80);
    toast.success("Quét thành công — nhập 4 số cuối SĐT");
    return true;
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setDecodingImage(true);
    try {
      const raw = await decodeImageFile(file);
      if (!raw) {
        toast.error("Không tìm thấy mã QR trong ảnh. Hãy chọn ảnh rõ nét, chụp thẳng mã QR.");
        return;
      }
      if (!acceptScan(raw)) toast.error("Mã QR trong ảnh không phải mã đơn hàng X.E");
    } catch {
      toast.error("Không đọc được ảnh. Hãy thử ảnh khác.");
    } finally {
      setDecodingImage(false);
    }
  };

  const runDecodeLoop = (session: number) => {
    const detector = createNativeDetector();
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    let lastDecodeAt = 0;
    let lastRejected = "";

    const tick = async (now: number) => {
      const video = videoRef.current;
      if (session !== scanSessionRef.current || !video) return;
      let raw: string | undefined;
      if (video.readyState >= 2 && now - lastDecodeAt >= (detector ? 0 : 120)) {
        lastDecodeAt = now;
        try {
          raw = detector
            ? (await detector.detect(video))?.[0]?.rawValue
            : decodeWithJsQr(video, canvas);
        } catch {
          raw = undefined;
        }
      }
      if (session !== scanSessionRef.current) return;
      if (raw && acceptScan(raw)) return;
      if (raw && raw !== lastRejected) {
        lastRejected = raw;
        toast.error("Mã QR này không phải mã đơn hàng X.E");
      }
      scanLoopRef.current = requestAnimationFrame((t) => void tick(t));
    };
    scanLoopRef.current = requestAnimationFrame((t) => void tick(t));
  };

  const startCamera = async () => {
    if (streamRef.current) return;
    setScanError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScanError(
        "Trình duyệt không cho phép mở camera trên trang này. Hãy mở bằng Safari/Chrome qua đường dẫn https, hoặc dùng tab Tra cứu theo mã.",
      );
      return;
    }
    const session = ++scanSessionRef.current;
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (session !== scanSessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      cameraAllowedRef.current = true;
      setCameraOn(true);
      let video = videoRef.current;
      if (!video) {
        await new Promise((r) => requestAnimationFrame(r));
        video = videoRef.current;
      }
      if (!video || session !== scanSessionRef.current) return;
      video.srcObject = stream;
      await video.play();
      runDecodeLoop(session);
    } catch (err) {
      if (session !== scanSessionRef.current) return;
      stopScan();
      setScanError(cameraErrorMessage(err));
    } finally {
      if (session === scanSessionRef.current) setCameraStarting(false);
    }
  };

  const resetScanFlow = useCallback(() => {
    stopScan();
    setScanPhase("camera");
    setCode("");
    setPhoneTail("");
    setResult(null);
    setScanError(null);
  }, [stopScan]);

  /** Chỉ tự mở camera khi đã được cấp quyền; chưa thì hiện màn xin quyền tiếng Việt trước. */
  const startCameraIfAllowed = async () => {
    if (!canScan) return;
    if (cameraAllowedRef.current || (await cameraPermissionGranted())) void startCamera();
  };

  const rescan = () => {
    resetScanFlow();
    void startCameraIfAllowed();
  };

  const switchTab = (next: "code" | "scan") => {
    if (next === tab) return;
    setResult(null);
    if (next === "scan") {
      resetScanFlow();
      setTab("scan");
      void startCameraIfAllowed();
      return;
    }
    stopScan();
    setScanPhase("camera");
    setTab("code");
  };

  const search = async (tail = phoneTail) => {
    const c = code.trim();
    const p = digitsOnly(tail);
    if (!c) {
      toast.error("Vui lòng nhập mã đơn hàng");
      return;
    }
    if (p.length !== 4) {
      toast.error("Vui lòng nhập đúng 4 số cuối SĐT người gửi hoặc người nhận");
      return;
    }

    setSearching(true);
    setResult(null);
    try {
      const { isApiEnabled } = await import("@/lib/api/client");
      if (isApiEnabled()) {
        try {
          const { trackOrder } = await import("@/lib/api/domain-api");
          const res = await trackOrder(c, p);
          if (!res.found) {
            setResult({ found: false });
            if (tab === "scan") setScanPhase("result");
            return;
          }
          setResult({
            found: true,
            order: {
              code: res.orderCode || c,
              draftCode: res.draftCode,
              status: res.status ?? "CONFIRMED",
              statusLabel: res.statusLabel,
              receiverName: res.receiverName,
              receiverPhone: res.receiverPhone,
              address: res.deliveryAddress,
              goodsLabel: orderGoodsLabel({
                goodsType: res.goodsType,
                note: res.note,
              }),
              goodsFare: res.goodsFareAmount != null ? Number(res.goodsFareAmount) : undefined,
              deliveryFee: res.deliveryFeeAmount != null ? Number(res.deliveryFeeAmount) : undefined,
              pickupFee: res.pickupFeeAmount != null ? Number(res.pickupFeeAmount) : undefined,
              fare: res.fareAmount != null ? Number(res.fareAmount) : undefined,
              homeDelivery: res.homeDelivery,
              homePickup: res.homePickup,
              route: routeText(res.fromOfficeName, res.toOfficeName, res.itineraryLabel),
              journey: res.journey,
            },
          });
          if (tab === "scan") setScanPhase("result");
          return;
        } catch {
          // fall through to local store
        }
      }

      const o = orders.find(
        (x) =>
          (x.code === c || x.draftCode === c) &&
          phoneTailMatches(p, x.senderPhone, x.receiverPhone),
      );
      if (!o) {
        setResult({ found: false });
        if (tab === "scan") setScanPhase("result");
        return;
      }
      setResult({
        found: true,
        order: {
          code: o.code,
          draftCode: o.draftCode,
          status: o.status,
          statusLabel: customerTrackStatusLabel(o),
          receiverName: o.receiverName,
          receiverPhone: o.receiverPhone,
          address: o.address,
          goodsLabel: orderGoodsLabel(o),
          goodsFare: o.goodsFare,
          deliveryFee: o.deliveryFee,
          pickupFee: o.pickupFee,
          fare: o.fare,
          homeDelivery: o.homeDelivery,
          homePickup: o.homePickup,
        },
      });
      if (tab === "scan") setScanPhase("result");
    } finally {
      setSearching(false);
    }
  };

  const statusLabel =
    result?.order?.statusLabel?.trim() ||
    (result?.order
      ? customerTrackStatusLabel({
          status: result.order.status as OrderStatus,
          homePickup: result.order.homePickup,
          homeDelivery: result.order.homeDelivery,
        })
      : "");

  const goodsFare =
    result?.order?.goodsFare ??
    Math.max(
      0,
      (result?.order?.fare ?? 0) - (result?.order?.deliveryFee ?? 0) - (result?.order?.pickupFee ?? 0),
    );
  const deliveryFee = result?.order?.deliveryFee ?? 0;
  const pickupFee = result?.order?.pickupFee ?? 0;
  const total = result?.order?.fare ?? goodsFare + deliveryFee + pickupFee;

  const showCodeForm = tab === "code" && !result;
  const showCodeEmpty = tab === "code" && result && !result.found;
  const showCodeResult = tab === "code" && result?.found && result.order;
  const showScanCamera = tab === "scan" && scanPhase === "camera";
  const showScanPhone = tab === "scan" && scanPhase === "phone";
  const showScanResult = tab === "scan" && scanPhase === "result";

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-3 sm:max-w-lg md:max-w-xl">
        <header className="relative mb-4 flex items-center justify-center py-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-black/5"
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="px-10 text-center text-[17px] font-semibold text-foreground">
            Tra cứu đơn hàng
          </h1>
        </header>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-[#E4EAF3] p-1">
            <button
              type="button"
              onClick={() => switchTab("code")}
              className={cn(
                "rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors",
                tab === "code" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              Tra cứu theo mã
            </button>
            <button
              type="button"
              onClick={() => switchTab("scan")}
              className={cn(
                "rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors",
                tab === "scan" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              Quét mã đơn
            </button>
          </div>

        {showScanCamera && (
          <div>
            {canScan ? (
              <div className="relative aspect-[3/2] max-h-[340px] w-full overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  className={cn("absolute inset-0 h-full w-full object-cover", !cameraOn && "hidden")}
                  playsInline
                  muted
                  autoPlay
                />
                {!cameraOn && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-[#111] px-4 text-center">
                    <Camera className="h-8 w-8 text-white/60" />
                    <p className="text-[13px] leading-snug text-white/90">
                      {scanError ??
                        "Cho phép X.E truy cập camera để quét mã QR trên tem đơn hàng. Khi trình duyệt hỏi, chọn “Cho phép”."}
                    </p>
                    <button
                      type="button"
                      disabled={cameraStarting}
                      onClick={() => void startCamera()}
                      className="rounded-md bg-[#2563eb] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                    >
                      {cameraStarting ? "Đang mở camera…" : scanError ? "Thử lại" : "Cho phép"}
                    </button>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="aspect-square h-[72%] rounded-sm border-2 border-white/85" />
                </div>
                <span className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 text-center text-xs font-semibold text-white/90">
                  Đưa mã QR trên tem vào khung
                </span>
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-muted-foreground shadow-sm">
                Máy tính không mở camera. Tải ảnh có mã QR (ảnh chụp tem hoặc biên nhận) lên để tra cứu.
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onPickImage(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-12 w-full rounded-xl border-primary/40 bg-white text-base font-semibold"
              disabled={decodingImage}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageUp className="mr-2 h-5 w-5" />
              {decodingImage ? "Đang đọc mã QR…" : "Tải ảnh mã QR lên"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Chọn ảnh chụp tem hoặc ảnh biên nhận có mã QR trong máy
            </p>
          </div>
        )}

        {showScanPhone && (
          <div>
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <p className="mb-1 text-sm font-medium text-foreground">
                Mã đơn: <span className="font-semibold text-primary">{code}</span>
              </p>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                Nhập 4 số cuối điện thoại người gửi hoặc người nhận để xác nhận đơn hàng.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">4 số cuối SĐT</Label>
                <Input
                  className={fieldInputClass}
                  value={phoneTail}
                  onChange={(e) => {
                    const tail = digitsOnly(e.target.value).slice(0, 4);
                    setPhoneTail(tail);
                    if (tail.length === 4 && !searching) void search(tail);
                  }}
                  placeholder="xxxx"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-primary/40 bg-white"
                onClick={rescan}
              >
                Quét lại
              </Button>
              <Button
                type="button"
                className="h-12 rounded-xl text-base font-semibold"
                disabled={searching}
                onClick={() => void search()}
              >
                {searching ? "Đang tra cứu..." : "Tra cứu"}
              </Button>
            </div>
          </div>
        )}

        {showScanResult && result && !result.found && (
          <div>
            <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-10 shadow-sm">
              <EmptySearchIcon />
              <p className="mt-4 text-center text-sm font-semibold text-primary">
                Không tìm thấy đơn hàng nào
              </p>
            </div>
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
              onClick={rescan}
            >
              Tra cứu đơn khác
            </Button>
          </div>
        )}

        {showScanResult && result?.found && result.order && (
          <div>
            <OrderInfoCard
              statusLabel={statusLabel}
              goodsLabel={result.order.goodsLabel}
              receiverName={result.order.receiverName}
              receiverPhone={result.order.receiverPhone}
              address={result.order.address}
              goodsFare={goodsFare}
              pickupFee={pickupFee}
              deliveryFee={deliveryFee}
              showDelivery={Boolean(result.order.homeDelivery) || deliveryFee > 0}
              showPickup={Boolean(result.order.homePickup) || pickupFee > 0}
              total={total}
              route={result.order.route}
              journey={result.order.journey}
            />
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
              onClick={rescan}
            >
              Tra cứu đơn khác
            </Button>
          </div>
        )}

        {showCodeForm && (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                Nhập mã vận đơn và 4 số cuối điện thoại người gửi hoặc người nhận để theo dõi vị trí
                và nhật ký bưu kiện.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Mã đơn hàng</Label>
                  <Input
                    className={fieldInputClass}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="VD: XE152418545"
                    autoCapitalize="characters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">4 số cuối SĐT</Label>
                  <Input
                    className={fieldInputClass}
                    value={phoneTail}
                    onChange={(e) => setPhoneTail(digitsOnly(e.target.value).slice(0, 4))}
                    placeholder="xxxx"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
              </div>
            </div>
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
              disabled={searching}
              onClick={() => void search()}
            >
              {searching ? "Đang tra cứu..." : "Tra cứu"}
            </Button>
          </>
        )}

        {showCodeEmpty && (
          <div>
            <div className="mt-0 flex flex-col items-center rounded-2xl bg-white px-6 py-10 shadow-sm">
              <EmptySearchIcon />
              <p className="mt-4 text-center text-sm font-semibold text-primary">
                Không tìm thấy đơn hàng nào
              </p>
            </div>
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
              onClick={() => {
                setResult(null);
                setPhoneTail("");
              }}
            >
              Tra cứu đơn khác
            </Button>
          </div>
        )}

        {showCodeResult && result?.order && (
          <div>
            <OrderInfoCard
              statusLabel={statusLabel}
              goodsLabel={result.order.goodsLabel}
              receiverName={result.order.receiverName}
              receiverPhone={result.order.receiverPhone}
              address={result.order.address}
              goodsFare={goodsFare}
              pickupFee={pickupFee}
              deliveryFee={deliveryFee}
              showDelivery={Boolean(result.order.homeDelivery) || deliveryFee > 0}
              showPickup={Boolean(result.order.homePickup) || pickupFee > 0}
              total={total}
              route={result.order.route}
              journey={result.order.journey}
            />
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
              onClick={() => {
                setResult(null);
                setPhoneTail("");
              }}
            >
              Tra cứu đơn khác
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderInfoCard({
  statusLabel,
  goodsLabel,
  receiverName,
  receiverPhone,
  address,
  goodsFare,
  pickupFee,
  deliveryFee,
  showDelivery,
  showPickup,
  total,
  route,
  journey,
}: {
  statusLabel: string;
  goodsLabel?: string;
  receiverName?: string;
  receiverPhone?: string;
  address?: string;
  goodsFare: number;
  pickupFee: number;
  deliveryFee: number;
  showDelivery: boolean;
  showPickup: boolean;
  total: number;
  route?: string;
  journey?: JourneyStep[];
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
        <Package className="h-4 w-4" />
        Thông tin đơn hàng
      </div>

      <div className="flex items-center justify-between gap-3 border-b py-3 text-sm">
        <span className="text-muted-foreground">Trạng thái :</span>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {statusLabel}
        </span>
      </div>

      {route ? <DetailRow label="Lộ trình :" value={route} /> : null}
      <DetailRow label="Tên hàng :" value={goodsLabel || "—"} />
      <DetailRow label="Người nhận :" value={receiverName || "—"} />
      <DetailRow label="SĐT người nhận :" value={receiverPhone || "—"} />
      <DetailRow label="Địa chỉ nhận :" value={address || "—"} />

      <div className="mt-1 border-t pt-1">
        <DetailRow label="Cước hàng :" value={formatVND(goodsFare)} />
        {showPickup && pickupFee > 0 && (
          <DetailRow label="Phí lấy hàng tận nơi :" value={formatVND(pickupFee)} />
        )}
        {showDelivery && (
          <DetailRow label="Phí giao hàng tận nơi :" value={formatVND(deliveryFee)} />
        )}
        <div className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="font-semibold text-foreground">Tổng :</span>
          <span className="font-bold text-orange-500">{formatVND(total)}</span>
        </div>
      </div>

      {journey && journey.length > 0 ? <JourneyTimeline steps={journey} /> : null}
    </div>
  );
}

function JourneyTimeline({ steps }: { steps: JourneyStep[] }) {
  const lastDone = steps.reduce((acc, s, i) => (s.at ? i : acc), -1);
  return (
    <div className="mt-1 border-t pt-3">
      <div className="mb-3 text-sm font-semibold text-foreground">Hành trình đơn hàng</div>
      <ol>
        {steps.map((s, i) => {
          const done = !!s.at;
          const current = i === lastDone;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 ? (
                <span
                  className={cn(
                    "absolute left-[7px] top-4 h-full w-0.5",
                    i < lastDone ? "bg-primary" : "bg-[#E4EAF3]",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                  done ? "border-primary bg-primary" : "border-[#C9D3E1] bg-white",
                  current && "ring-4 ring-primary/20",
                )}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3 text-sm">
                <span className={cn(done ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {s.at ? formatJourneyTime(s.at) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-3 text-sm last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function EmptySearchIcon() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden>
      <rect x="18" y="22" width="54" height="8" rx="4" fill="#B8C7E0" />
      <rect x="18" y="38" width="70" height="8" rx="4" fill="#C9D5EA" />
      <rect x="18" y="54" width="48" height="8" rx="4" fill="#B8C7E0" />
      <circle cx="78" cy="62" r="22" stroke="#274EA1" strokeWidth="6" fill="#E8EEF8" />
      <line x1="94" y1="78" x2="108" y2="92" stroke="#274EA1" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
