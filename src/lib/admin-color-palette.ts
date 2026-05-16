import { hexEquals, legacyHueToHex, normalizeHex, resolveAssetColorHex } from "@/lib/color-utils";

export const COLOR_PRESETS: Array<{ label: string; hex: string }> = [
  { label: "Rojo", hex: "#e53935" },
  { label: "Rojo anaranjado", hex: "#ff5722" },
  { label: "Naranja", hex: "#fb8c00" },
  { label: "Ámbar", hex: "#ffc107" },
  { label: "Amarillo", hex: "#fdd835" },
  { label: "Lima", hex: "#c0ca33" },
  { label: "Verde lima", hex: "#8bc34a" },
  { label: "Verde", hex: "#43a047" },
  { label: "Verde menta", hex: "#26a69a" },
  { label: "Turquesa", hex: "#00acc1" },
  { label: "Cian", hex: "#00bcd4" },
  { label: "Azul cielo", hex: "#29b6f6" },
  { label: "Azul", hex: "#1e88e5" },
  { label: "Índigo", hex: "#3949ab" },
  { label: "Violeta", hex: "#7e57c2" },
  { label: "Púrpura", hex: "#8e24aa" },
  { label: "Magenta", hex: "#d81b60" },
  { label: "Rosa", hex: "#f06292" },
  { label: "Coral", hex: "#ff7043" },
  { label: "Marrón", hex: "#6d4c41" },
  { label: "Negro", hex: "#212121" },
  { label: "Gris oscuro", hex: "#616161" },
  { label: "Gris", hex: "#9e9e9e" },
  { label: "Gris claro", hex: "#bdbdbd" },
  { label: "Blanco", hex: "#fafafa" }
];

export type CustomColorDef = {
  id: string;
  label: string;
  hex: string;
};

export type PaletteRowKind = "preset" | "custom" | "in_use";

export type PaletteRow = {
  rowId: string;
  label: string;
  hex: string;
  kind: PaletteRowKind;
  customId?: string;
  photoCount: number;
};

const STORAGE_V2 = "moments_admin_color_palette_v2";
const STORAGE_LEGACY = "moments_admin_custom_colors_v1";

export type StoredPalette = {
  custom: CustomColorDef[];
  presetLabels: Record<string, string>;
  /** Presets base (#hex) que l'usuari ha eliminat de la paleta */
  hiddenPresetHexes: string[];
};

export const EMPTY_PALETTE: StoredPalette = {
  custom: [],
  presetLabels: {},
  hiddenPresetHexes: []
};

/** @deprecated Només per migració des de dades antigues */
export function normalizeHue(hue: number): number {
  return Math.min(359, Math.max(0, Math.round(hue)));
}

function hiddenSet(hidden: string[]): Set<string> {
  const out = new Set<string>();
  for (const h of hidden) {
    const n = normalizeHex(h);
    if (n) out.add(n);
  }
  return out;
}

export function loadStoredPalette(): StoredPalette {
  if (typeof window === "undefined") {
    return { ...EMPTY_PALETTE };
  }
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_V2);
    if (rawV2) {
      return sanitizePalette(JSON.parse(rawV2) as Partial<StoredPalette>);
    }
    const legacy = window.localStorage.getItem(STORAGE_LEGACY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Array<{ label?: string; hue?: number }>;
      return {
        custom: sanitizeCustomList(
          parsed.map((x, idx) => ({
            id: `legacy-${idx}-${x.hue ?? 0}`,
            label: x.label,
            hue: x.hue
          }))
        ),
        presetLabels: {},
        hiddenPresetHexes: []
      };
    }
  } catch {
    /* ignore */
  }
  return { ...EMPTY_PALETTE };
}

export function saveStoredPalette(data: StoredPalette): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_V2,
    JSON.stringify({
      custom: data.custom,
      presetLabels: data.presetLabels,
      hiddenPresetHexes: data.hiddenPresetHexes
    })
  );
}

export function sanitizePalette(raw: Partial<StoredPalette> & { hiddenPresetHues?: number[] }): StoredPalette {
  const legacyHidden =
    Array.isArray(raw.hiddenPresetHues) && raw.hiddenPresetHues.length
      ? raw.hiddenPresetHues.map((h) => legacyHueToHex(normalizeHue(h)))
      : [];
  const hiddenMerged = [...(raw.hiddenPresetHexes ?? []), ...legacyHidden];
  return {
    custom: sanitizeCustomList(raw.custom),
    presetLabels: sanitizePresetLabels(raw.presetLabels),
    hiddenPresetHexes: sanitizeHiddenPresets(hiddenMerged)
  };
}

function sanitizeCustomList(raw: unknown): CustomColorDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomColorDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<CustomColorDef> & { hue?: number };
    let hex = normalizeHex(row.hex);
    if (!hex && typeof row.hue === "number" && Number.isFinite(row.hue)) {
      hex = legacyHueToHex(row.hue);
    }
    if (!hex) continue;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID();
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : `Personalitzat`;
    out.push({ id, label, hex });
  }
  return out;
}

