/**
 * Extract Supabase Storage object path (within bucket) from a signed URL.
 * Example pathname: /storage/v1/object/sign/fotos/original/abc...-file.jpg
 */
export function objectPathFromSignedUrl(signedUrl: string): string | null {
  const trimmed = signedUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const pathname = u.pathname;
    const marker = "/object/sign/";
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    const rest = pathname.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    if (slash === -1) return null;
    const path = rest.slice(slash + 1);
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}
