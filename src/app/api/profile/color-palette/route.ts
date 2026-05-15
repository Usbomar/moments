import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import { EMPTY_PALETTE, sanitizePalette, type StoredPalette } from "@/lib/admin-color-palette";

async function ensureProfileRow(userId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error) return { error: error.message };
  if (data) return { error: null };
  const { error: insErr } = await supabase.from("profiles").insert({ id: userId, role: "owner" });
  if (insErr) return { error: insErr.message };
  return { error: null };
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ palette: EMPTY_PALETTE, persisted: false });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").select("color_palette").eq("id", userId).maybeSingle();

    if (error) {
      if (/color_palette/i.test(error.message)) {
        return NextResponse.json({ palette: EMPTY_PALETTE, persisted: false, schemaReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      const ensured = await ensureProfileRow(userId);
      if (ensured.error) return NextResponse.json({ error: ensured.error }, { status: 500 });
      return NextResponse.json({ palette: EMPTY_PALETTE, persisted: true, schemaReady: true });
    }

    return NextResponse.json({
      palette: sanitizePalette((data.color_palette ?? EMPTY_PALETTE) as Partial<StoredPalette>),
      persisted: true,
      schemaReady: true
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = (await request.json()) as Partial<StoredPalette>;
    const palette = sanitizePalette(body);

    const ensured = await ensureProfileRow(userId);
    if (ensured.error) return NextResponse.json({ error: ensured.error }, { status: 500 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("profiles").update({ color_palette: palette }).eq("id", userId);

    if (error) {
      if (/color_palette/i.test(error.message)) {
        return NextResponse.json(
          { error: "Falta la columna color_palette a profiles. Executa la migració SQL." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ palette, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
