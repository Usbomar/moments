import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!isSupabaseConfigured() || !supabaseUrl || !supabaseServiceRole) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  return createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "moments";
}
