/** Lấy vĩ độ / kinh độ từ link Google Maps (dạng @lat,lng hoặc !3d/!4d). */
export function latLngFromGoogleMapsLink(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;

  const at = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:[,/]|$)/);
  const fromAt = pair(at?.[1], at?.[2]);
  if (fromAt) return fromAt;

  const place = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const fromPlace = pair(place?.[1], place?.[2]);
  if (fromPlace) return fromPlace;

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

function pair(latRaw?: string, lngRaw?: string): { lat: number; lng: number } | null {
  if (latRaw == null || lngRaw == null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
