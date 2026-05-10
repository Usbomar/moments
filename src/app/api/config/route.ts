import { NextResponse } from "next/server";
import { getSupabaseAuthConfigStatus, getSupabaseConfigStatus } from "@/lib/server/supabase-config";

export async function GET() {
  const status = getSupabaseConfigStatus();
  const auth = getSupabaseAuthConfigStatus();
  return NextResponse.json({
    supabaseConfigured: status.configured,
    missingEnv: status.missingEnv,
    authConfigured: auth.configured,
    authMissingEnv: auth.missingEnv
  });
}
