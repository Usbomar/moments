import { COLOR_PRESETS } from "@/lib/admin-color-palette";
import { hexColorDistance, hexEquals, normalizeHex } from "@/lib/color-utils";

export { COLOR_PRESETS };

export function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateInputValue(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function parseLocationText(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const [city = "", country = ""] = text.split(",").map((s) => s.trim());
  return { city, country };
}

/** Valor del &lt;select&gt;: hex exacte de paleta o el color triat. */
export function colorHexToPaletteOption(
  hex: string | null | undefined,
  options: Array<{ label: string; hex: string }>
): string {
  const n = normalizeHex(hex ?? "");
  if (!n) return "";
  const exact = options.find((o) => hexEquals(o.hex, n));
  if (exact) return normalizeHex(exact.hex)!;
  if (options.length === 0) return n;
  let closest = options[0]!;
  let best = hexColorDistance(n, closest.hex);
  for (const opt of options) {
    const d = hexColorDistance(n, opt.hex);
    if (d < best) {
      best = d;
      closest = opt;
    }
  }
  return normalizeHex(closest.hex)!;
}
