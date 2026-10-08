import { apiRequest, isApiEnabled } from "@/lib/api/client";

/** Lấy vĩ độ / kinh độ từ link Google Maps. Ưu tiên điểm địa điểm (!3d/!4d), rồi tâm bản đồ (@lat,lng). */
export function latLngFromGoogleMapsLink(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;

  const place = lastPlacePin(text);
  if (place) return place;

  const at = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:[,/]|$)/);
  const fromAt = pair(at?.[1], at?.[2]);
  if (fromAt) return fromAt;

  try {
    const url = new URL(text);
    for (const key of ["q", "query", "ll", "center", "destination"]) {
      const value = url.searchParams.get(key);
      const hit = value?.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      const parsed = pair(hit?.[1], hit?.[2]);
      if (parsed) return parsed;
    }
  } catch {
    /* không phải URL đầy đủ */
  }

  const bare = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return pair(bare?.[1], bare?.[2]);
}

/** Link maps.app.goo.gl / goo.gl — GPS chỉ có sau khi mở redirect. */
export function isShortGoogleMapsLink(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl";
  } catch {
    return false;
  }
}

/** Mở link rút gọn trên máy chủ rồi lấy GPS địa điểm. */
export async function resolveGoogleMapsLink(raw: string): Promise<{ lat: number; lng: number } | null> {
  const local = latLngFromGoogleMapsLink(raw);
  if (local) return local;
  const text = raw.trim();
  if (!isShortGoogleMapsLink(text) || !isApiEnabled()) return null;
  const res = await apiRequest<{ lat?: number; lng?: number }>(
    `/api/geo/maps-link?url=${encodeURIComponent(text)}`,
  );
  return pair(res?.lat != null ? String(res.lat) : undefined, res?.lng != null ? String(res.lng) : undefined);
}

function lastPlacePin(text: string): { lat: number; lng: number } | null {
  const re = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g;
  let hit: { lat: number; lng: number } | null = null;
  for (const m of text.matchAll(re)) {
    const pin = pair(m[1], m[2]);
    if (pin) hit = pin;
  }
  return hit;
}

function pair(latRaw?: string, lngRaw?: string): { lat: number; lng: number } | null {
  if (latRaw == null || lngRaw == null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
