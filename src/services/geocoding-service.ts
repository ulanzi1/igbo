import "server-only";
import { env } from "@/env";

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
}

export interface GeocodingService {
  geocode(query: string): Promise<GeocodingResult | null>;
}

// No-op geocoder for launch mode — always returns null.
// Active when ENABLE_GEOCODING !== "true".
export class NoOpGeocodingService implements GeocodingService {
  async geocode(_query: string): Promise<GeocodingResult | null> {
    return null;
  }
}

export class NominatimGeocodingService implements GeocodingService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
  }

  async geocode(query: string): Promise<GeocodingResult | null> {
    if (!query.trim()) return null;

    const url = new URL("/search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          // Required by Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
          "User-Agent": "OBIGBO Community Platform",
        },
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
          country?: string;
          country_code?: string;
        };
      }>;

      if (!results.length) return null;

      const first = results[0]!;
      const addr = first.address ?? {};

      return {
        lat: parseFloat(first.lat),
        lng: parseFloat(first.lon),
        displayName: first.display_name,
        city: addr.city ?? addr.town ?? addr.village,
        state: addr.state,
        country: addr.country,
        countryCode: addr.country_code,
      };
    } catch {
      // Network error, timeout, or parse error — treat as not found
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createGeocodingService(): GeocodingService {
  return env.ENABLE_GEOCODING === "true"
    ? new NominatimGeocodingService()
    : new NoOpGeocodingService();
}
