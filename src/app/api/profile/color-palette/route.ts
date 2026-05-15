import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import type { CustomColorDef, StoredPalette } from "@/lib/admin-color-palette";
import { normalizeHue } from "@/lib/admin-color-palette";

const EMPTY: StoredPalette = { custom: [], presetLabels: {} };

function parsePalette(raw: unknown): StoredPalette {
  if (!raw || typeof raw !== "object") return EMPTY;
  const o = raw as Record<string, unknown>;
  const custom: CustomColorDef[] = [];
  if (Array.isArray(o.custom)) {
    for (const item of o.custom) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.hue !== "number" || !Number.isFinite(row.hue)) continue;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID();
      const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : "Personalitzat";
      custom.push({ id, label, hue: normalizeHue(row.hue) });
    }
  }
  const presetLabels: Record<string, string> = {};
  if (o.presetLabels && typeof o.presetLabels === "object") {
    for (const [k, v] of Object.entries(o.presetLabels as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) presetLabels[k] = v.trim();
    }
  }
  return { custom, presetLabels };
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ palette: EMPTY, persisted: false });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").select("color_palette").eq("id", userId).maybeSingle();

    if (error) {
      if (/color_palette/i.test(error.message)) {
        return NextResponse.json({ palette: EMPTY, persisted: false, schemaReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      palette: parsePalette(data?.color_palette),
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
    const palette = parsePalette(body);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("profiles").update({ color_palette: palette }).eq("id", userId);

    if (error) {
      if (/color_palette/i.test(error.message)) {
        return NextResponse.json(
          { error: "Falta la migració SQL color_palette a profiles. Executa les migracions de Supabase." },
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
