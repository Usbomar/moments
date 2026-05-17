import type { Asset } from "@/lib/types";

export function getAssetDate(asset: Asset): Date | null {
  const ms = Date.parse(asset.takenAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

export function calendarDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatMonthLabelCa(d: Date): string {
  const raw = new Intl.DateTimeFormat("ca", { month: "long" }).format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function indicesWithYear(items: Asset[], year: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const d = getAssetDate(items[i]!);
    if (d && d.getFullYear() === year) out.push(i);
  }
  return out;
}

export function indicesWithMonth(items: Asset[], month: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const d = getAssetDate(items[i]!);
    if (d && d.getMonth() === month) out.push(i);
  }
  return out;
}

export function indicesWithCalendarDay(items: Asset[], ref: Date): number[] {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const out: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const d = getAssetDate(items[i]!);
    if (d && d.getFullYear() === y && d.getMonth() === m && d.getDate() === day) out.push(i);
  }
  return out;
}

/** Índexos contigus (en `items`) del mateix dia natural que inclou `index`. */
export function getConsecutiveSameDayRun(items: Asset[], index: number): number[] {
  const ref = getAssetDate(items[index]!);
  if (!ref) return [index];
  const key = calendarDayKey(ref);
  let start = index;
  while (start > 0) {
    const d = getAssetDate(items[start - 1]!);
    if (!d || calendarDayKey(d) !== key) break;
    start -= 1;
  }
  let end = index;
  while (end < items.length - 1) {
    const d = getAssetDate(items[end + 1]!);
    if (!d || calendarDayKey(d) !== key) break;
    end += 1;
  }
  return Array.from({ length: end - start + 1 }, (_, k) => start + k);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function hasCoords(asset: Asset): asset is Asset & { location: { lat: number; lng: number } } {
  const loc = asset.location;
  return Boolean(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));
}

function withinKm(a: Asset, b: Asset, km: number): boolean {
  if (!hasCoords(a) || !hasCoords(b)) return false;
  return haversineKm(a.location.lat, a.location.lng, b.location.lat, b.location.lng) <= km;
}

/** Índexos contigus amb ubicació dins de `radiusKm` respecte a l’asset actual. */
export function getConsecutiveNearbyRun(items: Asset[], index: number, radiusKm: number): number[] {
  const anchor = items[index];
  if (!anchor || !hasCoords(anchor)) return [index];

  let start = index;
  while (start > 0 && withinKm(items[start - 1]!, anchor, radiusKm)) start -= 1;

  let end = index;
  while (end < items.length - 1 && withinKm(items[end + 1]!, anchor, radiusKm)) end += 1;

  const run: number[] = [];
  for (let i = start; i <= end; i += 1) {
    if (hasCoords(items[i]!)) run.push(i);
  }
  return run.length ? run : [index];
}

export const SMART_DAY_MIN_PHOTOS = 6;
export const SMART_LOCATION_MIN_PHOTOS = 5;
export const SMART_LOCATION_RADIUS_KM = 1;
