import { useEffect, useRef } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const DEFAULT_CENTER: [number, number] = [21.02889, 105.8525];
const DEFAULT_ZOOM = 14;
const PIN_ZOOM = 16;

type LeafletNs = any;

let leafletPromise: Promise<LeafletNs> | null = null;

function loadLeaflet(): Promise<LeafletNs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet chỉ chạy trên browser"));
  }
  const w = window as Window & { L?: LeafletNs };
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", () => reject(new Error("Không tải được Leaflet")));
      if ((window as any).L) resolve((window as any).L);
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("Không tải được Leaflet"));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

type Props = {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  className?: string;
};

/**
 * Bản đồ OSM (Leaflet CDN) + pin kéo/click — không cần API key / npm package.
 */
export function OfficeLocationMap({ lat, lng, onPick, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  onPickRef.current = onPick;
  latRef.current = lat;
  lngRef.current = lng;

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: number | undefined;

    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current || mapRef.current) return;

        const startLat = latRef.current;
        const startLng = lngRef.current;
        const center: [number, number] =
          startLat != null && startLng != null ? [startLat, startLng] : DEFAULT_CENTER;

        const map = L.map(containerRef.current, {
          center,
          zoom: startLat != null ? PIN_ZOOM : DEFAULT_ZOOM,
          scrollWheelZoom: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker(center, { draggable: true }).addTo(map);

        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onPickRef.current(p.lat, p.lng);
        });
        map.on("click", (e: any) => {
          marker.setLatLng(e.latlng);
          onPickRef.current(e.latlng.lat, e.latlng.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
        resizeTimer = window.setTimeout(() => {
          map.invalidateSize();
          if (latRef.current != null && lngRef.current != null) {
            map.setView([latRef.current, lngRef.current], PIN_ZOOM);
            marker.setLatLng([latRef.current, lngRef.current]);
          }
        }, 150);
      } catch {
        // map optional
      }
    })();

    return () => {
      cancelled = true;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return;
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], PIN_ZOOM, { animate: true });
    window.setTimeout(() => map.invalidateSize(), 50);
  }, [lat, lng]);

  // Khi container đổi kích thước (full ngang form) — Leaflet cần invalidateSize.
  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      window.setTimeout(() => mapRef.current?.invalidateSize?.(), 40);
    });
    ro.observe(el);
    window.setTimeout(() => map?.invalidateSize?.(), 100);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-80 w-full overflow-hidden rounded-md border z-0"}
      aria-label="Bản đồ vị trí văn phòng"
    />
  );
}
