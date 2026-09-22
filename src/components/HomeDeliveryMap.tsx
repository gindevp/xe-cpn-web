import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OfficeLocationMap } from "@/components/OfficeLocationMap";
import { geoGeocodeAddress } from "@/lib/api/geo-api";
import { estimatePickupKm } from "@/lib/api/ahamove-api";
import { isApiEnabled } from "@/lib/api/client";

/**
 * Hiện khi lấy/giao tận nơi: ping map theo địa chỉ; nếu có GPS VP → Ahamove estimate KM.
 */
export function HomeDeliveryMap({
  enabled,
  address,
  label = "tận nơi",
  officeLat,
  officeLng,
  officeAddress,
  onKmChange,
}: {
  enabled: boolean;
  address: string;
  /** Ví dụ: "lấy tận nơi" / "giao tận nơi" */
  label?: string;
  /** GPS văn phòng (gửi/nhận) — dùng lấy service + estimate KM */
  officeLat?: number | null;
  officeLng?: number | null;
  officeAddress?: string;
  /** Báo KM Ahamove lên form để tính phí bảng /phu-phi */
  onKmChange?: (km: number | null) => void;
}) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [kmLoading, setKmLoading] = useState(false);
  const [kmError, setKmError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const kmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToastKey = useRef<string>("");
  const onKmChangeRef = useRef(onKmChange);
  onKmChangeRef.current = onKmChange;

  const emitKm = (km: number | null) => {
    onKmChangeRef.current?.(km);
  };
  const officeReady =
    officeLat != null && officeLng != null && !Number.isNaN(Number(officeLat)) && !Number.isNaN(Number(officeLng));
  const pinReady = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);

  useEffect(() => {
    if (!enabled) {
      setLat(null);
      setLng(null);
      setPinning(false);
      setPinError(null);
      setDistanceKm(null);
      setServiceId(null);
      setKmError(null);
      setKmLoading(false);
      setStatusHint(null);
      emitKm(null);
      return;
    }
    const addr = address.trim();
    if (!addr) {
      setLat(null);
      setLng(null);
      setPinError(null);
      setStatusHint("Chọn địa chỉ để ping bản đồ và tính KM");
      return;
    }
    let cancelled = false;
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => {
      setPinning(true);
      setPinError(null);
      setStatusHint("Đang định vị địa chỉ trên bản đồ…");
      void geoGeocodeAddress(addr)
        .then((hit) => {
          if (cancelled) return;
          if (hit) {
            setLat(hit.lat);
            setLng(hit.lng);
            setPinError(null);
            setStatusHint(null);
          } else {
            setLat(null);
            setLng(null);
            const msg = "Không định vị được địa chỉ — chọn lại tỉnh/phường hoặc kéo pin thủ công";
            setPinError(msg);
            setStatusHint(msg);
            toastKey(`pin-fail:${addr}`, msg);
          }
        })
        .catch((e: any) => {
          if (cancelled) return;
          const msg = e?.message ?? "Lỗi geocode địa chỉ";
          setLat(null);
          setLng(null);
          setPinError(msg);
          setStatusHint(msg);
          toastKey(`pin-err:${addr}`, msg);
        })
        .finally(() => {
          if (!cancelled) setPinning(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, [enabled, address]);

  // Mỗi lần GPS pin hoặc VP đổi → Ahamove services + estimate KM
  useEffect(() => {
    if (!enabled) return;
    if (!isApiEnabled()) {
      setDistanceKm(null);
      setServiceId(null);
      setKmLoading(false);
      setKmError("Chưa bật API — không gọi Ahamove được");
      emitKm(null);
      return;
    }
    if (!officeReady) {
      setDistanceKm(null);
      setServiceId(null);
      setKmLoading(false);
      setKmError(null);
      setStatusHint((h) => h ?? "VP chưa có tọa độ — mở Master VP, lưu địa chỉ để có GPS rồi chọn lại VP");
      emitKm(null);
      return;
    }
    if (!pinReady) {
      setDistanceKm(null);
      setServiceId(null);
      setKmLoading(false);
      emitKm(null);
      // pinError / pinning đã nói lý do
      return;
    }
    if (kmTimer.current) clearTimeout(kmTimer.current);
    kmTimer.current = setTimeout(() => {
      setKmLoading(true);
      setKmError(null);
      setStatusHint("Đang tính KM Ahamove…");
      void estimatePickupKm({
        officeLat: Number(officeLat),
        officeLng: Number(officeLng),
        officeAddress: officeAddress || undefined,
        pinLat: lat!,
        pinLng: lng!,
        pinAddress: address.trim() || undefined,
      })
        .then((r) => {
          const km = r.distanceKm != null ? Number(r.distanceKm) : null;
          if (km == null || Number.isNaN(km)) {
            const msg = "Ahamove trả về nhưng không có khoảng cách (distance)";
            setDistanceKm(null);
            setServiceId(r.serviceId ?? null);
            setKmError(msg);
            setStatusHint(msg);
            emitKm(null);
            toastKey(`km-empty:${lat},${lng}`, msg);
            return;
          }
          setDistanceKm(km);
          setServiceId(r.serviceId ?? null);
          setKmError(null);
          setStatusHint(null);
          emitKm(km);
          toastKey(
            `km-ok:${lat},${lng}:${km}`,
            `Khoảng cách ${label}: ${km.toFixed(2)} km`,
            "success",
          );
        })
        .catch((e: any) => {
          const msg = e?.message ?? "Không lấy được KM từ Ahamove";
          setDistanceKm(null);
          setServiceId(null);
          setKmError(msg);
          setStatusHint(msg);
          emitKm(null);
          toastKey(`km-fail:${lat},${lng}:${msg}`, msg);
        })
        .finally(() => setKmLoading(false));
    }, 500);
    return () => {
      if (kmTimer.current) clearTimeout(kmTimer.current);
    };
  }, [enabled, officeReady, officeLat, officeLng, officeAddress, pinReady, lat, lng, address, label]);

  function toastKey(key: string, message: string, kind: "error" | "success" = "error") {
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;
    if (kind === "success") toast.success(message);
    else toast.error(message);
  }

  if (!enabled) return null;

  return (
    <div className="w-full min-w-0 space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {pinning
          ? "Đang ping bản đồ theo địa chỉ…"
          : address.trim()
            ? `Bản đồ ${label} — kéo pin nếu cần chỉnh`
            : "Chọn địa chỉ để ping bản đồ"}
      </p>
      <OfficeLocationMap
        className="aspect-[2.4/1] h-auto min-h-52 w-full max-h-[22rem] overflow-hidden rounded-md border z-0 sm:min-h-56"
        lat={lat}
        lng={lng}
        onPick={(a, b) => {
          setLat(a);
          setLng(b);
          setPinError(null);
          setStatusHint(null);
        }}
      />
      <div
        className={
          "rounded-md border px-3 py-2 text-sm " +
          (kmError || pinError
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : distanceKm != null
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "bg-muted/40")
        }
      >
        {!officeReady ? (
          <span>VP chưa có GPS — vào Master dữ liệu → VP, chọn địa chỉ để lưu tọa độ, rồi chọn lại VP trên đơn.</span>
        ) : pinning || kmLoading ? (
          <span className="text-muted-foreground">{statusHint || (pinning ? "Đang định vị…" : "Đang tính KM Ahamove…")}</span>
        ) : pinError ? (
          <span>{pinError}</span>
        ) : kmError ? (
          <span>{kmError}</span>
        ) : distanceKm != null ? (
          <span>
            Khoảng cách: <strong>{distanceKm.toFixed(2)} km</strong>
            {serviceId ? <span className="ml-2 text-xs text-muted-foreground">({serviceId})</span> : null}
          </span>
        ) : statusHint ? (
          <span className="text-muted-foreground">{statusHint}</span>
        ) : (
          <span className="text-muted-foreground">Chưa có KM — chọn đủ VP (có GPS) + địa chỉ</span>
        )}
      </div>
    </div>
  );
}
