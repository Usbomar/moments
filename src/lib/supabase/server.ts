import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl } from "@/lib/server/supabase-config";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* Server Component sense mutació de cookies; el middleware refresca la sessió */
        }
      }
    }
  });
}
