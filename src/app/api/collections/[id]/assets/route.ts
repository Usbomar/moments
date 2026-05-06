import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

async function resolveId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return params.id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const albumId = await resolveId(context);
    const body = (await request.json()) as { assetId?: string; include?: boolean };
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
    if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });
    const include = !!body.include;
    const supabase = getSupabaseAdmin();
    const { data: album, error: albumErr } = await supabase
      .from("albums")
      .select("id")
      .eq("id", albumId)
      .eq("user_id", "u-1")
      .maybeSingle();
    if (albumErr) return NextResponse.json({ error: albumErr.message }, { status: 500 });
    if (!album) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

    if (include) {
      const { data: asset, error: assetErr } = await supabase
        .from("assets")
        .select("id")
        .eq("id", assetId)
        .eq("user_id", "u-1")
        .maybeSingle();
      if (assetErr) return NextResponse.json({ error: assetErr.message }, { status: 500 });
      if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      const { data: maxPosRow, error: maxPosErr } = await supabase
        .from("album_assets")
        .select("position")
        .eq("album_id", albumId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxPosErr) return NextResponse.json({ error: maxPosErr.message }, { status: 500 });
      const nextPos = Math.max(0, (maxPosRow?.position ?? -1) + 1);
      const { error } = await supabase
        .from("album_assets")
        .upsert({ album_id: albumId, asset_id: assetId, position: nextPos }, { onConflict: "album_id,asset_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from("album_assets").delete().eq("album_id", albumId).eq("asset_id", assetId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