function sanitizePresetLabels(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const keyTrim = k.trim();
    let hexKey: string | null = normalizeHex(keyTrim);
    if (!hexKey && /^\d+$/.test(keyTrim)) {
      hexKey = legacyHueToHex(Number(keyTrim));
    }
    if (hexKey) out[hexKey] = v.trim();
  }
  return out;
}

function sanitizeHiddenPresets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    let hex: string | null = null;
    if (typeof v === "number" && Number.isFinite(v)) hex = legacyHueToHex(normalizeHue(v));
    else if (typeof v === "string") hex = normalizeHex(v);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out;
}

export function presetLabel(hex: string, presetLabels: Record<string, string>): string {
  const key = normalizeHex(hex);
  if (!key) return "Color";
  const override = presetLabels[key];
  if (override) return override;
  const base = COLOR_PRESETS.find((p) => hexEquals(p.hex, key));
  return base?.label ?? key;
}

export function visiblePresets(palette: StoredPalette): Array<{ label: string; hex: string }> {
  const hidden = hiddenSet(palette.hiddenPresetHexes);
  return COLOR_PRESETS.filter((p) => {
    const h = normalizeHex(p.hex);
    return h && !hidden.has(h);
  }).map((p) => ({
    label: presetLabel(p.hex, palette.presetLabels),
    hex: normalizeHex(p.hex)!
  }));
}

export function buildColorOptionsFromPalette(palette: StoredPalette): Array<{ label: string; hex: string }> {
  return buildColorOptions(palette.custom, palette.presetLabels, palette.hiddenPresetHexes);
}

export function buildColorOptions(
  custom: CustomColorDef[],
  presetLabels: Record<string, string>,
  hiddenPresetHexes: string[] = []
): Array<{ label: string; hex: string }> {
  const hidden = hiddenSet(hiddenPresetHexes);
  const presetRows = COLOR_PRESETS.filter((p) => {
    const h = normalizeHex(p.hex);
    return h && !hidden.has(h);
  }).map((p) => ({
    label: presetLabel(p.hex, presetLabels),
    hex: normalizeHex(p.hex)!
  }));
  const customRows = custom
    .map((c) => ({ label: c.label, hex: normalizeHex(c.hex) }))
    .filter((c): c is { label: string; hex: string } => c.hex !== null);
  const seen = new Set<string>();
  const merged: Array<{ label: string; hex: string }> = [];
  for (const row of [...customRows, ...presetRows]) {
    if (seen.has(row.hex)) continue;
    seen.add(row.hex);
    merged.push(row);
  }
  return merged;
}

function hexUsedByAssets(assets: Array<{ colorHex?: string | null; colorHue?: number | null }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assets) {
    const hex = resolveAssetColorHex(a);
    if (!hex) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return counts;
}

function isHexInVisiblePalette(hex: string, palette: StoredPalette): boolean {
  const h = normalizeHex(hex);
  if (!h) return false;
  if (palette.custom.some((c) => hexEquals(c.hex, h))) return true;
  if (hiddenSet(palette.hiddenPresetHexes).has(h)) return false;
  return COLOR_PRESETS.some((p) => hexEquals(p.hex, h));
}

export function buildPaletteRows(
  assets: Array<{ colorHex?: string | null; colorHue?: number | null }>,
  palette: StoredPalette
): PaletteRow[] {
  const { custom, presetLabels, hiddenPresetHexes } = palette;
  const hidden = hiddenSet(hiddenPresetHexes);
  const usage = hexUsedByAssets(assets);
  const rows: PaletteRow[] = [];

  for (const p of COLOR_PRESETS) {
    const hex = normalizeHex(p.hex);
    if (!hex || hidden.has(hex)) continue;
    rows.push({
      rowId: `preset-${hex}`,
      label: presetLabel(hex, presetLabels),
      hex,
      kind: "preset",
      photoCount: usage.get(hex) ?? 0
    });
  }

  for (const c of custom) {
    const hex = normalizeHex(c.hex);
    if (!hex) continue;
    rows.push({
      rowId: `custom-${c.id}`,
      label: c.label,
      hex,
      kind: "custom",
      customId: c.id,
      photoCount: usage.get(hex) ?? 0
    });
  }

  for (const [hex, count] of usage) {
    if (isHexInVisiblePalette(hex, palette)) continue;
    rows.push({
      rowId: `in_use-${hex}`,
      label: `En ús (${hex})`,
      hex,
      kind: "in_use",
      photoCount: count
    });
  }

  rows.sort((a, b) => {
    const order = { preset: 0, custom: 1, in_use: 2 } as const;
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    return a.hex.localeCompare(b.hex);
  });

  return rows;
}

export function newCustomColorId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`;
}
