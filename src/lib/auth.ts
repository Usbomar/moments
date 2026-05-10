import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/server/supabase-config";

export interface SessionUser {
  id: string;
  email: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? "" };
}
