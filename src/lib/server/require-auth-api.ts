import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured, isSupabaseConfigured } from "@/lib/server/supabase-config";

export type AuthResult = { userId: string };

/**
 * Retorna l'UUID d'auth de l'usuari actual o una resposta HTTP d'error.
 * Les rutes que usen service role han de filtrar sempre per aquest `userId`.
 */
export async function requireAuthUserId(): Promise<AuthResult | NextResponse> {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json(
      {
        error: "AUTH_NOT_CONFIGURED",
        message: "Cal definir NEXT_PUBLIC_SUPABASE_ANON_KEY junt amb la URL per habilitar l’inici de sessió."
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return { userId: user.id };
}
