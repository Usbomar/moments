export const COLOR_PRESETS: Array<{ label: string; hue: number }> = [
  { label: "Rojo", hue: 0 },
  { label: "Rojo anaranjado", hue: 15 },
  { label: "Naranja", hue: 30 },
  { label: "Ámbar", hue: 45 },
  { label: "Amarillo", hue: 60 },
  { label: "Lima", hue: 75 },
  { label: "Verde lima", hue: 95 },
  { label: "Verde", hue: 120 },
  { label: "Verde menta", hue: 145 },
  { label: "Turquesa", hue: 165 },
  { label: "Cian", hue: 180 },
  { label: "Azul cielo", hue: 200 },
  { label: "Azul", hue: 220 },
  { label: "Índigo", hue: 240 },
  { label: "Violeta", hue: 275 },
  { label: "Púrpura", hue: 290 },
  { label: "Magenta", hue: 310 },
  { label: "Rosa", hue: 330 },
  { label: "Coral", hue: 345 },
  { label: "Marrón", hue: 24 }
];

export type CustomColorDef = {
  id: string;
  label: string;
  hue: number;
};

export type PaletteRowKind = "preset" | "custom" | "in_use";

export type PaletteRow = {
  /** Clau estable per a la fila de la taula */
  rowId: string;
  label: string;
  hue: number;
  kind: PaletteRowKind;
  /** Només per a `custom` */
  customId?: string;
  /** Fotos que usen aquest to (arrodonit) */
  photoCount: number;
};

const STORAGE_V2 = "moments_admin_color_palette_v2";
const STORAGE_LEGACY = "moments_admin_custom_colors_v1";

export type StoredPalette = {
  custom: CustomColorDef[];
  /** Sobreescriu el nom visible d’un preset (clau = hue en string) */
  presetLabels: Record<string, string>;
};

export function normalizeHue(hue: number): number {
  return Math.min(359, Math.max(0, Math.round(hue)));
}

export function loadStoredPalette(): StoredPalette {
  if (typeof window === "undefined") {
    return { custom: [], presetLabels: {} };
  }
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<StoredPalette>;
      return {
        custom: sanitizeCustomList(parsed.custom),
        presetLabels: sanitizePresetLabels(parsed.presetLabels)
      };
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
        presetLabels: {}
      };
    }
  } catch {
    /* ignore */
  }
  return { custom: [], presetLabels: {} };
}

export function saveStoredPalette(data: StoredPalette): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_V2,
    JSON.stringify({
      custom: data.custom,
      presetLabels: data.presetLabels
    })
  );
}

function sanitizeCustomList(raw: unknown): CustomColorDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomColorDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<CustomColorDef>;
    if (typeof row.hue !== "number" || !Number.isFinite(row.hue)) continue;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID();
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : `Personalitzat`;
    out.push({ id, label, hue: normalizeHue(row.hue) });
  }
  return out;
}

function sanitizePresetLabels(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function presetLabel(hue: number, presetLabels: Record<string, string>): string {
  const key = String(normalizeHue(hue));
  const override = presetLabels[key];
  if (override) return override;
  const base = COLOR_PRESETS.find((p) => p.hue === normalizeHue(hue));
  return base?.label ?? `To ${key}°`;
}

/** Opcions per als desplegables de la graella / editor */
export function buildColorOptions(custom: CustomColorDef[], presetLabels: Record<string, string>): Array<{ label: string; hue: number }> {
  const presetRows = COLOR_PRESETS.map((p) => ({
    label: presetLabel(p.hue, presetLabels),
    hue: p.hue
  }));
  const customRows = custom.map((c) => ({ label: c.label, hue: c.hue }));
  const seen = new Set<number>();
  const merged: Array<{ label: string; hue: number }> = [];
  for (const row of [...presetRows, ...customRows]) {
    const h = normalizeHue(row.hue);
    if (seen.has(h)) continue;
    seen.add(h);
    merged.push({ label: row.label, hue: h });
  }
  return merged;
}

function hueUsedByAssets(assets: Array<{ colorHue?: number | null }>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const a of assets) {
    if (typeof a.colorHue !== "number" || !Number.isFinite(a.colorHue)) continue;
    const h = normalizeHue(a.colorHue);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return counts;
}

function isHueInPalette(hue: number, custom: CustomColorDef[], presetLabels: Record<string, string>): boolean {
  const h = normalizeHue(hue);
  if (COLOR_PRESETS.some((p) => p.hue === h)) return true;
  if (custom.some((c) => c.hue === h)) return true;
  return false;
}

/** Llista completa per a Configuració → Colors */
export function buildPaletteRows(
  assets: Array<{ colorHue?: number | null }>,
  custom: CustomColorDef[],
  presetLabels: Record<string, string>
): PaletteRow[] {
  const usage = hueUsedByAssets(assets);
  const rows: PaletteRow[] = [];

  for (const p of COLOR_PRESETS) {
    const h = normalizeHue(p.hue);
    rows.push({
      rowId: `preset-${h}`,
      label: presetLabel(h, presetLabels),
      hue: h,
      kind: "preset",
      photoCount: usage.get(h) ?? 0
    });
  }

  for (const c of custom) {
    const h = normalizeHue(c.hue);
    rows.push({
      rowId: `custom-${c.id}`,
      label: c.label,
      hue: h,
      kind: "custom",
      customId: c.id,
      photoCount: usage.get(h) ?? 0
    });
  }

  for (const [h, count] of usage) {
    if (isHueInPalette(h, custom, presetLabels)) continue;
    rows.push({
      rowId: `in_use-${h}`,
      label: `En ús (${h}°)`,
      hue: h,
      kind: "in_use",
      photoCount: count
    });
  }

  rows.sort((a, b) => {
    const order = { preset: 0, custom: 1, in_use: 2 } as const;
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    return a.hue - b.hue;
  });

  return rows;
}

export function newCustomColorId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`;
}
