import { COLOR_PRESETS } from "@/lib/admin-color-palette";

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

export function colorHueToPreset(hue: number | null | undefined, options: Array<{ label: string; hue: number }>): string {
  if (typeof hue !== "number") return "";
  let closest = options[0] ?? COLOR_PRESETS[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of options) {
    const direct = Math.abs(preset.hue - hue);
    const wrapped = 360 - direct;
    const distance = Math.min(direct, wrapped);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = preset;
    }
  }
  return String(closest.hue);
}

export function hexToHue(hex: string): number | null {
  const clean = hex.trim();
  const valid = /^#([0-9a-f]{6})$/i.test(clean);
  if (!valid) return null;
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
