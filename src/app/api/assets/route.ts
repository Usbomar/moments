import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { toAsset } from "@/lib/server/asset-map";

function parseYears(raw: string | null): [number, number] | null {
  if (!raw) return null;
  if (raw.includes("-")) {
    const [a, b] = raw.split("-");
    const min = Number.parseInt(a, 10);
    const max = Number.parseInt(b, 10);
    if (Number.isFinite(min) && Number.isFinite(max)) return [Math.min(min, max), Math.max(min, max)];
    return null;
  }
  const single = Number.parseInt(raw, 10);
  if (!Number.isFinite(single)) return null;
  return [single, single];
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        assets: [],
        supabaseConfigured: false
      });
    }

    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const years = parseYears(url.searchParams.get("years"));
    const locations = (url.searchParams.get("locations") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const tags = (url.searchParams.get("tags") ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const q = (url.searchParams.get("q") ?? "").trim();

    let allowedIds: string[] | null = null;
    if (locations.length) {
      const { data: locRows, error: locErr } = await supabase
        .from("asset_locations")
        .select("asset_id,locations!inner(city,country)")
        .in("locations.city", locations.map((label) => label.split(",")[0].trim()));
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
      allowedIds = Array.from(new Set((locRows ?? []).map((row) => row.asset_id)));
    }

    if (tags.length) {
      const { data: tagRows, error: tagErr } = await supabase.from("asset_tags").select("asset_id").in("tag", tags);
      if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });
      const tagIds = new Set((tagRows ?? []).map((row) => row.asset_id));
      allowedIds = allowedIds == null ? Array.from(tagIds) : allowedIds.filter((id) => tagIds.has(id));
    }

    if (allowedIds && allowedIds.length === 0) {
      return NextResponse.json({ assets: [], supabaseConfigured: true });
    }

    let query = supabase
      .from("assets")
      .select(
        "id,user_id,type,title,description,taken_at,uploaded_at,width,height,duration,favorite,asset_files(original_url,preview_url,medium_url,thumb_url,checksum,size),asset_locations(location_id,locations(lat,lng,city,country)),asset_tags(tag,origin)"
      )
      .order("taken_at", { ascending: false });

    if (years) {
      query = query
        .gte("taken_at", `${years[0]}-01-01T00:00:00.000Z`)
        .lte("taken_at", `${years[1]}-12-31T23:59:59.999Z`);
    }
    if (allowedIds) {
      query = query.in("id", allowedIds);
    }
    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    let mapped = rows.map(toAsset);
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      const { data: hueRows, error: hueErr } = await supabase.from("assets").select("id,color_hue").in("id", ids);
      if (!hueErr && hueRows?.length) {
        const byId = new Map(hueRows.map((h) => [String(h.id), h.color_hue]));
        mapped = mapped.map((a) => {
          const h = byId.get(a.id);
          return typeof h === "number" && Number.isFinite(h)
            ? { ...a, colorHue: Math.min(359, Math.max(0, Math.round(h))) }
            : a;
        });
      }
    }
    if (q) {
      const lower = q.toLowerCase();
      mapped = mapped.filter(
        (asset) =>
          asset.title.toLowerCase().includes(lower) ||
          asset.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
          asset.autoTags.some((tag) => tag.toLowerCase().includes(lower)) ||
          (asset.description?.toLowerCase().includes(lower) ?? false) ||
          asset.location?.city.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({
      assets: mapped,
      supabaseConfigured: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "SUPABASE_NOT_CONFIGURED") {
      return NextResponse.json({
        assets: [],
        supabaseConfigured: false
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
