import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import { errorJson, getRequestId, logApi, okJson } from "@/lib/server/api-observability";
import { ASSET_DETAIL_SELECT } from "@/lib/server/asset-row-select";
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

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    if (!isSupabaseConfigured()) {
      return okJson(requestId, {
        assets: [],
        supabaseConfigured: false
      });
    }

    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

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
    const limit = parsePositiveInt(url.searchParams.get("limit"), 200, 1, 500);
    const offset = parsePositiveInt(url.searchParams.get("offset"), 0, 0, 1_000_000);

    let allowedIds: string[] | null = null;
    if (locations.length) {
      const { data: locRows, error: locErr } = await supabase
        .from("asset_locations")
        .select("asset_id,locations!inner(city,country)")
        .in("locations.city", locations.map((label) => label.split(",")[0].trim()));
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
      const candidateLoc = Array.from(new Set((locRows ?? []).map((row) => row.asset_id)));
      if (candidateLoc.length === 0) {
        allowedIds = [];
      } else {
        const { data: ownedLoc, error: ownLocErr } = await supabase
          .from("assets")
          .select("id")
          .eq("user_id", userId)
          .in("id", candidateLoc);
        if (ownLocErr) return NextResponse.json({ error: ownLocErr.message }, { status: 500 });
        allowedIds = (ownedLoc ?? []).map((r) => r.id);
      }
    }

    if (tags.length) {
      const { data: tagRows, error: tagErr } = await supabase.from("asset_tags").select("asset_id").in("tag", tags);
      if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });
      const candidateTag = Array.from(new Set((tagRows ?? []).map((row) => row.asset_id)));
      if (candidateTag.length === 0) {
        allowedIds = [];
      } else {
        const { data: ownedTag, error: ownTagErr } = await supabase
          .from("assets")
          .select("id")
          .eq("user_id", userId)
          .in("id", candidateTag);
        if (ownTagErr) return NextResponse.json({ error: ownTagErr.message }, { status: 500 });
        const tagIds = new Set((ownedTag ?? []).map((r) => r.id));
        allowedIds = allowedIds == null ? Array.from(tagIds) : allowedIds.filter((id) => tagIds.has(id));
      }
    }

    if (allowedIds && allowedIds.length === 0) {
      return okJson(requestId, { assets: [], supabaseConfigured: true });
    }

    let query = supabase
      .from("assets")
      .select(ASSET_DETAIL_SELECT)
      .eq("user_id", userId)
      .order("taken_at", { ascending: false });

    if (!q) {
      query = query.range(offset, offset + limit - 1);
    }

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
      logApi("error", "/api/assets", requestId, "Supabase query failed", { detail: error.message });
      return errorJson(500, requestId, "ASSETS_QUERY_FAILED", error.message);
    }

    const rows = data ?? [];
    let mapped = rows.map(toAsset);
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
    if (message === "SUPABASE_NOT_CONFIGURED") {
      return okJson(requestId, {
        assets: [],
        supabaseConfigured: false
      });
    }
    logApi("error", "/api/assets", requestId, "Unhandled exception", { detail: message });
    return errorJson(500, requestId, "ASSETS_UNHANDLED_ERROR", message);
  }
}
