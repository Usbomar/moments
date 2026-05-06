import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import type { AppCollection } from "@/lib/collections";

type AlbumRow = {
  id: string;
  name: string;
  album_assets: Array<{ asset_id: string; position: number | null }> | null;
};

function mapAlbum(row: AlbumRow): AppCollection {
  const links = (row.album_assets ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const assetIds = links.map((l) => l.asset_id).filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    coverAssetId: assetIds[0] ?? null,
    assetIds
  };
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ collections: [], supabaseConfigured: false });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("albums")
      .select("id,name,album_assets(asset_id,position)")
      .eq("user_id", "u-1")
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const collections = ((data ?? []) as AlbumRow[]).map(mapAlbum);
    return NextResponse.json({ collections, supabaseConfigured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const body = (await request.json()) as { name?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const id = crypto.randomUUID();
    const { error } = await supabase.from("albums").insert({ id, user_id: "u-1", name });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      collection: {
        id,
        name,
        coverAssetId: null,
        assetIds: []
      } satisfies AppCollection
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

