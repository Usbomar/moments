import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfigStatus, getSupabaseUrl } from "@/lib/server/supabase-config";

const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export function getSupabaseAdmin() {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl || !supabaseServiceRole || !getSupabaseConfigStatus().configured) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  return createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "fotos";
}

export function getCollectionMusicBucket() {
  return process.env.SUPABASE_COLLECTION_MUSIC_BUCKET ?? "collection-music";
}
