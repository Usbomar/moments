import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import type { AppCollection } from "@/lib/collections";

type Body = {
  collections?: AppCollection[];
};

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = (await request.json()) as Body;
    const raw = Array.isArray(body.collections) ? body.collections : [];
    const collections = raw.filter(
      (c) => c && typeof c.id === "string" && typeof c.name === "string" && c.name.trim().length > 0
    );
    if (!collections.length) {
      return NextResponse.json({ ok: true, imported: 0 });
    }

    const supabase = getSupabaseAdmin();
    let imported = 0;

    for (const col of collections) {
      const name = col.name.trim();
      const ids = Array.isArray(col.assetIds)
        ? col.assetIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];

      const { data: existingAlbum, error: exErr } = await supabase.from("albums").select("user_id").eq("id", col.id).maybeSingle();
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
      if (existingAlbum && existingAlbum.user_id !== userId) {
        return NextResponse.json({ error: "Album id already belongs to another user" }, { status: 409 });
      }

      const { error: albumErr } = await supabase
        .from("albums")
        .upsert({ id: col.id, user_id: userId, name }, { onConflict: "id" });
      if (albumErr) return NextResponse.json({ error: albumErr.message }, { status: 500 });

      // Manté la font de veritat del client legacy: substitució completa de membres.
      const { error: delErr } = await supabase.from("album_assets").delete().eq("album_id", col.id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

      if (ids.length) {
        const { data: ownedRows, error: ownErr } = await supabase.from("assets").select("id").eq("user_id", userId).in("id", ids);
        if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 });
        const owned = new Set((ownedRows ?? []).map((r) => r.id));
        const safeIds = ids.filter((id) => owned.has(id));
        const rows = safeIds.map((assetId, i) => ({ album_id: col.id, asset_id: assetId, position: i }));
        const { error: insErr } = await supabase.from("album_assets").insert(rows);
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      }

      imported += 1;
    }

    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

