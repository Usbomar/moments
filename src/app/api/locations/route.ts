import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ locations: [], supabaseConfigured: false });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("locations").select("city,country").order("city", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const locations = Array.from(
      new Set(
        (data ?? [])
          .filter((row) => row.city && row.country)
          .map((row) => `${row.city}, ${row.country}`)
      )
    ).map((label) => {
      const [city, country] = label.split(", ");
      return { city, country, label };
    });

    return NextResponse.json({ locations, supabaseConfigured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
