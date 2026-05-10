import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";
import { generateGuestSlug, isValidGuestSlugCustom, normalizeGuestSlug } from "@/lib/guest-slug";

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("profiles")
      .select("guest_access_enabled,guest_slug,show_in_guest_directory,guest_display_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!row) {
      return NextResponse.json({
        guestAccessEnabled: false,
        guestSlug: null as string | null,
        showInGuestDirectory: false,
        guestDisplayName: "",
        guestUrl: null as string | null
      });
    }

    const origin = new URL(request.url).origin;
    const slug = (row?.guest_slug as string | null)?.trim() || null;
    const guestPath = slug ? `${origin}/g/${slug}` : null;

    return NextResponse.json({
      guestAccessEnabled: row?.guest_access_enabled === true,
      guestSlug: slug,
      showInGuestDirectory: row?.show_in_guest_directory === true,
      guestDisplayName: (row?.guest_display_name as string | null)?.trim() || "",
      guestUrl: guestPath
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PatchBody = {
  guest_access_enabled?: boolean;
  show_in_guest_directory?: boolean;
  guest_display_name?: string | null;
  /** Slug personalitzat (minúscules, 2–32 caràcters). */
  guest_slug?: string | null;
  /** Genera un slug nou aleatori (invalida l’anterior enllaç). */
  regenerate_guest_slug?: boolean;
};

export async function PATCH(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = (await request.json()) as PatchBody;
    const supabase = getSupabaseAdmin();

    let { data: current, error: curErr } = await supabase
      .from("profiles")
      .select("guest_access_enabled,guest_slug")
      .eq("id", userId)
      .maybeSingle();
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });

    if (!current) {
      const { error: insErr } = await supabase.from("profiles").insert({ id: userId, role: "owner" });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      const { data: createdRow, error: refetchErr } = await supabase
        .from("profiles")
        .select("guest_access_enabled,guest_slug")
        .eq("id", userId)
        .maybeSingle();
      if (refetchErr) return NextResponse.json({ error: refetchErr.message }, { status: 500 });
      current = createdRow ?? { guest_access_enabled: false, guest_slug: null };
    }

    const patch: Record<string, unknown> = {};

    if (typeof body.guest_display_name === "string") {
      patch.guest_display_name = body.guest_display_name.trim() || null;
    } else if (body.guest_display_name === null) {
      patch.guest_display_name = null;
    }

    if (typeof body.show_in_guest_directory === "boolean") {
      patch.show_in_guest_directory = body.show_in_guest_directory;
    }

    let nextEnabled = current?.guest_access_enabled === true;
    if (typeof body.guest_access_enabled === "boolean") {
      nextEnabled = body.guest_access_enabled;
      patch.guest_access_enabled = body.guest_access_enabled;
    }

    let slugNext = (current?.guest_slug as string | null)?.trim() || null;

    if (body.regenerate_guest_slug === true) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = generateGuestSlug();
        const { data: clash } = await supabase.from("profiles").select("id").eq("guest_slug", candidate).maybeSingle();
        if (!clash) {
          slugNext = candidate;
          patch.guest_slug = candidate;
          break;
        }
      }
      if (!patch.guest_slug) {
        return NextResponse.json({ error: "Could not allocate guest slug" }, { status: 500 });
      }
    } else if (body.guest_slug !== undefined) {
      if (body.guest_slug === null || body.guest_slug.trim() === "") {
        if (!nextEnabled) {
          patch.guest_slug = null;
          slugNext = null;
        }
        /* Si segueix activat i no hi ha slug, s’assignarà més avall. */
      } else {
        const normalized = normalizeGuestSlug(body.guest_slug);
        if (!isValidGuestSlugCustom(normalized)) {
          return NextResponse.json({ error: "Invalid guest_slug format" }, { status: 400 });
        }
        const { data: clash } = await supabase.from("profiles").select("id").eq("guest_slug", normalized).maybeSingle();
        if (clash && clash.id !== userId) {
          return NextResponse.json({ error: "guest_slug already taken" }, { status: 409 });
        }
        patch.guest_slug = normalized;
        slugNext = normalized;
      }
    }

    if (nextEnabled && !slugNext && !patch.guest_slug) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = generateGuestSlug();
        const { data: clash } = await supabase.from("profiles").select("id").eq("guest_slug", candidate).maybeSingle();
        if (!clash) {
          patch.guest_slug = candidate;
          slugNext = candidate;
          break;
        }
      }
      if (nextEnabled && !patch.guest_slug) {
        return NextResponse.json({ error: "Could not allocate guest slug" }, { status: 500 });
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const { error: upErr } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: row, error: fetchErr } = await supabase
      .from("profiles")
      .select("guest_access_enabled,guest_slug,show_in_guest_directory,guest_display_name")
      .eq("id", userId)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const origin = new URL(request.url).origin;
    const slug = (row?.guest_slug as string | null)?.trim() || null;
    const guestPath = slug ? `${origin}/g/${slug}` : null;

    return NextResponse.json({
      guestAccessEnabled: row?.guest_access_enabled === true,
      guestSlug: slug,
      showInGuestDirectory: row?.show_in_guest_directory === true,
      guestDisplayName: (row?.guest_display_name as string | null)?.trim() || "",
      guestUrl: guestPath
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
