import type { Asset } from "@/lib/types";

export type GridSortOrder = "taken_desc" | "taken_asc";

export type GridDistribution = "uniform" | "featured";

/** Presets tipus «Fotos»: només estableixen la mida mínima en px de la miniatura (la graella és auto-fill). */
export type GridDensityPreset = "compact" | "balanced" | "prominent";

/** @deprecated Nom del tipus antic; és un preset de densitat. */
export type FeaturedTileSize = GridDensityPreset;

export const GRID_TILE_MIN_PX_ABS_MIN = 80;
export const GRID_TILE_MIN_PX_ABS_MAX = 320;
export const GRID_TILE_MIN_PX_DEFAULT = 160;

/** Valors de px per preset (densa → gran). */
export const GRID_DENSITY_PRESET_TILE_MIN: Record<GridDensityPreset, number> = {
  compact: 128,
  balanced: 160,
  prominent: 208
};

export function normalizeGridDensityPreset(raw: unknown): GridDensityPreset {
  if (raw === "compact" || raw === "balanced" || raw === "prominent") return raw;
  return "balanced";
}

export function normalizeFeaturedTileSize(raw: unknown): GridDensityPreset {
  return normalizeGridDensityPreset(raw);
}

export function clampTileMinPx(px: number): number {
  if (!Number.isFinite(px)) return GRID_TILE_MIN_PX_DEFAULT;
  return Math.min(GRID_TILE_MIN_PX_ABS_MAX, Math.max(GRID_TILE_MIN_PX_ABS_MIN, Math.round(px)));
}

/** Gap derivat del mínim de carril: proporció lleugera, clamp fix. */
export function gridGapForTileMin(tileMinPx: number): number {
  const t = clampTileMinPx(tileMinPx);
  return Math.round(Math.max(6, Math.min(14, t * 0.0625)));
}

/** Percentatge d’escala de la imatge en hover (100 = sense zoom extra). */
export function normalizeTileImageHoverPercent(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return 100;
  return Math.min(130, Math.max(100, Math.round(n)));
}

/** Una foto sense data de captura vàlida va al final; dins aquest grup: pujada més recent primer. */
export function hasValidTakenAt(asset: Asset): boolean {
  const raw = asset.takenAt?.trim();
  if (!raw) return false;
  const t = Date.parse(raw);
  return !Number.isNaN(t);
}

export function compareAssetsForGrid(a: Asset, b: Asset, order: GridSortOrder): number {
  const aOk = hasValidTakenAt(a);
  const bOk = hasValidTakenAt(b);
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;

  if (!aOk && !bOk) {
    const ua = Date.parse(a.uploadedAt) || 0;
    const ub = Date.parse(b.uploadedAt) || 0;
    if (ua !== ub) return ub - ua;
    return a.id.localeCompare(b.id);
  }

  const ta = Date.parse(a.takenAt!) || 0;
  const tb = Date.parse(b.takenAt!) || 0;
  if (ta !== tb) {
    return order === "taken_desc" ? tb - ta : ta - tb;
  }
  return a.id.localeCompare(b.id);
}

export function sortAssetsForGrid(assets: Asset[], order: GridSortOrder): Asset[] {
  return [...assets].sort((a, b) => compareAssetsForGrid(a, b, order));
}

/** Com a màxim una rajola gran per bloc de 12; només entre preferides (la primera preferida del bloc). */
export function assignFeaturedHighlights(assets: Asset[]): boolean[] {
  const out = assets.map(() => false);
  for (let start = 0; start < assets.length; start += 12) {
    const slice = assets.slice(start, start + 12);
    const rel = slice.findIndex((a) => a.favorite);
    if (rel >= 0) out[start + rel] = true;
  }
  return out;
}
