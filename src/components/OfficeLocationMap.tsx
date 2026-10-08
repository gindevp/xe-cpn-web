import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { isShortGoogleMapsLink, latLngFromGoogleMapsLink, resolveGoogleMapsLink } from "@/lib/google-maps-link";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const GOONG_CSS = "https://cdn.jsdelivr.net/npm/@goongmaps/goong-js@1.0.9/dist/goong-js.css";
const GOONG_JS = "https://cdn.jsdelivr.net/npm/@goongmaps/goong-js@1.0.9/dist/goong-js.js";
const GOONG_STYLE = "https://tiles.goong.io/assets/goong_map_web.json";
const DEFAULT_CENTER: [number, number] = [21.02889, 105.8525]; // lat, lng
const DEFAULT_ZOOM = 14;
const PIN_ZOOM = 16;
const GOONG_FIX_CSS_ID = "cpn-goong-map-fix";

type LeafletNs = any;
type GoongNs = any;

let leafletPromise: Promise<LeafletNs> | null = null;
let goongPromise: Promise<GoongNs> | null = null;

function ensureCss(href: string): Promise<void> {
  const existing = document.querySelector(`link[href="${href}"]`) as HTMLLinkElement | null;
  if (existing) {
    if (existing.sheet || (existing as any).loaded) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      // đã cache sẵn
      window.setTimeout(() => resolve(), 50);
    });
  }
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

/** Tailwind/Leaflet dễ làm canvas Goong (mapboxgl) cao = 0 → nền trắng. */
function ensureGoongFixCss() {
  if (document.getElementById(GOONG_FIX_CSS_ID)) return;
  const style = document.createElement("style");
  style.id = GOONG_FIX_CSS_ID;
  style.textContent = `
    .cpn-map-host.mapboxgl-map,
    .cpn-map-host .mapboxgl-map {
      width: 100% !important;
      height: 100% !important;
      position: relative !important;
    }
    .cpn-map-host .mapboxgl-canvas,
    .cpn-map-host canvas.mapboxgl-canvas {
      max-width: none !important;
      max-height: none !important;
    }
    .cpn-map-host .mapboxgl-canvas-container,
    .cpn-map-host .mapboxgl-marker {
      max-width: none;
    }
  `;
  document.head.appendChild(style);
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
  leafletPromise = (async () => {
    await ensureCss(LEAFLET_CSS);
    return loadScript(LEAFLET_JS, "L");
  })();
  return leafletPromise;
}

function loadGoong(): Promise<GoongNs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Goong chỉ chạy trên browser"));
  }
  const w = window as Window & { goongjs?: GoongNs };
  if (w.goongjs) {
    ensureGoongFixCss();
    return Promise.resolve(w.goongjs);
  }
  if (goongPromise) return goongPromise;
  goongPromise = (async () => {
    ensureGoongFixCss();
    await ensureCss(GOONG_CSS);
    return loadScript(GOONG_JS, "goongjs");
  })();
  return goongPromise;
}

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** tile.openstreetmap.org hay bị nhà mạng VN reset kết nối (nhất là 4G) → ưu tiên nguồn khác cùng dữ liệu OSM. */
const TILE_SOURCES: Array<{ url: string; options: Record<string, unknown> }> = [
  {
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    options: { subdomains: "abc", maxZoom: 19, attribution: `${OSM_ATTRIBUTION} &middot; OSM France` },
  },
  {
    url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
    options: { maxZoom: 18, attribution: OSM_ATTRIBUTION },
  },
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: OSM_ATTRIBUTION },
  },
];
const TILE_ERRORS_BEFORE_SWITCH = 4;

function addTileLayerWithFallback(L: LeafletNs, map: any, index = 0) {
  const source = TILE_SOURCES[index];
  if (!source) return;
  const layer = L.tileLayer(source.url, source.options);
  let errors = 0;
  let loaded = 0;
  layer.on("tileload", () => {
    loaded += 1;
  });
  layer.on("tileerror", () => {
    errors += 1;
    if (loaded === 0 && errors >= TILE_ERRORS_BEFORE_SWITCH && index + 1 < TILE_SOURCES.length) {
      layer.off();
      map.removeLayer(layer);
      addTileLayerWithFallback(L, map, index + 1);
    }
  });
  layer.addTo(map);
}

