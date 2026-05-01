const URL_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"] as const;
const SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY" as const;

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getSupabaseUrl(): string {
  for (const key of URL_KEYS) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}

export function getSupabaseConfigStatus() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = readEnv(SERVICE_ROLE_KEY);
  const missingEnv: string[] = [];

  if (!supabaseUrl) {
    missingEnv.push(...URL_KEYS);
  }
  if (!serviceRoleKey) {
    missingEnv.push(SERVICE_ROLE_KEY);
  }

  return {
    configured: missingEnv.length === 0,
    missingEnv
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}
