import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/** Default TTL matches previous upload route (5 years). */
const DEFAULT_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365 * 5;

/** Minimum plausible length for a Supabase signed object URL (host + path + token). */
const MIN_SIGNED_URL_LENGTH = 120;

export type StoragePaths = {
  original: string;
  preview: string;
  thumb: string;
};

export type SignedUrls = {
  originalUrl: string;
  previewUrl: string;
  thumbUrl: string;
};

/**
 * Creates signed URLs for three object keys in the same bucket.
 * Throws if any signing step fails (caller maps to HTTP 500).
 */
export async function generateSignedUrls(
  bucket: string,
  paths: StoragePaths,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SEC
): Promise<SignedUrls> {
  const supabase = getSupabaseAdmin();

  const tasks = [
    { key: "original" as const, objectPath: paths.original },
    { key: "preview" as const, objectPath: paths.preview },
    { key: "thumb" as const, objectPath: paths.thumb }
  ];

  const signed = await Promise.all(
    tasks.map(async ({ key, objectPath }) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, ttlSeconds);
      if (error) {
        throw new Error(`Signed URL failed for "${key}" at "${objectPath}": ${error.message}`);
      }
      if (!data?.signedUrl?.trim()) {
        throw new Error(`Empty signedUrl returned for "${key}" at "${objectPath}"`);
      }
      return { key, url: data.signedUrl.trim() };
    })
  );

  const byKey = Object.fromEntries(signed.map((s) => [s.key, s.url])) as Record<
    "original" | "preview" | "thumb",
    string
  >;

  return {
    originalUrl: byKey.original,
    previewUrl: byKey.preview,
    thumbUrl: byKey.thumb
  };
}

/**
 * Heuristic: valid HTTPS URL with a non-trivial `token` query param (Supabase signed URLs).
 */
export function validateSignedUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length < MIN_SIGNED_URL_LENGTH) return false;
  if (trimmed.includes("undefined") || trimmed.includes("null")) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const token = parsed.searchParams.get("token");
  // Supabase uses JWT-like tokens; require some substance.
  if (!token || token.length < 20) return false;

  return true;
}

/**
 * Builds deterministic storage object keys from checksum + filename.
 * Sanitises filename so keys cannot escape folder prefixes (no `/`, no `..`).
 */
export function extractStoragePath(fileName: string, checksum: string): StoragePaths {
  const hash = checksum.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("checksum must be a 64-character lowercase hex SHA-256 string");
  }

  const safeName = sanitizeFileNameForStorage(fileName);

  return {
    original: `original/${hash}-${safeName}`,
    preview: `preview/${hash}.webp`,
    thumb: `thumb/${hash}.webp`
  };
}

function sanitizeFileNameForStorage(fileName: string): string {
  // Only keep the last segment if a path was accidentally passed.
  const base = fileName.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "file";
  // Allow common safe chars; collapse risky ones for Storage keys.
  const cleaned = base.replace(/[^\w.\-()+@% ]/g, "_").replace(/\s+/g, " ").trim();
  const limited = cleaned.slice(0, 200);
  return limited.length > 0 ? limited : "file";
}
