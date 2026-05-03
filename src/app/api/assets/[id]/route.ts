import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { toAsset } from "@/lib/server/asset-map";

type PatchBody = {
  title?: string;
  description?: string | null;
  tags?: string[];
  taken_at?: string;
  favorite?: boolean;
  location?: { lat: number; lng: number; city: string; country: string } | null;
};

async function resolveParams(context: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  const params = await Promise.resolve(context.params);
  return params.id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  if (request.method !== "PATCH") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }

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
    if (existing.user_id !== "u-1") {
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

    const { error: updateErr } = await supabase.from("assets").update(patch).eq("id", id).eq("user_id", "u-1");
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const { error: delTagErr } = await supabase.from("asset_tags").delete().eq("asset_id", id).eq("origin", "manual");
    if (delTagErr) return NextResponse.json({ error: delTagErr.message }, { status: 500 });

    if (tags.length) {
      const rows = tags.map((tag) => ({ asset_id: id, tag, origin: "manual" as const }));
      const { error: insTagErr } = await supabase.from("asset_tags").insert(rows);
      if (insTagErr) return NextResponse.json({ error: insTagErr.message }, { status: 500 });
    }

    if (body.location === null) {
      const { error: delLocErr } = await supabase.from("asset_locations").delete().eq("asset_id", id);
      if (delLocErr) return NextResponse.json({ error: delLocErr.message }, { status: 500 });
    } else if (body.location) {
      const { lat, lng, city, country } = body.location;
      const { data: locInsert, error: locErr } = await supabase
        .from("locations")
        .insert({ lat, lng, city, country })
        .select("id")
        .single();
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

      const { error: linkErr } = await supabase.from("asset_locations").upsert(
        { asset_id: id, location_id: locInsert.id },
        { onConflict: "asset_id" }
      );
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    const { data: row, error: fetchErr } = await supabase
      .from("assets")
      .select(
        "id,user_id,type,title,description,taken_at,uploaded_at,width,height,duration,favorite,asset_files(original_url,preview_url,medium_url,thumb_url,checksum,size),asset_locations(location_id,locations(lat,lng,city,country)),asset_tags(tag,origin)"
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Not found after update" }, { status: 500 });

    return NextResponse.json({ asset: toAsset(row) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
