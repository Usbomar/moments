import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { normalizeGuestSlug } from "@/lib/guest-slug";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
    }

    const { slug: raw } = await context.params;
    const slug = normalizeGuestSlug(raw || "");
    if (!slug) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id,guest_access_enabled,guest_slug,guest_display_name")
      .eq("guest_slug", slug)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile || profile.guest_access_enabled !== true) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const name = (profile.guest_display_name as string | null)?.trim() || "Moments";
    return NextResponse.json({
      displayName: name,
      ownerId: profile.id as string
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
