import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import { errorJson, getRequestId, logApi, okJson } from "@/lib/server/api-observability";

async function resolveId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return params.id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    if (!isSupabaseConfigured()) {
      return errorJson(503, requestId, "SUPABASE_NOT_CONFIGURED");
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const albumId = await resolveId(context);
    const body = (await request.json()) as { assetId?: string; include?: boolean };
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
    if (!assetId) return errorJson(400, requestId, "INVALID_PAYLOAD", "assetId is required");
    const include = !!body.include;
    const supabase = getSupabaseAdmin();
    const { data: album, error: albumErr } = await supabase
      .from("albums")
      .select("id")
      .eq("id", albumId)
      .eq("user_id", userId)
      .maybeSingle();
    if (albumErr) return errorJson(500, requestId, "COLLECTION_LOOKUP_FAILED", albumErr.message);
    if (!album) return errorJson(404, requestId, "COLLECTION_NOT_FOUND", "Collection not found");

    if (include) {
      const { data: asset, error: assetErr } = await supabase
        .from("assets")
        .select("id")
        .eq("id", assetId)
        .eq("user_id", userId)
        .maybeSingle();
      if (assetErr) return errorJson(500, requestId, "ASSET_LOOKUP_FAILED", assetErr.message);
      if (!asset) return errorJson(404, requestId, "ASSET_NOT_FOUND", "Asset not found");

      const { data: maxPosRow, error: maxPosErr } = await supabase
        .from("album_assets")
        .select("position")
        .eq("album_id", albumId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxPosErr) return errorJson(500, requestId, "COLLECTION_POSITION_LOOKUP_FAILED", maxPosErr.message);
      const nextPos = Math.max(0, (maxPosRow?.position ?? -1) + 1);
      const { error } = await supabase
        .from("album_assets")
        .upsert({ album_id: albumId, asset_id: assetId, position: nextPos }, { onConflict: "album_id,asset_id" });
      if (error) return errorJson(500, requestId, "COLLECTION_ASSET_UPSERT_FAILED", error.message);
    } else {
      const { error } = await supabase.from("album_assets").delete().eq("album_id", albumId).eq("asset_id", assetId);
      if (error) return errorJson(500, requestId, "COLLECTION_ASSET_DELETE_FAILED", error.message);
    }

    return okJson(requestId, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logApi("error", "/api/collections/[id]/assets", requestId, "Unhandled exception", { detail: message });
    return errorJson(500, requestId, "COLLECTION_ASSET_UNHANDLED_ERROR", message);
  }
}

