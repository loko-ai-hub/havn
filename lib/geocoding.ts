// Thin Google Maps Geocoding wrapper. Server-side only — never import from a
// client component or the API key would leak. Used to autofill city/state/zip
// from a typed street address in the Add Community flow.

type ParsedAddress = {
  street?: string;
  city?: string;
  state?: string; // 2-letter abbr
  zip?: string;
  formatted?: string;
  lat?: number;
  lng?: number;
};

export type GeocodeResult =
  | { ok: true; address: ParsedAddress }
  | { ok: false; error: string };

function readComponent(
  components: { long_name: string; short_name: string; types: string[] }[],
  type: string,
  short = false
): string | undefined {
  const c = components.find((x) => x.types.includes(type));
  if (!c) return undefined;
  return short ? c.short_name : c.long_name;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an address to look up." };
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Address lookup is unavailable right now. Enter the fields manually.",
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("region", "us");
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", apiKey);

  let payload: {
    status: string;
    error_message?: string;
    results: {
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
      address_components: { long_name: string; short_name: string; types: string[] }[];
    }[];
  };
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: `Geocoding failed (${res.status}).` };
    }
    payload = await res.json();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error during lookup.",
    };
  }

  if (payload.status === "ZERO_RESULTS") {
    return {
      ok: false,
      error: "We couldn't find that address. Double-check the spelling or enter the fields manually.",
    };
  }
  if (payload.status !== "OK" || !payload.results.length) {
    return {
      ok: false,
      error: payload.error_message ?? `Geocoding returned ${payload.status}.`,
    };
  }

  const top = payload.results[0];
  const c = top.address_components;
  const streetNumber = readComponent(c, "street_number") ?? "";
  const route = readComponent(c, "route") ?? "";
  const street = [streetNumber, route].filter(Boolean).join(" ").trim() || undefined;
  const city =
    readComponent(c, "locality") ??
    readComponent(c, "sublocality") ??
    readComponent(c, "postal_town") ??
    readComponent(c, "neighborhood");
  const state = readComponent(c, "administrative_area_level_1", true);
  const zip = readComponent(c, "postal_code");

  return {
    ok: true,
    address: {
      street,
      city,
      state,
      zip,
      formatted: top.formatted_address,
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
    },
  };
}
