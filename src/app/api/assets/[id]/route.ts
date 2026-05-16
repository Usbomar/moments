import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import { ASSET_DETAIL_SELECT } from "@/lib/server/asset-row-select";
import { toAsset } from "@/lib/server/asset-map";
import { objectPathFromSignedUrl } from "@/lib/server/signed-url-path";
import { legacyHueToHex, normalizeHex } from "@/lib/color-utils";

type PatchBody = {
  title?: string;
  description?: string | null;
  tags?: string[];
  taken_at?: string;
  favorite?: boolean;
  hidden_from_guests?: boolean;
  /** #RRGGBB o null per esborrar l’assignació manual. */
  color_hex?: string | null;
  /** Legacy: 0–359 (es converteix a color_hex). */
  color_hue?: number | null;
  /** `id` opcional = PK de `locations` per reutilitzar fila (evita duplicats). */
  location?: { id?: number; lat: number; lng: number; city: string; country: string } | null;
};

function assertValidLatLng(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "location lat/lng must be finite numbers";
  if (lat < -90 || lat > 90) return "location lat out of range (-90–90)";
  if (lng < -180 || lng > 180) return "location lng out of range (-180–180)";
  return null;
}

/** Elimina la fila `locations` si ja no hi ha cap `asset_locations` que la referenciï. */
async function deleteLocationIfOrphaned(supabase: SupabaseClient, locationId: number): Promise<string | null> {
  const { count, error } = await supabase
    .from("asset_locations")
    .select("*", { count: "exact", head: true })
    .eq("location_id", locationId);
  if (error) return error.message;
  if ((count ?? 0) === 0) {
    const { error: delErr } = await supabase.from("locations").delete().eq("id", locationId);
    return delErr?.message ?? null;
  }
  return null;
}

