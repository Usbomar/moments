import type { Asset } from "@/lib/types";

/** One row from `asset_files` as returned by PostgREST. */
export type AssetFileRow = {
  original_url: string;
  preview_url: string;
  medium_url?: string | null;
  thumb_url: string;
  checksum: string;
  size: number;
};

/** Nested embed: Supabase/PostgREST may return one-to-one as object or as array of one. */
export type AssetFilesNested = AssetFileRow | AssetFileRow[] | null | undefined;

export type LocationNested =
  | {
      location_id: number;
      locations: {
        id?: number;
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
            id?: number;
            lat: number;
            lng: number;
            city: string | null;
            country: string | null;
          }
        | Array<{
            id?: number;
            lat: number;
            lng: number;
            city: string | null;
            country: string | null;
          }>
        | null;
    }>
  | null
  | undefined;

export type TagNested = { tag: string; origin: "manual" | "auto" }[] | null | undefined;

export function isAssetFileRow(value: unknown): value is AssetFileRow {
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

export function pickFirstAssetFile(raw: AssetFilesNested): AssetFileRow | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return isAssetFileRow(first) ? first : null;
  }
  return isAssetFileRow(raw) ? raw : null;
}

export function pickFirstLocation(raw: LocationNested) {
  const link = pickFirstLocationLink(raw);
  return link ? { id: link.placeId, lat: link.lat, lng: link.lng, city: link.city, country: link.country } : null;
}

/** Dades de la primera ubicació enllaçada (inclou ids per persistència / neteja). */
export function pickFirstLocationLink(raw: LocationNested): {
  placeId: number;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
} | null {
  if (raw == null) return null;
  const first = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!first?.locations) return null;
  const loc = Array.isArray(first.locations) ? (first.locations[0] ?? null) : first.locations;
  if (!loc) return null;
  const placeId = typeof loc.id === "number" && Number.isFinite(loc.id) ? loc.id : first.location_id;
  return {
    placeId,
    lat: loc.lat,
    lng: loc.lng,
    city: loc.city,
    country: loc.country
  };
}

export function toAsset(row: {
  id: string;
  user_id: string;
  type: "photo" | "video";
  title: string;
  description: string | null;
  taken_at: string;
  uploaded_at: string;
  width: number;
  height: number;
  duration: number | null;
  favorite: boolean;
  hidden_from_guests?: boolean | null;
  color_hue?: number | null;
  asset_files: AssetFilesNested;
  asset_locations: LocationNested;
  asset_tags: TagNested;
}): Asset {
  const file = pickFirstAssetFile(row.asset_files);
  const locationLink = pickFirstLocationLink(row.asset_locations);
  const tagRows = row.asset_tags ?? [];
  const tags = tagRows.filter((tag) => tag.origin === "manual").map((tag) => tag.tag);
  const autoTags = tagRows.filter((tag) => tag.origin === "auto").map((tag) => tag.tag);
  const mediumRaw = file?.medium_url;
  const resultFiles = {
    originalUrl: file?.original_url ?? "",
    previewUrl: file?.preview_url ?? "",
    ...(typeof mediumRaw === "string" && mediumRaw.trim() ? { mediumUrl: mediumRaw.trim() } : {}),
    thumbUrl: file?.thumb_url ?? "",
    checksum: file?.checksum ?? "",
    size: file?.size ?? 0
  };
  const ch = row.color_hue;
  const colorHueProp =
    typeof ch === "number" && Number.isFinite(ch) ? { colorHue: Math.min(359, Math.max(0, Math.round(ch))) } : {};
  const latNum = Number(locationLink?.lat);
  const lngNum = Number(locationLink?.lng);
  const hasValidCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const city = locationLink?.city?.trim() ?? "";
  const country = locationLink?.country?.trim() ?? "";
  const hasExplicitLocationLabel = Boolean(city) && Boolean(country);
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    takenAt: row.taken_at,
    uploadedAt: row.uploaded_at,
    width: row.width,
    height: row.height,
    duration: row.duration ?? undefined,
    favorite: row.favorite,
    hiddenFromGuests: row.hidden_from_guests === true,
    albumIds: [],
    peopleIds: [],
    tags,
    autoTags,
    ...colorHueProp,
    location:
      locationLink && hasValidCoords && hasExplicitLocationLabel
        ? {
            id: locationLink.placeId,
            lat: latNum,
            lng: lngNum,
            city,
            country
          }
        : undefined,
    files: resultFiles
  };
}
