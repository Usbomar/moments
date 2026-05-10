import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ entries: [], supabaseConfigured: false });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select("guest_slug,guest_display_name")
      .eq("guest_access_enabled", true)
      .eq("show_in_guest_directory", true);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).filter((r) => {
      const s = (r.guest_slug as string)?.trim();
      return Boolean(s);
    });

    const origin = new URL(request.url).origin;
    const entries = rows.map((r) => {
      const slug = String(r.guest_slug).trim();
      const name = (r.guest_display_name as string | null)?.trim() || "Col·lecció";
      return { slug, displayName: name, href: `${origin}/g/${slug}` };
    });

    entries.sort((a, b) => a.displayName.localeCompare(b.displayName, "ca"));

    return NextResponse.json({ entries, supabaseConfigured: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
