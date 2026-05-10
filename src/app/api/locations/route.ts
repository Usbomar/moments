import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ locations: [], supabaseConfigured: false });
    }

    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const supabase = getSupabaseAdmin();
    const { data: assetRows, error } = await supabase
      .from("assets")
      .select("asset_locations(locations(city,country))")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const labels = new Set<string>();
    for (const asset of assetRows ?? []) {
      const links = asset.asset_locations as Array<{ locations: { city?: string | null; country?: string | null } | null }> | null;
      for (const link of links ?? []) {
        const loc = link?.locations;
        const city = loc?.city?.trim() ?? "";
        const country = loc?.country?.trim() ?? "";
        if (city && country) labels.add(`${city}, ${country}`);
      }
    }

    const locations = [...labels]
      .sort((a, b) => a.localeCompare(b, "ca", { sensitivity: "base", numeric: true }))
      .map((label) => {
        const [city, country] = label.split(", ");
        return { city, country, label };
      });

    return NextResponse.json({ locations, supabaseConfigured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
