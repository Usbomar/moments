import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import type { AppCollection } from "@/lib/collections";

type Body = {
  collections?: AppCollection[];
};

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }

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

      const { error: albumErr } = await supabase
        .from("albums")
        .upsert({ id: col.id, user_id: "u-1", name }, { onConflict: "id" });
      if (albumErr) return NextResponse.json({ error: albumErr.message }, { status: 500 });

      // Manté la font de veritat del client legacy: substitució completa de membres.
      const { error: delErr } = await supabase.from("album_assets").delete().eq("album_id", col.id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

      if (ids.length) {
        const rows = ids.map((assetId, i) => ({ album_id: col.id, asset_id: assetId, position: i }));
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

