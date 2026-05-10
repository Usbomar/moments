import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { errorJson, getRequestId, logApi, okJson } from "@/lib/server/api-observability";
import { toAsset } from "@/lib/server/asset-map";
import { normalizeGuestSlug } from "@/lib/guest-slug";

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

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const requestId = getRequestId(request);
  try {
    if (!isSupabaseConfigured()) {
      return okJson(requestId, { assets: [], supabaseConfigured: false });
    }

    const { slug: raw } = await context.params;
    const slug = normalizeGuestSlug(raw || "");
    if (!slug) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id,guest_access_enabled")
      .eq("guest_slug", slug)
      .maybeSingle();

    if (pErr) return errorJson(500, requestId, "PROFILE_QUERY_FAILED", pErr.message);
    if (!profile || profile.guest_access_enabled !== true) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const ownerId = profile.id as string;
    const url = new URL(request.url);
    const years = parseYears(url.searchParams.get("years"));
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = parsePositiveInt(url.searchParams.get("limit"), 200, 1, 500);
    const offset = parsePositiveInt(url.searchParams.get("offset"), 0, 0, 1_000_000);

    let query = supabase
      .from("assets")
      .select(
        "id,user_id,type,title,description,taken_at,uploaded_at,width,height,duration,favorite,hidden_from_guests,asset_files(original_url,preview_url,medium_url,thumb_url,checksum,size),asset_locations(location_id,locations(lat,lng,city,country)),asset_tags(tag,origin)"
      )
      .eq("user_id", ownerId)
      .eq("hidden_from_guests", false)
      .order("taken_at", { ascending: false });

    if (!q) {
      query = query.range(offset, offset + limit - 1);
    }

    if (years) {
      query = query
        .gte("taken_at", `${years[0]}-01-01T00:00:00.000Z`)
        .lte("taken_at", `${years[1]}-12-31T23:59:59.999Z`);
    }

    const { data, error } = await query;
    if (error) {
      logApi("error", "/api/guest/.../assets", requestId, "Supabase query failed", { detail: error.message });
      return errorJson(500, requestId, "ASSETS_QUERY_FAILED", error.message);
    }

    const rows = data ?? [];
    let mapped = rows.map(toAsset);
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      const { data: hueRows, error: hueErr } = await supabase
        .from("assets")
        .select("id,color_hue")
        .eq("user_id", ownerId)
        .in("id", ids);
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

    const filteredCount = mapped.length;

    return okJson(requestId, {
      assets: mapped,
      supabaseConfigured: true,
      paging: {
        limit,
        offset,
        returned: filteredCount,
        hasMore: q ? false : filteredCount >= limit
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logApi("error", "/api/guest/.../assets", requestId, "Unhandled exception", { detail: message });
    return errorJson(500, requestId, "ASSETS_UNHANDLED_ERROR", message);
  }
}
