import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const GOONG_CSS = "https://cdn.jsdelivr.net/npm/@goongmaps/goong-js@1.0.9/dist/goong-js.css";
const GOONG_JS = "https://cdn.jsdelivr.net/npm/@goongmaps/goong-js@1.0.9/dist/goong-js.js";
const GOONG_STYLE = "https://tiles.goong.io/assets/goong_map_web.json";
const DEFAULT_CENTER: [number, number] = [21.02889, 105.8525]; // lat, lng
const DEFAULT_ZOOM = 14;
const PIN_ZOOM = 16;

type LeafletNs = any;
type GoongNs = any;

let leafletPromise: Promise<LeafletNs> | null = null;
let goongPromise: Promise<GoongNs> | null = null;

function ensureCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string, globalKey: string): Promise<any> {
  const w = window as any;
  if (w[globalKey]) return Promise.resolve(w[globalKey]);
  const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(w[globalKey]));
      existing.addEventListener("error", () => reject(new Error(`Không tải được ${src}`)));
      if (w[globalKey]) resolve(w[globalKey]);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(w[globalKey]);
    script.onerror = () => reject(new Error(`Không tải được ${src}`));
    document.head.appendChild(script);
  });
}

function loadLeaflet(): Promise<LeafletNs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet chỉ chạy trên browser"));
  }
  const w = window as Window & { L?: LeafletNs };
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  ensureCss(LEAFLET_CSS);
  leafletPromise = loadScript(LEAFLET_JS, "L");
  return leafletPromise;
}

function loadGoong(): Promise<GoongNs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Goong chỉ chạy trên browser"));
  }
  const w = window as Window & { goongjs?: GoongNs };
  if (w.goongjs) return Promise.resolve(w.goongjs);
  if (goongPromise) return goongPromise;
  ensureCss(GOONG_CSS);
  goongPromise = loadScript(GOONG_JS, "goongjs");
  return goongPromise;
}

type Props = {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  className?: string;
};

/**
 * Bản đồ pin: OSM (Leaflet) hoặc Goong (goong-js) theo cấu hình Tích hợp.
 */
export function OfficeLocationMap({ lat, lng, onPick, className }: Props) {
  const mapProvider = useStore((s) => s.integrations.mapProvider ?? "OSM");
  const goongMapTilesKey = useStore((s) => s.integrations.goongMapTilesKey);
  const useGoong = mapProvider === "GOONG" && Boolean(goongMapTilesKey?.trim());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const engineRef = useRef<"OSM" | "GOONG" | null>(null);
  const onPickRef = useRef(onPick);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  onPickRef.current = onPick;
  latRef.current = lat;
  lngRef.current = lng;

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: number | undefined;

    const destroy = () => {
      if (!mapRef.current) return;
      try {
        if (engineRef.current === "GOONG") {
          markerRef.current?.remove?.();
          mapRef.current?.remove?.();
        } else {
          mapRef.current?.remove?.();
        }
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      markerRef.current = null;
      engineRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };

    destroy();

    void (async () => {
      try {
        if (cancelled || !containerRef.current) return;

        const startLat = latRef.current;
        const startLng = lngRef.current;
        const hasPin = startLat != null && startLng != null;
        const centerLat = hasPin ? startLat! : DEFAULT_CENTER[0];
        const centerLng = hasPin ? startLng! : DEFAULT_CENTER[1];
        const zoom = hasPin ? PIN_ZOOM : DEFAULT_ZOOM;

        if (useGoong) {
          const goongjs = await loadGoong();
          if (cancelled || !containerRef.current) return;
          goongjs.accessToken = goongMapTilesKey!.trim();
          const map = new goongjs.Map({
            container: containerRef.current,
            style: GOONG_STYLE,
            center: [centerLng, centerLat],
            zoom,
          });
          const marker = new goongjs.Marker({ draggable: true })
            .setLngLat([centerLng, centerLat])
            .addTo(map);

          marker.on("dragend", () => {
            const p = marker.getLngLat();
            onPickRef.current(p.lat, p.lng);
          });
          map.on("click", (e: any) => {
            const ll = e.lngLat;
            marker.setLngLat([ll.lng, ll.lat]);
            onPickRef.current(ll.lat, ll.lng);
          });

          mapRef.current = map;
          markerRef.current = marker;
          engineRef.current = "GOONG";
          resizeTimer = window.setTimeout(() => {
            map.resize?.();
            if (latRef.current != null && lngRef.current != null) {
              map.setCenter([lngRef.current, latRef.current]);
              map.setZoom(PIN_ZOOM);
              marker.setLngLat([lngRef.current, latRef.current]);
            }
          }, 150);
          return;
        }

        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [centerLat, centerLng],
          zoom,
          scrollWheelZoom: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([centerLat, centerLng], { draggable: true }).addTo(map);
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
        engineRef.current = "OSM";
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
      destroy();
    };
  }, [useGoong, goongMapTilesKey]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return;
    if (engineRef.current === "GOONG") {
      marker.setLngLat([lng, lat]);
      map.setCenter([lng, lat]);
      map.setZoom(PIN_ZOOM);
      window.setTimeout(() => map.resize?.(), 50);
    } else {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], PIN_ZOOM, { animate: true });
      window.setTimeout(() => map.invalidateSize(), 50);
    }
  }, [lat, lng]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      window.setTimeout(() => {
        if (engineRef.current === "GOONG") mapRef.current?.resize?.();
        else mapRef.current?.invalidateSize?.();
      }, 40);
    });
    ro.observe(el);
    window.setTimeout(() => {
      if (engineRef.current === "GOONG") mapRef.current?.resize?.();
      else mapRef.current?.invalidateSize?.();
    }, 100);
    return () => ro.disconnect();
  }, [useGoong, goongMapTilesKey]);

  const missingGoongKey = mapProvider === "GOONG" && !goongMapTilesKey?.trim();

  return (
    <div className="relative w-full">
      {missingGoongKey ? (
        <p className="mb-1 text-xs text-amber-700">
          Đã chọn Goong nhưng chưa có Map tiles key — đang dùng OSM. Vào Tích hợp để nhập key.
        </p>
      ) : null}
      <div
        ref={containerRef}
        className={className ?? "h-80 w-full overflow-hidden rounded-md border z-0"}
        aria-label="Bản đồ vị trí văn phòng"
      />
    </div>
  );
}
