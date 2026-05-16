/** Normalitza a #rrggbb en minúscules; retorna null si no és vàlid. */
export function normalizeHex(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  const m6 = /^#?([0-9a-f]{6})$/i.exec(t);
  if (m6) return `#${m6[1].toLowerCase()}`;
  const m3 = /^#?([0-9a-f]{3})$/i.exec(t);
  if (m3) {
    const [a, b, c] = m3[1].split("");
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return null;
}

export function hexEquals(a: string, b: string): boolean {
  const na = normalizeHex(a);
  const nb = normalizeHex(b);
  return na !== null && na === nb;
}

/** Conversió legacy: to 0–359 amb saturació/lluminositat fixes de l’app antiga. */
export function legacyHueToHex(hue: number): string {
  const h = Math.min(359, Math.max(0, Math.round(hue))) / 360;
  const s = 0.72;
  const l = 0.46;
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: Number.parseInt(n.slice(1, 3), 16),
    g: Number.parseInt(n.slice(3, 5), 16),
    b: Number.parseInt(n.slice(5, 7), 16)
  };
}

/** Distància euclidiana al quadrat en RGB (per triar l’opció de paleta més propera). */
export function hexColorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  const dr = ra.r - rb.r;
  const dg = ra.g - rb.g;
  const db = ra.b - rb.b;
  return dr * dr + dg * dg + db * db;
}

/** Extreu el to 0–359 d’un #RRGGBB (grisos → 0). */
export function hexToHue(hex: string): number | null {
  const clean = normalizeHex(hex);
  if (!clean) return null;
  const r = Number.parseInt(clean.slice(1, 3), 16) / 255;
  const g = Number.parseInt(clean.slice(3, 5), 16) / 255;
  const b = Number.parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  const deg = Math.round(hue * 60);
  return deg < 0 ? deg + 360 : deg;
}

/** Resol el color d’una foto: hex explícit o conversió del hue antic. */
export function resolveAssetColorHex(asset: { colorHex?: string | null; colorHue?: number | null }): string | null {
  const fromHex = normalizeHex(asset.colorHex ?? undefined);
  if (fromHex) return fromHex;
  if (typeof asset.colorHue === "number" && Number.isFinite(asset.colorHue)) {
    return legacyHueToHex(asset.colorHue);
  }
  return null;
}
