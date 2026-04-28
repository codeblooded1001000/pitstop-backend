import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { RedisService } from "../../common/redis/redis.service";

export type ReverseGeocodePlace = {
  lat: number;
  lng: number;
  displayName: string;
  shortName: string;
  address: {
    houseNumber: string | null;
    road: string | null;
    neighbourhood: string | null;
    suburb: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
    countryCode: string | null;
  };
  types: string[];
  provider: "nominatim";
  providerPlaceId: string;
  confidence: number | null;
};

@Injectable()
export class ReverseGeocodeService {
  constructor(private readonly redis: RedisService) {}

  async reverse(params: {
    lat: number;
    lng: number;
    lang: string;
    zoom: number;
  }): Promise<ReverseGeocodePlace> {
    const cacheKey = buildCacheKey(params);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ReverseGeocodePlace;
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(params.lat));
    url.searchParams.set("lon", String(params.lng));
    url.searchParams.set("zoom", String(params.zoom));
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Language": params.lang,
        // Nominatim usage policy requires a valid User-Agent identifying the application.
        "User-Agent": "Pitstop/1.0 (reverse-geocode; contact=dev@pitstop.local)"
      }
    });

    if (res.status === 429) {
      const error = new Error("RATE_LIMITED");
      (error as { code?: string }).code = "RATE_LIMITED";
      throw error;
    }

    if (!res.ok) {
      const error = new Error(`UPSTREAM_HTTP_${res.status}`);
      (error as { code?: string }).code = "UPSTREAM_ERROR";
      throw error;
    }

    const data = (await res.json()) as NominatimReverseResponse;
    const place = parseNominatim(data, params.lat, params.lng);

    // Cache for 30 days by default (same as our other Places caches).
    await this.redis.set(cacheKey, JSON.stringify(place), 30 * 24 * 60 * 60);
    return place;
  }
}

type NominatimReverseResponse = {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  category?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    city_district?: string;
    district?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
};

function parseNominatim(data: NominatimReverseResponse, fallbackLat: number, fallbackLng: number): ReverseGeocodePlace {
  const lat = Number(data.lat ?? fallbackLat);
  const lng = Number(data.lon ?? fallbackLng);

  const displayName = typeof data.display_name === "string" ? data.display_name : `${fallbackLat},${fallbackLng}`;

  const addr = data.address ?? {};
  const city = addr.city ?? addr.town ?? addr.village ?? null;
  const district = addr.district ?? addr.city_district ?? null;

  const address = {
    houseNumber: addr.house_number ?? null,
    road: addr.road ?? null,
    neighbourhood: addr.neighbourhood ?? null,
    suburb: addr.suburb ?? null,
    city,
    district,
    state: addr.state ?? null,
    postcode: addr.postcode ?? null,
    country: addr.country ?? null,
    countryCode: addr.country_code ? String(addr.country_code).toLowerCase() : null
  };

  const shortName =
    address.neighbourhood ??
    address.suburb ??
    address.city ??
    address.road ??
    (typeof data.name === "string" ? data.name : null) ??
    `${round4(lat)},${round4(lng)}`;

  const types = normalizeTypes([data.addresstype, data.category, data.type].filter(Boolean).map(String));

  const confidence = typeof data.importance === "number" && Number.isFinite(data.importance)
    ? clamp01(data.importance)
    : null;

  return {
    lat,
    lng,
    displayName,
    shortName,
    address,
    types,
    provider: "nominatim",
    providerPlaceId: String(data.place_id ?? ""),
    confidence
  };
}

function normalizeTypes(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const cleaned = v.trim().toLowerCase();
    if (!cleaned) continue;
    out.add(cleaned);
  }
  return Array.from(out);
}

function buildCacheKey(params: { lat: number; lng: number; lang: string; zoom: number }): string {
  const input = `${round4(params.lat)}:${round4(params.lng)}:${params.lang}:${params.zoom}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `nominatim:reverse:${hash}`;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

