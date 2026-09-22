import { apiRequest, isApiEnabled } from "./client";
import { provinceCentroid } from "../vn-province-centroids";

export type GeoSuggestion = {
  placeId: string;
  description: string;
  lat?: string | number;
  lng?: string | number;
};

export type GeoPlaceDetail = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export async function geoAutocomplete(q: string): Promise<GeoSuggestion[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  if (isApiEnabled()) {
    try {
      const rows = await apiRequest<GeoSuggestion[]>(`/api/geo/autocomplete?q=${encodeURIComponent(query)}`);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch {
      // fallback Photon
    }
  }
  return photonAutocomplete(query);
}

async function photonAutocomplete(q: string): Promise<GeoSuggestion[]> {
  const query = /việt nam|vietnam/i.test(q) ? q : `${q}, Việt Nam`;
  const url = `https://photon.komoot.io/api/?limit=5&lang=vi&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: number[] };
        properties?: Record<string, string | number | undefined>;
      }>;
    };
    const out: GeoSuggestion[] = [];
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const [lng, lat] = coords;
      const p = f.properties ?? {};
      const parts = [p.name, p.district, p.city, p.state, p.country]
        .map((x) => (x != null ? String(x).trim() : ""))
        .filter(Boolean);
      const description = [...new Set(parts)].join(", ");
      if (!description) continue;
      out.push({
        placeId: `photon:${lat},${lng}`,
        description,
        lat,
        lng,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function geoPlaceDetail(placeId: string): Promise<GeoPlaceDetail> {
  return apiRequest<GeoPlaceDetail>(`/api/geo/place?placeId=${encodeURIComponent(placeId)}`);
}

export async function geoReverse(lat: number, lng: number): Promise<GeoPlaceDetail> {
  return apiRequest<GeoPlaceDetail>(
    `/api/geo/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
  );
}

function firstCoords(rows: GeoSuggestion[]): { lat: number; lng: number } | null {
  for (const r of rows) {
    const lat = r.lat != null ? Number(r.lat) : NaN;
    const lng = r.lng != null ? Number(r.lng) : NaN;
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
  }
  return null;
}

/**
 * Ping map theo huyện/tỉnh (không cần số nhà / phường).
 * 1) Photon: huyện+tỉnh → tỉnh
 * 2) Fallback: tâm tỉnh cứng (luôn có cho tỉnh VN phổ biến)
 */
export async function geoGeocodeAddress(full: string): Promise<{ lat: number; lng: number } | null> {
  const raw = full.trim();
  if (!raw) return null;
  // street, ward, district?, province
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const province = parts[parts.length - 1] ?? "";
  const district = parts.length >= 4 ? parts[parts.length - 2] : parts.length === 3 ? "" : "";

  const queries: string[] = [];
  if (district && province) queries.push(`${district}, ${province}`);
  if (province) queries.push(province);

  for (const q of queries) {
    try {
      const rows = await geoAutocomplete(q);
      const hit = firstCoords(rows);
      if (hit) return hit;
    } catch {
      // tiếp
    }
  }

  // Luôn ping được nếu nhận ra tên tỉnh
  const centroid = provinceCentroid(province);
  if (centroid) return centroid;

  return null;
}
