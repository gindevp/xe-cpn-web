import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STATUS_LABEL, formatVND, type OrderStatus } from "@/lib/mock-data";
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
  };
};

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef(0);

  const stopScan = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const resetScanFlow = useCallback(() => {
    stopScan();
    setScanPhase("camera");
    setCode("");
    setPhoneTail("");
    setResult(null);
    setScanError(null);
  }, [stopScan]);

  const switchTab = (next: "code" | "scan") => {
    if (next === tab) return;
    setResult(null);
    if (next === "scan") {
      if (!canScan) return;
      resetScanFlow();
      setTab("scan");
      return;
    }
    stopScan();
    setScanPhase("camera");
    setTab("code");
  };

  useEffect(() => {
    if (!canScan && tab === "scan") {
      stopScan();
      setTab("code");
      setScanPhase("camera");
    }
  }, [canScan, tab, stopScan]);

  useEffect(() => {
    if (!canScan || tab !== "scan" || scanPhase !== "camera") {
      stopScan();
      return;
    }

    let cancelled = false;
    const start = async () => {
      setScanError(null);
      try {
        if (!("BarcodeDetector" in window)) {
          setScanError("Trình duyệt không hỗ trợ quét mã. Dùng tab Tra cứu theo mã.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        type Detector = {
          detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
        const DetectorCtor = (window as unknown as {
          BarcodeDetector: new (opts?: { formats?: string[] }) => Detector;
        }).BarcodeDetector;
        const detector = new DetectorCtor({
          formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8"],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes?.[0]?.rawValue?.trim();
            if (raw) {
              const cleaned = (raw.split(/[_\s]/)[0] ?? raw).toUpperCase();
              setCode(cleaned);
              setPhoneTail("");
              setResult(null);
              stopScan();
              setScanPhase("phone");
              toast.success("Quét thành công — nhập 4 số cuối SĐT");
              return;
            }
          } catch {
            // ignore frame errors
          }
          scanLoopRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };
        scanLoopRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setScanError("Không mở được camera. Kiểm tra quyền truy cập hoặc dùng tab Tra cứu theo mã.");
      }
    };
    void start();
    return () => {
      cancelled = true;
      stopScan();
    };
  }, [canScan, tab, scanPhase, stopScan]);

  const search = async () => {
    const c = code.trim();
    const p = digitsOnly(phoneTail);
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
    result?.order?.status != null
      ? ORDER_STATUS_LABEL[result.order.status as OrderStatus] ?? String(result.order.status)
      : "";

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
  const showScanCamera = canScan && tab === "scan" && scanPhase === "camera";
  const showScanPhone = canScan && tab === "scan" && scanPhase === "phone";
  const showScanResult = canScan && tab === "scan" && scanPhase === "result";

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

        {canScan ? (
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
        ) : null}

        {showScanCamera && (
          <div>
            {scanError ? (
              <div className="rounded-2xl bg-white p-4 text-sm text-primary shadow-sm">{scanError}</div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[4/3] w-full object-cover"
                  playsInline
                  muted
                />
                <ScanFrameOverlay />
              </div>
            )}
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Quét mã QR được in trên tem sản phẩm
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
                  onChange={(e) => setPhoneTail(digitsOnly(e.target.value).slice(0, 4))}
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
                onClick={resetScanFlow}
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
              onClick={resetScanFlow}
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
            />
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
              onClick={resetScanFlow}
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
    </div>
  );
}

function ScanFrameOverlay() {
  const corner = "pointer-events-none absolute h-8 w-8 border-white";
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative h-[48%] w-[58%] max-w-[240px]">
        <div className={cn(corner, "left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-sm")} />
        <div className={cn(corner, "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-sm")} />
        <div className={cn(corner, "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-sm")} />
        <div className={cn(corner, "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-sm")} />
      </div>
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