function resetContainer(el: HTMLElement, className: string) {
  try {
    el.replaceChildren();
  } catch {
    el.innerHTML = "";
  }
  // Leaflet/Goong gắn class lên chính container — phải reset sạch khi đổi engine.
  el.className = className;
  el.removeAttribute("tabindex");
  el.style.cssText = "";
}

type Props = {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  className?: string;
  /** Ô dán link. Tắt khi link đã nằm trong popup địa chỉ. */
  showLink?: boolean;
};

/**
 * Bản đồ pin: OpenStreetMap (Leaflet). Không dùng Goong.
 */
export function OfficeLocationMap({ lat, lng, onPick, className, showLink = true }: Props) {
  const mapProvider = "OSM" as const;
  const goongMapTilesKey = "";
  const goongRestKey = "";
  const tilesKey = "";
  const [forceOsm, setForceOsm] = useState(false);
  const useGoong = false;

  const hostClass =
    className ?? "h-80 w-full overflow-hidden rounded-md border z-0";
  // Goong cần chiều cao thật (px). h-auto + aspect-ratio hay ra canvas trắng.
  const goongHostClass = useGoong
    ? `${hostClass.replace(/\bh-auto\b/g, "").replace(/\baspect-\[[^\]]+\]/g, "")} h-64 min-h-52 sm:h-72 cpn-map-host`
    : `${hostClass} cpn-map-host`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const engineRef = useRef<"OSM" | "GOONG" | null>(null);
  const onPickRef = useRef(onPick);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLink, setMapLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const linkReq = useRef(0);
  onPickRef.current = onPick;
  latRef.current = lat;
  lngRef.current = lng;

  useEffect(() => {
    setForceOsm(false);
  }, [tilesKey, mapProvider]);

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: number | undefined;
    const remountKey = `${useGoong ? "GOONG" : "OSM"}:${tilesKey}`;

    const destroy = () => {
      if (mapRef.current) {
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
      }
      mapRef.current = null;
      markerRef.current = null;
      engineRef.current = null;
      if (containerRef.current) resetContainer(containerRef.current, goongHostClass);
    };

    destroy();
    if (!forceOsm) setMapError(null);

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

          // Đợi layout có width/height trước khi tạo map (tránh canvas 0×0).
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (cancelled || !containerRef.current) return;

          const el = containerRef.current;
          if (el.clientHeight < 40) {
            el.style.height = "288px";
          }

          const origin = window.location.origin;
          const deny = (status?: number) => {
            const code = status ? ` HTTP ${status}` : "";
            setMapError(
              `Goong từ chối tile${code} từ ${origin}. Dùng Map tiles key (không phải REST key) và thêm URL ${origin}/* trên account.goong.io. Đang hiện OpenStreetMap để vẫn chọn được điểm.`,
            );
            setForceOsm(true);
          };

          try {
            const probe = await fetch(`${GOONG_STYLE}?api_key=${encodeURIComponent(tilesKey)}`);
            if (!probe.ok) {
              if (!cancelled) deny(probe.status);
              return;
            }
          } catch {
            if (!cancelled) deny();
            return;
          }
          if (cancelled || !containerRef.current) return;

          goongjs.accessToken = tilesKey;
          const map = new goongjs.Map({
            container: el,
            style: GOONG_STYLE,
            center: [centerLng, centerLat],
            zoom,
            accessToken: tilesKey,
            attributionControl: true,
          });

          const bumpSize = () => {
            try {
              map.resize();
            } catch {
              /* ignore */
            }
          };

          map.on("load", bumpSize);
          map.on("idle", bumpSize);
          map.on("error", (e: any) => {
            const status = Number(e?.error?.status || 0);
            const msg = String(e?.error?.message || e?.message || "");
            if (/abort|cancell?ed/i.test(msg)) return;
            if (status === 401 || status === 403 || /401|403|unauthorized|access token|not authorized|forbidden/i.test(msg)) {
              deny(status || undefined);
            }
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
            bumpSize();
            if (latRef.current != null && lngRef.current != null) {
              map.setCenter([lngRef.current, latRef.current]);
              map.setZoom(PIN_ZOOM);
              marker.setLngLat([lngRef.current, latRef.current]);
            }
          }, 200);
          void remountKey;
          return;
        }

        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [centerLat, centerLng],
          zoom,
          scrollWheelZoom: true,
        });
        addTileLayerWithFallback(L, map);

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
      } catch (e: any) {
        if (!cancelled) setMapError(e?.message ?? "Không khởi tạo được bản đồ");
      }
    })();

    return () => {
      cancelled = true;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      destroy();
    };
  }, [useGoong, tilesKey, goongHostClass]);

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
  }, [useGoong, tilesKey]);

  const missingGoongKey = mapProvider === "GOONG" && !tilesKey;
  const maybeRestAsTiles =
    useGoong &&
    goongRestKey?.trim() &&
    tilesKey &&
    goongRestKey.trim() === tilesKey;

  const applyMapLink = (value: string) => {
    setMapLink(value);
    const text = value.trim();
    const req = ++linkReq.current;
    if (!text) {
      setLinkBusy(false);
      setLinkError(null);
      return;
    }
    const hit = latLngFromGoogleMapsLink(text);
    if (hit) {
      setLinkBusy(false);
      setLinkError(null);
      onPickRef.current(hit.lat, hit.lng);
      return;
    }
    if (!isShortGoogleMapsLink(text)) {
      setLinkBusy(false);
      setLinkError(
        /google\.|goo\.gl|maps\.app/i.test(text)
          ? "Không thấy GPS trong link. Dán link maps.app.goo.gl hoặc link có @vĩ độ,kinh độ."
          : null,
      );
      return;
    }
    setLinkError(null);
    setLinkBusy(true);
    void resolveGoogleMapsLink(text)
      .then((pin) => {
        if (req !== linkReq.current) return;
        if (pin) {
          setLinkError(null);
          onPickRef.current(pin.lat, pin.lng);
        } else setLinkError("Không lấy được GPS từ link rút gọn.");
      })
      .catch((e: unknown) => {
        if (req !== linkReq.current) return;
        setLinkError(e instanceof Error ? e.message : "Không mở được link Google Maps.");
      })
      .finally(() => {
        if (req === linkReq.current) setLinkBusy(false);
      });
  };

  return (
    <div className="relative w-full space-y-1.5">
      {showLink ? (
        <Input
          value={mapLink}
          onChange={(e) => applyMapLink(e.target.value)}
          placeholder="Dán link Google Maps, ví dụ https://www.google.com/maps/@20.9750433,105.8462296,14.5z"
          className="w-full"
          aria-label="Link Google Maps"
        />
      ) : null}
      {showLink && linkBusy ? <p className="text-xs text-muted-foreground">Đang mở link để lấy GPS…</p> : null}
      {showLink && linkError ? <p className="text-xs text-destructive">{linkError}</p> : null}
      {missingGoongKey ? (
        <p className="mb-1 text-xs text-amber-700">
          Đã chọn Goong nhưng chưa có Map tiles key — đang dùng OSM. Vào Tích hợp để nhập key.
        </p>
      ) : null}
      {maybeRestAsTiles ? (
        <p className="mb-1 text-xs text-amber-700">
          Map tiles key đang trùng REST Places key — Goong cần 2 key khác nhau; trùng thường khiến bản đồ trắng.
        </p>
      ) : null}
      {mapError ? <p className="mb-1 text-xs text-destructive">{mapError}</p> : null}
      <div
        ref={containerRef}
        className={goongHostClass}
        aria-label="Bản đồ vị trí văn phòng"
      />
    </div>
  );
}
