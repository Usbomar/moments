import { NextResponse } from "next/server";
import { getCollectionMusicBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";

async function resolveId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return params.id;
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const id = await resolveId(context);
    const supabase = getSupabaseAdmin();
    const { data: track, error: lookupError } = await supabase
      .from("collection_music_tracks")
      .select("storage_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

    const { error } = await supabase.from("collection_music_tracks").delete().eq("id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const storagePath = typeof track.storage_path === "string" ? track.storage_path : "";
    if (storagePath) {
      await supabase.storage.from(getCollectionMusicBucket()).remove([storagePath]);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
