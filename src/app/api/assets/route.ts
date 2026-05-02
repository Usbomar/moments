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

function pickFirstAssetFile(raw: AssetFilesNested): AssetFileRow | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
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
}): Asset {
  const file = pickFirstAssetFile(row.asset_files);
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
    tags: [],
    autoTags: [],
    files: {
      originalUrl: file?.original_url ?? "",
      previewUrl: file?.preview_url ?? "",
      thumbUrl: file?.thumb_url ?? "",
      checksum: file?.checksum ?? "",
      size: file?.size ?? 0
    }
  };
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        assets: [],
        supabaseConfigured: false
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("assets")
      .select("id,user_id,type,title,taken_at,uploaded_at,width,height,duration,favorite,asset_files(original_url,preview_url,thumb_url,checksum,size)")
      .order("taken_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (!pickFirstAssetFile(row.asset_files)) {
        console.warn("Asset has no asset_files:", row.id);
      }
    }

    console.log("Raw Supabase data (first row):", JSON.stringify(rows[0], null, 2));

    const mapped = rows.map(toAsset);
    console.log("Mapped assets (first one):", JSON.stringify(mapped[0], null, 2));

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
