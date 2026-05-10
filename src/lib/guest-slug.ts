/** Genera un identificador curt per URL de convidat (hex minúscules). */
export function generateGuestSlug(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** Slug personalitzat: minúscules, dígits i guions interns; 2–32 caràcters. */
export function isValidGuestSlugCustom(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (s.length < 2 || s.length > 32) return false;
  return SLUG_RE.test(s);
}

export function normalizeGuestSlug(raw: string): string {
  return raw.trim().toLowerCase();
}
