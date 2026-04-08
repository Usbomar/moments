import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

export async function GET() {
  return NextResponse.json({ supabaseConfigured: isSupabaseConfigured() });
}
