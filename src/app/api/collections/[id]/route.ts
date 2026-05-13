import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";

async function resolveId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return params.id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const id = await resolveId(context);
    const body = (await request.json()) as { name?: string; musicTrackId?: string | null };
    const supabase = getSupabaseAdmin();
    const patch: { name?: string; music_track_id?: string | null } = {};

    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      patch.name = name;
    }

    if ("musicTrackId" in body) {
      const musicTrackId = typeof body.musicTrackId === "string" ? body.musicTrackId.trim() : null;
      if (musicTrackId) {
        const { data: track, error: trackError } = await supabase
          .from("collection_music_tracks")
          .select("id")
          .eq("id", musicTrackId)
          .eq("user_id", userId)
          .maybeSingle();
        if (trackError) return NextResponse.json({ error: trackError.message }, { status: 500 });
        if (!track) return NextResponse.json({ error: "Music track not found" }, { status: 404 });
      }
      patch.music_track_id = musicTrackId || null;
    }

    if (!Object.keys(patch).length) return NextResponse.json({ error: "No changes provided" }, { status: 400 });

    const { error } = await supabase.from("albums").update(patch).eq("id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const { error } = await supabase.from("albums").delete().eq("id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

