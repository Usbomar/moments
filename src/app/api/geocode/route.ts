import { NextRequest, NextResponse } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string>;
};

function pickCity(addr: Record<string, string> | undefined): string {
  if (!addr) return "Unknown";
  const order = [
    "city",
    "town",
    "village",
    "hamlet",
    "municipality",
    "suburb",
    "city_district",
    "county",
    "state_district",
    "state"
  ];
  for (const k of order) {
    const v = addr[k];
    if (v) return v;
  }
  if (addr.amenity) return addr.amenity;
  if (addr.shop) return addr.shop;
  if (addr.tourism) return addr.tourism;
  if (addr.road) return addr.road;
  return "Unknown";
}

function pickCountry(addr: Record<string, string> | undefined): string {
  if (!addr) return "Unknown";
  return addr.country || "Unknown";
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length > 280) {
    return NextResponse.json({ error: "invalid q" }, { status: 400 });
  }

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Moments/1.0 (https://github.com/Usbomar/moments; contact via repo)",
        Accept: "application/json",
        "Accept-Language": "ca,es,en"
      },
      cache: "no-store"
    });

    if (!res.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const data = (await res.json()) as NominatimHit[];
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const hit = data[0];
    const lat = Number.parseFloat(hit.lat);
    const lng = Number.parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "bad coordinates" }, { status: 502 });
    }

    const city = pickCity(hit.address);
    const country = pickCountry(hit.address);

    return NextResponse.json({
      lat,
      lng,
      city,
      country,
      displayName: hit.display_name ?? null,
      boundingbox: hit.boundingbox ?? null
    });
  } catch {
    return NextResponse.json({ error: "geocode failed" }, { status: 500 });
  }
}
