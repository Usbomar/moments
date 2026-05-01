import { NextResponse } from "next/server";
import type { Asset } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

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
  asset_files: {
    original_url: string;
    preview_url: string;
    thumb_url: string;
    checksum: string;
    size: number;
  }[] | null;
}): Asset {
  const file = row.asset_files?.[0];
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

    return NextResponse.json({
      assets: (data ?? []).map(toAsset),
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
