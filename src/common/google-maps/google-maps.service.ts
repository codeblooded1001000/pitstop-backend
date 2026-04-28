import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { RedisService } from "../redis/redis.service";

type DailyLimitKey = "geocoding" | "directions" | "placesNearby" | "autocomplete";

export type GeocodeResult = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  formattedAddress: string;
};

export type AutocompletePrediction = {
  placeId: string;
  description: string;
};

export type DirectionsRoute = {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  legs: unknown;
  originAddress?: string;
  destinationAddress?: string;
};

export type PlacesNearbyResult = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  types: string[];
};

@Injectable()
export class GoogleMapsService {
  private readonly apiKey: string;
  private readonly dailyLimits: Record<DailyLimitKey, number>;

  constructor(private readonly redis: RedisService) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error("GOOGLE_MAPS_API_KEY is required");
    }
    this.apiKey = key;

    this.dailyLimits = {
      geocoding: 500,
      directions: 1000,
      placesNearby: 200,
      autocomplete: 2000
    };
  }

  private todayKey(api: DailyLimitKey): string {
    const today = new Date().toISOString().slice(0, 10);
    return `gmaps:${api}:${today}`;
  }

  private async withDailyCap<T>(api: DailyLimitKey, fn: () => Promise<T>): Promise<T> {
    const key = this.todayKey(api);
    const current = await this.redis.get(key);
    const count = current ? Number(current) : 0;

    if (count >= this.dailyLimits[api]) {
      throw new Error(`Daily limit hit for Google Maps ${api}`);
    }

    const result = await fn();

    const next = await this.redis.incr(key);
    if (next === 1) {
      await this.redis.expire(key, 60 * 60 * 24);
    }

    return result;
  }

  private cacheKey(prefix: string, input: string): string {
    const hash = createHash("sha256").update(input).digest("hex");
    return `gmaps:${prefix}:${hash}`;
  }

  async geocode(params: { address?: string; placeId?: string }, ttlDays = 30): Promise<GeocodeResult> {
    const address = params.address?.trim();
    const placeId = params.placeId?.trim();
    if (!address && !placeId) {
      throw new Error("Either address or placeId is required for geocoding");
    }

    const ttlSeconds = ttlDays * 24 * 60 * 60;
    const cacheInput = address ? `address:${address.toLowerCase()}` : `placeId:${placeId}`;
    const key = this.cacheKey("geocode", cacheInput);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as GeocodeResult;
    }

    const query = new URLSearchParams({ key: this.apiKey, region: "in" });
    if (address) {
      query.set("address", address);
    } else if (placeId) {
      query.set("place_id", placeId);
    }

    const data = await this.withDailyCap("geocoding", async () => {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`);
      if (!res.ok) {
        throw new Error(`Geocoding failed with HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    });

    const parsed = parseGeocodeResponse(data);
    await this.redis.set(key, JSON.stringify(parsed), ttlSeconds);
    return parsed;
  }

  async geocodeAddress(address: string, ttlDays = 30): Promise<GeocodeResult> {
    return this.geocode({ address }, ttlDays);
  }

  async autocomplete(input: string, sessionToken: string, ttlMinutes = 10): Promise<AutocompletePrediction[]> {
    const ttlSeconds = ttlMinutes * 60;
    const key = this.cacheKey("autocomplete", `${sessionToken}:${input.trim().toLowerCase()}`);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as AutocompletePrediction[];
    }

    const params = new URLSearchParams({
      input,
      sessiontoken: sessionToken,
      key: this.apiKey,
      components: "country:in"
    });

    const data = await this.withDailyCap("autocomplete", async () => {

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
      );
      if (!res.ok) {
        throw new Error(`Autocomplete failed with HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    });

    const predictions = parseAutocompleteResponse(data);
    await this.redis.set(key, JSON.stringify(predictions), ttlSeconds);
    return predictions;
  }

  async directions(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<DirectionsRoute> {
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      key: this.apiKey,
      mode: "driving",
      alternatives: "false",
      units: "metric",
      region: "in"
    });

    const data = await this.withDailyCap("directions", async () => {
      const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Directions failed with HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    });

    return parseDirectionsResponse(data);
  }

  async placesNearby(params: {
    lat: number;
    lng: number;
    radiusMeters: number;
    type: "gas_station" | "restaurant" | "cafe" | "ev_charging_station";
  }): Promise<PlacesNearbyResult[]> {
    const qs = new URLSearchParams({
      location: `${params.lat},${params.lng}`,
      radius: String(params.radiusMeters),
      type: params.type,
      key: this.apiKey
    });

    const data = await this.withDailyCap("placesNearby", async () => {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${qs.toString()}`
      );
      if (!res.ok) {
        throw new Error(`Places Nearby failed with HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    });

    return parsePlacesNearbyResponse(data);
  }
}

function parseGeocodeResponse(data: unknown): GeocodeResult {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid geocode response");
  }

  const status = (data as { status?: unknown }).status;
  if (status !== "OK") {
    const msg = (data as { error_message?: unknown }).error_message;
    throw new Error(`Geocode error: ${String(status)}${msg ? ` (${String(msg)})` : ""}`);
  }

  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length < 1) {
    throw new Error("Geocode returned no results");
  }

  const first = results[0] as {
    geometry?: unknown;
    formatted_address?: unknown;
    place_id?: unknown;
    address_components?: unknown;
  };
  const formattedAddress = typeof first.formatted_address === "string" ? first.formatted_address : "";
  const placeId = typeof first.place_id === "string" ? first.place_id : "";

  const geometry = first.geometry as { location?: unknown } | undefined;
  const location = geometry?.location as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Geocode missing lat/lng");
  }

  const name = extractGeocodeName(first.address_components, formattedAddress);
  return { placeId, name, lat, lng, formattedAddress };
}

function extractGeocodeName(addressComponentsRaw: unknown, formattedAddress: string): string {
  if (!Array.isArray(addressComponentsRaw)) {
    return formattedAddress.split(",")[0]?.trim() || formattedAddress;
  }

  const addressComponents = addressComponentsRaw as Array<{ long_name?: unknown; types?: unknown }>;
  const preferredTypeOrder = [
    "point_of_interest",
    "premise",
    "subpremise",
    "neighborhood",
    "sublocality",
    "locality"
  ];

  for (const type of preferredTypeOrder) {
    const comp = addressComponents.find((c) => Array.isArray(c.types) && c.types.includes(type));
    if (comp && typeof comp.long_name === "string") {
      return comp.long_name;
    }
  }

  return formattedAddress.split(",")[0]?.trim() || formattedAddress;
}

function parseAutocompleteResponse(data: unknown): AutocompletePrediction[] {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid autocomplete response");
  }

  const status = (data as { status?: unknown }).status;
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    const msg = (data as { error_message?: unknown }).error_message;
    throw new Error(`Autocomplete error: ${String(status)}${msg ? ` (${String(msg)})` : ""}`);
  }

  const predictions = (data as { predictions?: unknown }).predictions;
  if (!Array.isArray(predictions)) {
    return [];
  }

  return predictions
    .map((p) => {
      const placeId = (p as { place_id?: unknown }).place_id;
      const description = (p as { description?: unknown }).description;
      if (typeof placeId !== "string" || typeof description !== "string") {
        return null;
      }
      return { placeId, description };
    })
    .filter((p): p is AutocompletePrediction => Boolean(p));
}

function parseDirectionsResponse(data: unknown): DirectionsRoute {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid directions response");
  }

  const status = (data as { status?: unknown }).status;
  if (status !== "OK") {
    const msg = (data as { error_message?: unknown }).error_message;
    throw new Error(`Directions error: ${String(status)}${msg ? ` (${String(msg)})` : ""}`);
  }

  const routes = (data as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || routes.length < 1) {
    throw new Error("Directions returned no routes");
  }

  const route0 = routes[0] as {
    overview_polyline?: { points?: unknown };
    legs?: unknown;
  };

  const encodedPolyline = typeof route0.overview_polyline?.points === "string" ? route0.overview_polyline.points : "";
  if (!encodedPolyline) {
    throw new Error("Directions missing overview polyline");
  }

  const legs = route0.legs;
  const legsArray = Array.isArray(legs) ? (legs as Array<Record<string, unknown>>) : [];
  const firstLeg = legsArray[0];
  const lastLeg = legsArray[legsArray.length - 1];

  const distanceMeters = legsArray.reduce((sum, leg) => {
    const dist = (leg.distance as { value?: unknown } | undefined)?.value;
    return sum + (Number(dist) || 0);
  }, 0);
  const durationSeconds = legsArray.reduce((sum, leg) => {
    const dur = (leg.duration as { value?: unknown } | undefined)?.value;
    return sum + (Number(dur) || 0);
  }, 0);

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new Error("Directions missing distance");
  }

  return {
    encodedPolyline,
    distanceMeters,
    durationSeconds,
    legs: route0.legs ?? [],
    originAddress: typeof (firstLeg?.start_address as unknown) === "string" ? (firstLeg.start_address as string) : undefined,
    destinationAddress:
      typeof (lastLeg?.end_address as unknown) === "string" ? (lastLeg.end_address as string) : undefined
  };
}

function parsePlacesNearbyResponse(data: unknown): PlacesNearbyResult[] {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid places nearby response");
  }

  const status = (data as { status?: unknown }).status;
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    const msg = (data as { error_message?: unknown }).error_message;
    throw new Error(`Places Nearby error: ${String(status)}${msg ? ` (${String(msg)})` : ""}`);
  }

  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  const parsed = results
    .map((r): PlacesNearbyResult | null => {
      const placeId = (r as { place_id?: unknown }).place_id;
      const name = (r as { name?: unknown }).name;
      const types = (r as { types?: unknown }).types;
      const rating = (r as { rating?: unknown }).rating;
      const userRatingsTotal = (r as { user_ratings_total?: unknown }).user_ratings_total;
      const geometry = (r as { geometry?: unknown }).geometry as { location?: unknown } | undefined;
      const location = geometry?.location as { lat?: unknown; lng?: unknown } | undefined;
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);

      if (typeof placeId !== "string" || typeof name !== "string" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      const out: PlacesNearbyResult = {
        placeId,
        name,
        lat,
        lng,
        types: Array.isArray(types) ? types.map((t) => String(t)) : []
      };
      if (typeof rating === "number") out.rating = rating;
      if (typeof userRatingsTotal === "number") out.userRatingsTotal = userRatingsTotal;
      return out;
    })
    .filter((r): r is PlacesNearbyResult => r !== null);

  return parsed;
}

