import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import type { AppCollection } from "@/lib/collections";
import type { CollectionMusicSource, CollectionMusicTrack } from "@/lib/collection-music";

type AlbumRow = {
  id: string;
  name: string;
  music_track_id: string | null;
  collection_music_tracks:
    | {
    id: string;
    title: string;
    source: CollectionMusicSource;
    url: string;
    storage_path: string | null;
    duration_seconds: number | null;
    size_bytes: number | null;
    created_at: string;
  }
    | Array<{
        id: string;
        title: string;
        source: CollectionMusicSource;
        url: string;
        storage_path: string | null;
        duration_seconds: number | null;
        size_bytes: number | null;
        created_at: string;
      }>
    | null;
  album_assets: Array<{ asset_id: string; position: number | null }> | null;
};

function mapTrack(row: AlbumRow["collection_music_tracks"]): CollectionMusicTrack | null {
  const track = Array.isArray(row) ? row[0] : row;
  if (!track) return null;
  return {
    id: track.id,
    title: track.title,
    source: track.source,
    url: track.url,
    storagePath: track.storage_path,
    durationSeconds: track.duration_seconds,
    sizeBytes: track.size_bytes,
    createdAt: track.created_at
  };
}

function mapAlbum(row: AlbumRow): AppCollection {
  const links = (row.album_assets ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const assetIds = links.map((l) => l.asset_id).filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    coverAssetId: assetIds[0] ?? null,
    assetIds,
    musicTrackId: row.music_track_id ?? null,
    musicTrack: mapTrack(row.collection_music_tracks)
  };
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ collections: [], supabaseConfigured: false });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("albums")
      .select("id,name,music_track_id,collection_music_tracks(id,title,source,url,storage_path,duration_seconds,size_bytes,created_at),album_assets(asset_id,position)")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const collections = ((data ?? []) as unknown as AlbumRow[]).map(mapAlbum);
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
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = (await request.json()) as { name?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const id = crypto.randomUUID();
    const { error } = await supabase.from("albums").insert({ id, user_id: userId, name });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      collection: {
        id,
        name,
        coverAssetId: null,
        assetIds: [],
        musicTrackId: null,
        musicTrack: null
      } satisfies AppCollection
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