async function resolveParams(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return params.id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.method !== "PATCH") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }

    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const id = await resolveParams(context);
    const body = (await request.json()) as PatchBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];

    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingErr } = await supabase.from("assets").select("id,user_id").eq("id", id).maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const patch: Record<string, unknown> = { title };
    if (body.description !== undefined) {
      patch.description = body.description;
    }
    if (typeof body.taken_at === "string" && body.taken_at.trim()) {
      patch.taken_at = body.taken_at;
    }
    if (typeof body.favorite === "boolean") {
      patch.favorite = body.favorite;
    }
    if (typeof body.hidden_from_guests === "boolean") {
      patch.hidden_from_guests = body.hidden_from_guests;
    }
    if (body.color_hex !== undefined) {
      if (body.color_hex === null) {
        patch.color_hex = null;
        patch.color_hue = null;
      } else if (typeof body.color_hex === "string") {
        const hex = normalizeHex(body.color_hex);
        if (!hex) {
          return NextResponse.json({ error: "color_hex must be null or #RRGGBB" }, { status: 400 });
        }
        patch.color_hex = hex;
        patch.color_hue = null;
      } else {
        return NextResponse.json({ error: "color_hex must be null or #RRGGBB" }, { status: 400 });
      }
    } else if (body.color_hue !== undefined) {
      if (body.color_hue === null) {
        patch.color_hex = null;
        patch.color_hue = null;
      } else if (typeof body.color_hue === "number" && Number.isFinite(body.color_hue)) {
        const h = Math.min(359, Math.max(0, Math.round(body.color_hue)));
        patch.color_hex = legacyHueToHex(h);
        patch.color_hue = null;
      } else {
        return NextResponse.json({ error: "color_hue must be null or an integer 0–359" }, { status: 400 });
      }
    }

    let { error: updateErr } = await supabase.from("assets").update(patch).eq("id", id).eq("user_id", userId);
    if (updateErr && /color_(hue|hex)/i.test(updateErr.message)) {
      const rest = { ...patch };
      delete rest.color_hue;
      delete rest.color_hex;
      const retry = await supabase.from("assets").update(rest).eq("id", id).eq("user_id", userId);
      updateErr = retry.error;
    }
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const { error: delTagErr } = await supabase.from("asset_tags").delete().eq("asset_id", id).eq("origin", "manual");
    if (delTagErr) return NextResponse.json({ error: delTagErr.message }, { status: 500 });

    if (tags.length) {
      const rows = tags.map((tag) => ({ asset_id: id, tag, origin: "manual" as const }));
      const { error: insTagErr } = await supabase.from("asset_tags").insert(rows);
      if (insTagErr) return NextResponse.json({ error: insTagErr.message }, { status: 500 });
    }

    if (body.location === null) {
      const { data: prevLink, error: prevLinkErr } = await supabase
        .from("asset_locations")
        .select("location_id")
        .eq("asset_id", id)
        .maybeSingle();
      if (prevLinkErr) return NextResponse.json({ error: prevLinkErr.message }, { status: 500 });
      const prevLocId = typeof prevLink?.location_id === "number" ? prevLink.location_id : null;

      const { error: delLocErr } = await supabase.from("asset_locations").delete().eq("asset_id", id);
      if (delLocErr) return NextResponse.json({ error: delLocErr.message }, { status: 500 });

      if (prevLocId != null) {
        const orphanErr = await deleteLocationIfOrphaned(supabase, prevLocId);
        if (orphanErr) return NextResponse.json({ error: orphanErr }, { status: 500 });
      }
    } else if (body.location) {
      const { lat, lng, city, country, id: existingPlaceId } = body.location;
      const geoErr = assertValidLatLng(lat, lng);
      if (geoErr) return NextResponse.json({ error: geoErr }, { status: 400 });

      const { data: prevLink } = await supabase.from("asset_locations").select("location_id").eq("asset_id", id).maybeSingle();
      const prevLocId = typeof prevLink?.location_id === "number" ? prevLink.location_id : null;

      let newLocationId: number;

      if (typeof existingPlaceId === "number" && Number.isFinite(existingPlaceId) && existingPlaceId > 0) {
        const { data: locExists, error: locLookupErr } = await supabase
          .from("locations")
          .select("id")
          .eq("id", existingPlaceId)
          .maybeSingle();
        if (locLookupErr) return NextResponse.json({ error: locLookupErr.message }, { status: 500 });
        if (!locExists) return NextResponse.json({ error: "Location not found" }, { status: 400 });
        const { error: updLocErr } = await supabase
          .from("locations")
          .update({ lat, lng, city, country })
          .eq("id", existingPlaceId);
        if (updLocErr) return NextResponse.json({ error: updLocErr.message }, { status: 500 });
        newLocationId = existingPlaceId;
      } else {
        const { data: locInsert, error: locErr } = await supabase
          .from("locations")
          .insert({ lat, lng, city, country })
          .select("id")
          .single();
        if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
        if (!locInsert?.id) return NextResponse.json({ error: "Location insert failed" }, { status: 500 });
        newLocationId = locInsert.id as number;
      }

      const { error: linkErr } = await supabase
        .from("asset_locations")
        .upsert({ asset_id: id, location_id: newLocationId }, { onConflict: "asset_id" });
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

      if (prevLocId != null && prevLocId !== newLocationId) {
        const orphanErr = await deleteLocationIfOrphaned(supabase, prevLocId);
        if (orphanErr) return NextResponse.json({ error: orphanErr }, { status: 500 });
      }
    }

    const { data: row, error: fetchErr } = await supabase.from("assets").select(ASSET_DETAIL_SELECT).eq("id", id).maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Not found after update" }, { status: 500 });

    return NextResponse.json({ asset: toAsset(row) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const id = await resolveParams(context);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingErr } = await supabase
      .from("assets")
      .select("id,user_id")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: fileRow } = await supabase
      .from("asset_files")
      .select("original_url,preview_url,medium_url,thumb_url")
      .eq("asset_id", id)
      .maybeSingle();

    const rawUrls = [
      fileRow?.original_url,
      fileRow?.preview_url,
      fileRow?.medium_url,
      fileRow?.thumb_url
    ].filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    const objectPaths = Array.from(new Set(rawUrls.map((u) => objectPathFromSignedUrl(u)).filter((p): p is string => !!p)));
    if (objectPaths.length) {
      const bucket = getStorageBucket();
      await supabase.storage.from(bucket).remove(objectPaths);
    }

    const { error: delErr } = await supabase.from("assets").delete().eq("id", id).eq("user_id", userId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
