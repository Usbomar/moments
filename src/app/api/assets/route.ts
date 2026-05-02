import { NextResponse } from "next/server";
import type { Asset } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

/** One row from `asset_files` as returned by PostgREST. */
type AssetFileRow = {
  original_url: string;
  preview_url: string;
  thumb_url: string;
  checksum: string;
  size: number;
};

/** Nested embed: Supabase/PostgREST may return one-to-one as object or as array of one. */
type AssetFilesNested = AssetFileRow | AssetFileRow[] | null | undefined;
type LocationNested =
  | {
      location_id: number;
      locations: {
        lat: number;
        lng: number;
        city: string | null;
        country: string | null;
      } | null;
    }
  | Array<{
      location_id: number;
      locations:
        | {
            lat: number;
            lng: number;
            city: string | null;
            country: string | null;
          }
        | Array<{
            lat: number;
            lng: number;
            city: string | null;
            country: string | null;
          }>
        | null;
    }>
  | null
  | undefined;

type TagNested = { tag: string; origin: "manual" | "auto" }[] | null | undefined;

function isAssetFileRow(value: unknown): value is AssetFileRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AssetFileRow>;
  return (
    typeof row.original_url === "string" &&
    typeof row.preview_url === "string" &&
    typeof row.thumb_url === "string" &&
    typeof row.checksum === "string" &&
    typeof row.size === "number"
  );
}

function pickFirstAssetFile(raw: AssetFilesNested): AssetFileRow | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return isAssetFileRow(first) ? first : null;
  }
  return isAssetFileRow(raw) ? raw : null;
}

function pickFirstLocation(raw: LocationNested) {
  if (raw == null) return null;
  const first = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!first?.locations) return null;
  return Array.isArray(first.locations) ? (first.locations[0] ?? null) : first.locations;
}

function parseYears(raw: string | null): [number, number] | null {
  if (!raw) return null;
  if (raw.includes("-")) {
    const [a, b] = raw.split("-");
    const min = Number.parseInt(a, 10);
    const max = Number.parseInt(b, 10);
    if (Number.isFinite(min) && Number.isFinite(max)) return [Math.min(min, max), Math.max(min, max)];
    return null;
  }
  const single = Number.parseInt(raw, 10);
  if (!Number.isFinite(single)) return null;
  return [single, single];
}

function toAsset(row: {
  id: string;
  user_id: string;
  type: "photo" | "video";
  title: string;
  taken_at: string;
  uploaded_at: string;
  width: number;
  height: number;
  duration: number | null;
  favorite: boolean;
  asset_files: AssetFilesNested;
  asset_locations: LocationNested;
  asset_tags: TagNested;
}): Asset {
  const file = pickFirstAssetFile(row.asset_files);
  const location = pickFirstLocation(row.asset_locations);
  const tags = (row.asset_tags ?? []).map((tag) => tag.tag);
  const autoTags = (row.asset_tags ?? []).filter((tag) => tag.origin === "auto").map((tag) => tag.tag);
  const resultFiles = {
    originalUrl: file?.original_url ?? "",
    previewUrl: file?.preview_url ?? "",
    thumbUrl: file?.thumb_url ?? "",
    checksum: file?.checksum ?? "",
    size: file?.size ?? 0
  };
  console.log("toAsset processing:", {
    raw_files: row.asset_files,
    picked_file: file,
    result_files: resultFiles
  });

  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    takenAt: row.taken_at,
    uploadedAt: row.uploaded_at,
    width: row.width,
    height: row.height,
    duration: row.duration ?? undefined,
    favorite: row.favorite,
    albumIds: [],
    peopleIds: [],
    tags,
    autoTags,
    location:
      location && location.city && location.country
        ? {
            lat: location.lat,
            lng: location.lng,
            city: location.city,
            country: location.country
          }
        : undefined,
    files: resultFiles
  };
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        assets: [],
        supabaseConfigured: false
      });
    }

    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const years = parseYears(url.searchParams.get("years"));
    const locations = (url.searchParams.get("locations") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const tags = (url.searchParams.get("tags") ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const q = (url.searchParams.get("q") ?? "").trim();

    let allowedIds: string[] | null = null;
    if (locations.length) {
      const { data: locRows, error: locErr } = await supabase
        .from("asset_locations")
        .select("asset_id,locations!inner(city,country)")
        .in("locations.city", locations.map((label) => label.split(",")[0].trim()));
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
      allowedIds = Array.from(new Set((locRows ?? []).map((row) => row.asset_id)));
    }

    if (tags.length) {
      const { data: tagRows, error: tagErr } = await supabase.from("asset_tags").select("asset_id").in("tag", tags);
      if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });
      const tagIds = new Set((tagRows ?? []).map((row) => row.asset_id));
      allowedIds = allowedIds == null ? Array.from(tagIds) : allowedIds.filter((id) => tagIds.has(id));
    }

    if (allowedIds && allowedIds.length === 0) {
      return NextResponse.json({ assets: [], supabaseConfigured: true });
    }

    let query = supabase
      .from("assets")
      .select(
        "id,user_id,type,title,taken_at,uploaded_at,width,height,duration,favorite,asset_files(original_url,preview_url,thumb_url,checksum,size),asset_locations(location_id,locations(lat,lng,city,country)),asset_tags(tag,origin)"
      )
      .order("taken_at", { ascending: false });

    if (years) {
      query = query
        .gte("taken_at", `${years[0]}-01-01T00:00:00.000Z`)
        .lte("taken_at", `${years[1]}-12-31T23:59:59.999Z`);
    }
    if (allowedIds) {
      query = query.in("id", allowedIds);
    }
    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    let mapped = rows.map(toAsset);
    if (q) {
      const lower = q.toLowerCase();
      mapped = mapped.filter(
        (asset) =>
          asset.title.toLowerCase().includes(lower) ||
          asset.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
          asset.location?.city.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({
      assets: mapped,
      supabaseConfigured: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "SUPABASE_NOT_CONFIGURED") {
      return NextResponse.json({
        assets: [],
        supabaseConfigured: false
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
