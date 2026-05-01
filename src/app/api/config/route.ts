import { NextResponse } from "next/server";
import { getSupabaseConfigStatus } from "@/lib/server/supabase-config";

export async function GET() {
  const status = getSupabaseConfigStatus();
  return NextResponse.json({
    supabaseConfigured: status.configured,
    missingEnv: status.missingEnv
  });
}
