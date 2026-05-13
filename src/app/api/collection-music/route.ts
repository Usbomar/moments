import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCollectionMusicBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import type { CollectionMusicTrack, CollectionMusicSource } from "@/lib/collection-music";

type MusicTrackRow = {
  id: string;
  title: string;
  source: CollectionMusicSource;
  url: string;
  storage_path: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  created_at: string;
};

function mapTrack(row: MusicTrackRow): CollectionMusicTrack {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    url: row.url,
    storagePath: row.storage_path,
    durationSeconds: row.duration_seconds,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

function normalizeDuration(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function sanitizeFilePart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "track.mp3";
}

function isMissingMusicSchemaError(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("collection_music_tracks") || text.includes("schema cache");
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ tracks: [], supabaseConfigured: false });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("collection_music_tracks")
      .select("id,title,source,url,storage_path,duration_seconds,size_bytes,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingMusicSchemaError(error.message)) {
        return NextResponse.json({ tracks: [], supabaseConfigured: true, musicSchemaReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tracks: ((data ?? []) as MusicTrackRow[]).map(mapTrack), supabaseConfigured: true, musicSchemaReady: true });
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

    const form = await request.formData();
    const source = form.get("source");
    const rawTitle = typeof form.get("title") === "string" ? String(form.get("title")).trim() : "";
    const durationSeconds = normalizeDuration(form.get("durationSeconds"));
    const id = crypto.randomUUID();
    const supabase = getSupabaseAdmin();

    if (source === "linked") {
      const url = typeof form.get("url") === "string" ? String(form.get("url")).trim() : "";
      const title = rawTitle || url;
      if (!url || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Valid URL is required" }, { status: 400 });
      const { data, error } = await supabase
        .from("collection_music_tracks")
        .insert({
          id,
          user_id: userId,
          title,
          source: "linked",
          url,
          storage_path: null,
          duration_seconds: durationSeconds,
          size_bytes: null
        })
        .select("id,title,source,url,storage_path,duration_seconds,size_bytes,created_at")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ track: mapTrack(data as MusicTrackRow) });
    }

    if (source !== "uploaded") return NextResponse.json({ error: "source must be uploaded or linked" }, { status: 400 });

    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "MP3 file is required" }, { status: 400 });
    if (file.type && file.type !== "audio/mpeg" && file.type !== "audio/mp3") {
      return NextResponse.json({ error: "Only MP3 files are supported" }, { status: 400 });
    }

    const title = rawTitle || file.name.replace(/\.[^.]+$/, "");
    const bucket = getCollectionMusicBucket();
    const objectPath = `${userId}/${id}-${sanitizeFilePart(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
      contentType: file.type || "audio/mpeg",
      upsert: false
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    const publicUrl = publicData.publicUrl;
    const { data, error } = await supabase
      .from("collection_music_tracks")
      .insert({
        id,
        user_id: userId,
        title,
        source: "uploaded",
        url: publicUrl,
        storage_path: objectPath,
        duration_seconds: durationSeconds,
        size_bytes: buffer.byteLength
      })
      .select("id,title,source,url,storage_path,duration_seconds,size_bytes,created_at")
      .single();
    if (error) {
      await supabase.storage.from(bucket).remove([objectPath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ track: mapTrack(data as MusicTrackRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
